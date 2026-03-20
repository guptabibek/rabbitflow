import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'
import { invalidateProjectCaches } from '@/lib/domain/cache'

const teamMemberSchema = z.object({
  userId: z.string(),
  role: z.string().min(1).max(40).default('member'),
})

const createTeamSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
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
  members: z.array(teamMemberSchema).default([]),
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(projectId, auth.actor.userId)

    const teams = await db.team.findMany({
      where: { projectId },
      orderBy: [{ name: 'asc' }],
      include: {
        lead: { select: { id: true, name: true, email: true, avatar: true } },
        members: {
          orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
        _count: {
          select: { iterations: true },
        },
      },
    })

    return NextResponse.json(teams)
  } catch (error) {
    console.error('Error fetching teams:', error)
    return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createTeamSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:members:manage')
    if (!auth.ok) return auth.response

    const members = dedupeMembers(data.members, data.leadId ?? null)
    const validationError = await validateProjectMembers(data.projectId, members)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const team = await db.team.create({
      data: {
        projectId: data.projectId,
        name: data.name.trim(),
        key: data.key?.trim() || null,
        description: data.description?.trim() || null,
        color: data.color || '#0f766e',
        leadId: data.leadId ?? null,
        createdById: auth.actor.userId,
        members: members.length
          ? {
              create: members.map((member) => ({
                userId: member.userId,
                role: member.role,
              })),
            }
          : undefined,
      },
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

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json(team, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error creating team:', error)
    return NextResponse.json({ error: 'Failed to create team' }, { status: 500 })
  }
}
