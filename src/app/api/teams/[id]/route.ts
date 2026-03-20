import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'

const teamMemberSchema = z.object({
  userId: z.string(),
  role: z.string().min(1).max(40).default('member'),
})

const updateTeamSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  key: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, 'Key may only contain letters, numbers, underscores, and hyphens')
    .nullable()
    .optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().min(4).max(20).optional(),
  leadId: z.string().nullable().optional(),
  members: z.array(teamMemberSchema).optional(),
})

function dedupeMembers(
  members: Array<{ userId: string; role: string }>,
  leadId?: string | null
) {
  const deduped = new Map<string, { userId: string; role: string }>()

  for (const member of members) {
    deduped.set(member.userId, {
      userId: member.userId,
      role: member.role || 'member',
    })
  }

  if (leadId) {
    deduped.set(leadId, {
      userId: leadId,
      role: 'lead',
    })
  }

  return Array.from(deduped.values())
}

async function validateProjectMembers(
  projectId: string,
  members: Array<{ userId: string; role: string }>
) {
  if (members.length === 0) return null

  const validMembers = await db.projectMember.findMany({
    where: {
      projectId,
      userId: { in: members.map((member) => member.userId) },
    },
    select: { userId: true },
  })

  if (validMembers.length !== new Set(members.map((member) => member.userId)).size) {
    return 'Team members must belong to the selected project'
  }

  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const team = await db.team.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, email: true, avatar: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
        iterations: {
          orderBy: { startDate: 'desc' },
          select: {
            id: true,
            name: true,
            path: true,
            status: true,
            startDate: true,
            endDate: true,
            iterationType: true,
          },
        },
      },
    })

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, team.projectId, 'project:read')
    if (!auth.ok) return auth.response

    return NextResponse.json(team)
  } catch (error) {
    console.error('Error fetching team:', error)
    return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = updateTeamSchema.parse(body)

    const existing = await db.team.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      existing.projectId,
      'project:members:manage'
    )
    if (!auth.ok) return auth.response

    const members = data.members ? dedupeMembers(data.members, data.leadId) : null
    const validationError = members
      ? await validateProjectMembers(existing.projectId, members)
      : null

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const team = await db.$transaction(async (tx) => {
      const updatedTeam = await tx.team.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          key: data.key === undefined ? undefined : data.key?.trim() || null,
          description:
            data.description === undefined ? undefined : data.description?.trim() || null,
          color: data.color,
          leadId: data.leadId,
        },
        include: {
          lead: { select: { id: true, name: true, email: true, avatar: true } },
        },
      })

      if (members) {
        await tx.teamMember.deleteMany({ where: { teamId: id } })
        if (members.length > 0) {
          await tx.teamMember.createMany({
            data: members.map((member) => ({
              teamId: id,
              userId: member.userId,
              role: member.role,
            })),
          })
        }
      }

      return tx.team.findUnique({
        where: { id: updatedTeam.id },
        include: {
          lead: { select: { id: true, name: true, email: true, avatar: true } },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
          },
          _count: {
            select: { iterations: true },
          },
        },
      })
    })

    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json(team)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating team:', error)
    return NextResponse.json({ error: 'Failed to update team' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.team.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        _count: {
          select: { iterations: true },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      existing.projectId,
      'project:members:manage'
    )
    if (!auth.ok) return auth.response

    if (existing._count.iterations > 0) {
      return NextResponse.json(
        {
          error:
            'This team is assigned to existing sprints or iterations. Reassign those items before deleting the team.',
        },
        { status: 409 }
      )
    }

    await db.team.delete({ where: { id } })
    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting team:', error)
    return NextResponse.json({ error: 'Failed to delete team' }, { status: 500 })
  }
}
