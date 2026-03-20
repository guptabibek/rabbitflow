import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'

const projectRoleSchema = z
  .enum(['owner', 'admin', 'member', 'Admin', 'PM', 'Dev'])
  .transform((role) => {
    if (role === 'owner' || role === 'admin') return 'Admin'
    if (role === 'member') return 'Dev'
    return role
  })

const ADMIN_ROLES = new Set(['Admin', 'owner', 'admin'])

async function ensureProjectMember(projectId: string, memberId: string) {
  return db.projectMember.findFirst({
    where: { id: memberId, projectId },
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
}

async function countProjectAdmins(projectId: string) {
  const members = await db.projectMember.findMany({
    where: { projectId },
    select: { role: true },
  })

  return members.filter((member) => ADMIN_ROLES.has(member.role)).length
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: projectId, memberId } = await params
    const body = await request.json()

    const schema = z.object({
      role: projectRoleSchema,
    })

    const { role } = schema.parse(body)

    const auth = await requireProjectPermission(
      request,
      projectId,
      'project:members:manage'
    )
    if (!auth.ok) return auth.response

    const existingMember = await ensureProjectMember(projectId, memberId)
    if (!existingMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (ADMIN_ROLES.has(existingMember.role) && !ADMIN_ROLES.has(role)) {
      const adminCount = await countProjectAdmins(projectId)
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Projects must retain at least one Admin' },
          { status: 400 }
        )
      }
    }

    const member = await db.projectMember.update({
      where: { id: existingMember.id },
      data: { role },
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

    await invalidateProjectCaches(projectId)

    return NextResponse.json(member)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating member:', error)
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: projectId, memberId } = await params

    const auth = await requireProjectPermission(
      request,
      projectId,
      'project:members:manage'
    )
    if (!auth.ok) return auth.response

    const existingMember = await ensureProjectMember(projectId, memberId)
    if (!existingMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    if (ADMIN_ROLES.has(existingMember.role)) {
      const adminCount = await countProjectAdmins(projectId)
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Projects must retain at least one Admin' },
          { status: 400 }
        )
      }
    }

    await db.projectMember.delete({
      where: { id: existingMember.id },
    })

    await invalidateProjectCaches(projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }
}
