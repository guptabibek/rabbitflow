import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches, invalidateSprintCaches } from '@/lib/domain/cache'
import { buildHierarchyPath, buildHierarchySegments } from '@/lib/domain/paths'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'

const updateIterationSchema = z.object({
  teamId: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
  goal: z.string().nullable().optional(),
  status: z
    .enum(['Planned', 'Active', 'Closed', 'planning', 'active', 'completed'])
    .optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  iterationType: z.enum(['sprint', 'release', 'milestone']).optional(),
  parentId: z.string().nullable().optional(),
})

function normalizeIterationStatus(status: string | undefined) {
  if (!status || status === 'planning') return 'Planned'
  if (status === 'active') return 'Active'
  if (status === 'completed') return 'Closed'
  return status
}

async function updateDescendantPaths(iterationId: string, currentPath: string) {
  const children = await db.iteration.findMany({
    where: { parentId: iterationId },
    select: { id: true, name: true },
  })

  for (const child of children) {
    const path = buildHierarchyPath(child.name, currentPath)
    await db.iteration.update({
      where: { id: child.id },
      data: {
        path,
        pathSegments: buildHierarchySegments(child.name, currentPath),
      },
    })
    await updateDescendantPaths(child.id, path)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ iterationId: string }> }
) {
  try {
    const { iterationId: id } = await params
    const iteration = await db.iteration.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true, color: true } },
        issues: {
          include: {
            assignee: { select: { id: true, name: true, avatar: true } },
            labels: {
              include: {
                label: { select: { id: true, name: true, color: true } },
              },
            },
          },
        },
        children: true,
        parent: true,
        _count: { select: { issues: true } },
      },
    })

    if (!iteration) {
      return NextResponse.json({ error: 'Iteration not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, iteration.projectId, 'project:read')
    if (!auth.ok) return auth.response

    return NextResponse.json(iteration)
  } catch (error) {
    console.error('Error fetching iteration:', error)
    return NextResponse.json({ error: 'Failed to fetch iteration' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ iterationId: string }> }
) {
  try {
    const { iterationId: id } = await params
    const body = await request.json()
    const data = updateIterationSchema.parse(body)

    const existing = await db.iteration.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        name: true,
        path: true,
        status: true,
        parentId: true,
        teamId: true,
        iterationType: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Iteration not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'sprint:manage')
    if (!auth.ok) return auth.response

    const nextIterationType = data.iterationType || existing.iterationType
    const nextTeamId = data.teamId !== undefined ? data.teamId : existing.teamId

    if (nextIterationType === 'sprint' && !nextTeamId) {
      return NextResponse.json(
        { error: 'A sprint must belong to a team' },
        { status: 400 }
      )
    }

    if (nextTeamId) {
      const team = await db.team.findUnique({
        where: { id: nextTeamId },
        select: { projectId: true },
      })

      if (!team || team.projectId !== existing.projectId) {
        return NextResponse.json(
          { error: 'Team must belong to the same project' },
          { status: 400 }
        )
      }
    }

    let parentPath: string | null = null

    if (data.parentId) {
      if (data.parentId === existing.id) {
        return NextResponse.json(
          { error: 'Iteration cannot be its own parent' },
          { status: 400 }
        )
      }

      const parent = await db.iteration.findUnique({
        where: { id: data.parentId },
        select: { projectId: true, path: true },
      })

      if (!parent || parent.projectId !== existing.projectId) {
        return NextResponse.json(
          { error: 'Parent iteration must belong to the same project' },
          { status: 400 }
        )
      }

      parentPath = parent.path
    } else if (data.parentId === null) {
      parentPath = null
    } else if (existing.parentId) {
      const parent = await db.iteration.findUnique({
        where: { id: existing.parentId },
        select: { path: true },
      })
      parentPath = parent?.path ?? null
    }

    const nextName = data.name?.trim() || existing.name
    const nextPath = buildHierarchyPath(nextName, parentPath)

    const iteration = await db.iteration.update({
      where: { id },
      data: {
        teamId: data.teamId !== undefined ? data.teamId : existing.teamId,
        name: nextName,
        path: nextPath,
        pathSegments: buildHierarchySegments(nextName, parentPath),
        goal: data.goal !== undefined ? data.goal?.trim() || null : undefined,
        status: data.status !== undefined ? normalizeIterationStatus(data.status) : undefined,
        startDate:
          data.startDate !== undefined ? (data.startDate ? new Date(data.startDate) : null) : undefined,
        endDate:
          data.endDate !== undefined ? (data.endDate ? new Date(data.endDate) : null) : undefined,
        iterationType: data.iterationType,
        parentId: data.parentId !== undefined ? data.parentId : existing.parentId,
      },
      include: {
        team: { select: { id: true, name: true, color: true } },
        _count: { select: { issues: true } },
      },
    })

    if (existing.iterationType === 'sprint' && existing.status !== 'Active' && iteration.status === 'Active') {
      void dispatchWebhookEvent(existing.projectId, 'sprint.started', {
        iteration: {
          id: iteration.id,
          name: iteration.name,
          status: iteration.status,
          teamId: iteration.teamId,
        },
        actorUserId: auth.actor.userId,
      })
    }

    if (existing.iterationType === 'sprint' && existing.status !== 'Closed' && iteration.status === 'Closed') {
      void dispatchWebhookEvent(existing.projectId, 'sprint.completed', {
        iteration: {
          id: iteration.id,
          name: iteration.name,
          status: iteration.status,
          teamId: iteration.teamId,
        },
        actorUserId: auth.actor.userId,
      })
    }

    await updateDescendantPaths(iteration.id, iteration.path ?? iteration.name)
    await invalidateProjectCaches(existing.projectId)
    await invalidateSprintCaches(existing.projectId, existing.id)

    return NextResponse.json(iteration)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating iteration:', error)
    return NextResponse.json({ error: 'Failed to update iteration' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ iterationId: string }> }
) {
  try {
    const { iterationId: id } = await params

    const existing = await db.iteration.findUnique({
      where: { id },
      select: { projectId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Iteration not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'sprint:manage')
    if (!auth.ok) return auth.response

    await db.iteration.delete({ where: { id } })
    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting iteration:', error)
    return NextResponse.json({ error: 'Failed to delete iteration' }, { status: 500 })
  }
}
