import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createViewSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(100),
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

    const views = await db.savedView.findMany({
      where: {
        projectId,
        OR: [
          { userId: auth.actor.userId },
          { isShared: true },
        ],
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    return NextResponse.json(views)
  } catch (error) {
    console.error('Error fetching saved views:', error)
    return NextResponse.json({ error: 'Failed to fetch saved views' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createViewSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:read')
    if (!auth.ok) return auth.response

    // Enforce per-user limit
    const existingCount = await db.savedView.count({
      where: { projectId: data.projectId, userId: auth.actor.userId },
    })

    if (existingCount >= 50) {
      return NextResponse.json(
        { error: 'Maximum 50 saved views per project per user' },
        { status: 400 }
      )
    }

    // If setting as default, clear existing default
    if (data.isDefault) {
      await db.savedView.updateMany({
        where: {
          projectId: data.projectId,
          userId: auth.actor.userId,
          viewType: data.viewType ?? 'list',
          isDefault: true,
        },
        data: { isDefault: false },
      })
    }

    const maxOrder = await db.savedView.aggregate({
      where: { projectId: data.projectId, userId: auth.actor.userId },
      _max: { order: true },
    })

    const view = await db.savedView.create({
      data: {
        projectId: data.projectId,
        userId: auth.actor.userId,
        name: data.name,
        description: data.description,
        viewType: data.viewType ?? 'list',
        filters: (data.filters ?? {}) as Prisma.InputJsonValue,
        columns: data.columns as Prisma.InputJsonValue ?? undefined,
        sorting: data.sorting as Prisma.InputJsonValue ?? undefined,
        groupBy: data.groupBy,
        isDefault: data.isDefault ?? false,
        isShared: data.isShared ?? false,
        color: data.color,
        icon: data.icon,
        order: (maxOrder._max.order ?? 0) + 1,
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    return NextResponse.json(view, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating saved view:', error)
    return NextResponse.json({ error: 'Failed to create saved view' }, { status: 500 })
  }
}
