import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { buildHierarchyPath, buildHierarchySegments } from '@/lib/domain/paths'
import { invalidateProjectCaches } from '@/lib/domain/cache'

const updateAreaSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().nullable().optional(),
})

async function updateDescendantPaths(areaId: string, currentPath: string) {
  const children = await db.area.findMany({
    where: { parentId: areaId },
    select: { id: true, name: true },
  })

  for (const child of children) {
    const path = buildHierarchyPath(child.name, currentPath)
    await db.area.update({
      where: { id: child.id },
      data: {
        path,
        pathSegments: buildHierarchySegments(child.name, currentPath),
      },
    })
    await updateDescendantPaths(child.id, path)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ areaId: string }> }
) {
  try {
    const { areaId: id } = await params
    const body = await request.json()
    const data = updateAreaSchema.parse(body)

    const existing = await db.area.findUnique({
      where: { id },
      select: { id: true, projectId: true, name: true, path: true, parentId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    let parentPath: string | null = null

    if (data.parentId) {
      if (data.parentId === id) {
        return NextResponse.json({ error: 'Area cannot be its own parent' }, { status: 400 })
      }

      const parent = await db.area.findUnique({
        where: { id: data.parentId },
        select: { id: true, projectId: true, path: true },
      })

      if (!parent || parent.projectId !== existing.projectId) {
        return NextResponse.json(
          { error: 'Parent area must belong to the same project' },
          { status: 400 }
        )
      }

      parentPath = parent.path
    } else if (data.parentId === null) {
      parentPath = null
    } else if (existing.parentId) {
      const parent = await db.area.findUnique({
        where: { id: existing.parentId },
        select: { path: true },
      })
      parentPath = parent?.path ?? null
    }

    const nextName = data.name?.trim() || existing.name
    const nextPath = buildHierarchyPath(nextName, parentPath)

    const area = await db.area.update({
      where: { id },
      data: {
        name: nextName,
        parentId: data.parentId !== undefined ? data.parentId : existing.parentId,
        path: nextPath,
        pathSegments: buildHierarchySegments(nextName, parentPath),
      },
    })

    await updateDescendantPaths(area.id, area.path ?? area.name)
    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json(area)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating area:', error)
    return NextResponse.json({ error: 'Failed to update area' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ areaId: string }> }
) {
  try {
    const { areaId: id } = await params
    const existing = await db.area.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    const children = await db.area.findMany({
      where: { parentId: id },
      select: { id: true, name: true },
    })

    await db.area.delete({ where: { id } })

    for (const child of children) {
      const path = buildHierarchyPath(child.name)
      await db.area.update({
        where: { id: child.id },
        data: {
          path,
          pathSegments: buildHierarchySegments(child.name),
        },
      })
      await updateDescendantPaths(child.id, path)
    }

    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting area:', error)
    return NextResponse.json({ error: 'Failed to delete area' }, { status: 500 })
  }
}
