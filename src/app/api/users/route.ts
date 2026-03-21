import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import {
  requireAuthenticatedUser,
  requireProjectPermission,
  requireSystemAdmin,
} from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { z } from 'zod'

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  avatar: z.string().optional(),
  globalRole: z.enum(['admin', 'member']).optional(),
  addToProject: z.boolean().optional(),
  projectId: z.string().optional(),
  projectRole: z.enum(['Admin', 'PM', 'Dev', 'QA', 'Viewer']).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const excludeProjectId = searchParams.get('excludeProjectId')
    const search = searchParams.get('search')

    // Return users NOT in a specific project (for "add member" search)
    if (excludeProjectId) {
      const permission = await requireProjectPermission(
        request,
        excludeProjectId,
        'project:members:manage'
      )
      if (!permission.ok) return permission.response

      const existingMemberIds = await db.projectMember.findMany({
        where: { projectId: excludeProjectId },
        select: { userId: true },
      })
      const excludeIds = existingMemberIds.map((m) => m.userId)

      const users = await db.user.findMany({
        where: {
          id: { notIn: excludeIds },
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 20,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          globalRole: true,
        },
      })

      return NextResponse.json(users)
    }

    if (projectId) {
      const permission = await requireProjectPermission(
        request,
        projectId,
        'project:read'
      )
      if (!permission.ok) return permission.response

      const members = await db.projectMember.findMany({
        where: { projectId },
        orderBy: { user: { name: 'asc' } },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
              globalRole: true,
            },
          },
        },
      })

      return NextResponse.json(
        members.map((member) => ({
          ...member.user,
          projectRole: member.role,
        }))
      )
    }

    if (auth.user.globalRole === 'admin') {
      const users = await db.user.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          globalRole: true,
        },
      })
      return NextResponse.json(users)
    }

    return NextResponse.json([auth.user])
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createUserSchema.parse(body)
    const normalizedEmail = data.email.trim().toLowerCase()
    const shouldAddToProject = Boolean(data.addToProject)

    if (shouldAddToProject) {
      if (!data.projectId) {
        return NextResponse.json(
          { error: 'projectId is required when addToProject is true' },
          { status: 400 }
        )
      }

      const permission = await requireProjectPermission(
        request,
        data.projectId,
        'project:members:manage'
      )
      if (!permission.ok) return permission.response
    } else {
      const admin = await requireSystemAdmin(request)
      if (!admin.ok) return admin.response
    }

    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(data.password)

    const user = await db.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        avatar: data.avatar,
        passwordHash,
        globalRole: data.globalRole ?? 'member',
        mustResetPassword: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        globalRole: true,
      },
    })

    if (shouldAddToProject && data.projectId) {
      await db.projectMember.create({
        data: {
          projectId: data.projectId,
          userId: user.id,
          role: data.projectRole ?? 'Dev',
        },
      })

      await invalidateProjectCaches(data.projectId)
    }

    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
