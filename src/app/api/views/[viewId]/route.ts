import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'

const updateViewSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  viewType: z.enum(['list', 'board', 'backlog', 'calendar', 'timeline']).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string()).nullable().optional(),
  sorting: z.array(z.object({ field: z.string(), direction: z.enum(['asc', 'desc']) })).nullable().optional(),
  groupBy: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  order: z.number().int().min(0).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { viewId: id } = await params

    const view = await db.savedView.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    })

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }

    // Access check: owner or shared
    if (view.userId !== auth.user.id && !view.isShared) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(view)
  } catch (error) {
    console.error('Error fetching saved view:', error)
    return NextResponse.json({ error: 'Failed to fetch view' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { viewId: id } = await params

    const existing = await db.savedView.findUnique({
      where: { id },
      select: { userId: true, projectId: true, viewType: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }

    if (existing.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const data = updateViewSchema.parse(body)

    // If setting as default, clear existing default for same viewType
    if (data.isDefault) {
      await db.savedView.updateMany({
        where: {
          projectId: existing.projectId,
          userId: auth.user.id,
          viewType: data.viewType ?? existing.viewType,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      })
    }

    const updated = await db.savedView.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.viewType !== undefined && { viewType: data.viewType }),
        ...(data.filters !== undefined && { filters: data.filters as Prisma.InputJsonValue }),
        ...(data.columns !== undefined && { columns: data.columns as Prisma.InputJsonValue }),
        ...(data.sorting !== undefined && { sorting: data.sorting as Prisma.InputJsonValue }),
        ...(data.groupBy !== undefined && { groupBy: data.groupBy }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.isShared !== undefined && { isShared: data.isShared }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.order !== undefined && { order: data.order }),
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating saved view:', error)
    return NextResponse.json({ error: 'Failed to update view' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ viewId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { viewId: id } = await params

    const existing = await db.savedView.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 })
    }

    if (existing.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.savedView.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting saved view:', error)
    return NextResponse.json({ error: 'Failed to delete view' }, { status: 500 })
  }
}
