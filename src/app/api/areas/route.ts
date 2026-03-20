import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { buildHierarchyPath, buildHierarchySegments } from '@/lib/domain/paths'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'

const createAreaSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(120),
  parentId: z.string().nullable().optional(),
})

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

    const areas = await db.area.findMany({
      where: { projectId },
      orderBy: [{ path: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json(areas)
  } catch (error) {
    console.error('Error fetching areas:', error)
    return NextResponse.json({ error: 'Failed to fetch areas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createAreaSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    let parentPath: string | null = null

    if (data.parentId) {
      const parent = await db.area.findUnique({
        where: { id: data.parentId },
        select: { id: true, projectId: true, path: true },
      })

      if (!parent || parent.projectId !== data.projectId) {
        return NextResponse.json(
          { error: 'Parent area must belong to the same project' },
          { status: 400 }
        )
      }

      parentPath = parent.path
    }

    const area = await db.area.create({
      data: {
        projectId: data.projectId,
        name: data.name.trim(),
        parentId: data.parentId ?? null,
        path: buildHierarchyPath(data.name.trim(), parentPath),
        pathSegments: buildHierarchySegments(data.name.trim(), parentPath),
      },
    })

    await invalidateProjectCaches(data.projectId)

    return NextResponse.json(area, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error creating area:', error)
    return NextResponse.json({ error: 'Failed to create area' }, { status: 500 })
  }
}
