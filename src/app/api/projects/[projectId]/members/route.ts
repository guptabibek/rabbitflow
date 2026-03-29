import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db, isUniqueConstraintError } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'

const projectRoleSchema = z
  .enum(['owner', 'admin', 'member', 'Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'])
  .transform((role) => {
    if (role === 'owner' || role === 'admin') return 'Admin'
    if (role === 'member') return 'Dev'
    return role
  })

const permissionGrantSchema = z.array(
  z.enum([
    'operations:manage',
    'branding:manage',
    'test:manage',
    'project:members:manage',
    'masterdata:manage',
    'acl:manage',
  ])
)

const addMemberSchema = z.object({
  userId: z.string(),
  role: projectRoleSchema.default('Dev'),
  extraPermissions: permissionGrantSchema.optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const members = await db.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            globalRole: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    })

    return NextResponse.json(members)
  } catch (error) {
    console.error('Error fetching members:', error)
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const body = await request.json()
    const { userId, role, extraPermissions } = addMemberSchema.parse(body)

    const auth = await requireProjectPermission(
      request,
      projectId,
      'project:members:manage'
    )
    if (!auth.ok) return auth.response

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const existingMember = await db.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId },
      },
    })

    if (existingMember) {
      return NextResponse.json(
        { error: 'User is already a member of this project' },
        { status: 409 }
      )
    }

    const member = await db.projectMember.create({
      data: {
        projectId,
        userId,
        role,
        extraPermissions: extraPermissions ?? [],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            globalRole: true,
          },
        },
      },
    })

    void dispatchWebhookEvent(projectId, 'member.added', {
      member: {
        id: member.id,
        userId: member.userId,
        role: member.role,
      },
      actorUserId: auth.actor.userId,
    })

    await invalidateProjectCaches(projectId)

    return NextResponse.json(member, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }
    if (isUniqueConstraintError(error, ['projectId', 'userId'])) {
      return NextResponse.json(
        { error: 'User is already a member of this project' },
        { status: 409 }
      )
    }

    console.error('Error adding member:', error)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}
