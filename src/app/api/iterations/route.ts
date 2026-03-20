import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { buildHierarchyPath, buildHierarchySegments } from '@/lib/domain/paths'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'

const createIterationSchema = z.object({
  projectId: z.string(),
  teamId: z.string().nullable().optional(),
  name: z.string().min(1),
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const iterationType = searchParams.get('iterationType')
    const teamId = searchParams.get('teamId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(projectId, auth.actor.userId)

    const where: Record<string, unknown> = { projectId }
    if (iterationType) where.iterationType = iterationType
    if (teamId) where.teamId = teamId

    const iterations = await db.iteration.findMany({
      where,
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
      include: {
        team: { select: { id: true, name: true, color: true } },
        _count: { select: { issues: true } },
        children: {
          orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            path: true,
            status: true,
            startDate: true,
            endDate: true,
            teamId: true,
          },
        },
      },
    })

    return NextResponse.json(iterations)
  } catch (error) {
    console.error('Error fetching iterations:', error)
    return NextResponse.json({ error: 'Failed to fetch iterations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createIterationSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'sprint:manage')
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(data.projectId, auth.actor.userId)

    if (data.iterationType === 'sprint' && !data.teamId) {
      return NextResponse.json(
        { error: 'A sprint must belong to a team' },
        { status: 400 }
      )
    }

    let parentPath: string | null = null

    if (data.parentId) {
      const parent = await db.iteration.findUnique({
        where: { id: data.parentId },
        select: { id: true, projectId: true, path: true },
      })

      if (!parent || parent.projectId !== data.projectId) {
        return NextResponse.json(
          { error: 'Parent iteration must belong to the same project' },
          { status: 400 }
        )
      }

      parentPath = parent.path
    }

    if (data.teamId) {
      const team = await db.team.findUnique({
        where: { id: data.teamId },
        select: { projectId: true },
      })

      if (!team || team.projectId !== data.projectId) {
        return NextResponse.json(
          { error: 'Team must belong to the same project' },
          { status: 400 }
        )
      }
    }

    const iteration = await db.iteration.create({
      data: {
        projectId: data.projectId,
        teamId: data.teamId ?? null,
        name: data.name.trim(),
        path: buildHierarchyPath(data.name.trim(), parentPath),
        pathSegments: buildHierarchySegments(data.name.trim(), parentPath),
        goal: data.goal?.trim() || null,
        status: normalizeIterationStatus(data.status),
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        iterationType: data.iterationType || 'sprint',
        parentId: data.parentId ?? null,
      },
      include: {
        team: { select: { id: true, name: true, color: true } },
        _count: { select: { issues: true } },
      },
    })

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json(iteration, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error creating iteration:', error)
    return NextResponse.json({ error: 'Failed to create iteration' }, { status: 500 })
  }
}
