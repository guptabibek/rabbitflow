import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createRetroSchema = z.object({
  projectId: z.string().trim().min(1),
  iterationId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
})

const addItemSchema = z.object({
  retroId: z.string().trim().min(1),
  category: z.enum(['went_well', 'to_improve', 'action_item']),
  content: z.string().trim().min(1).max(2000),
})

// GET /api/retrospectives?projectId=xxx or ?iterationId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const iterationId = searchParams.get('iterationId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const where: Record<string, unknown> = { projectId }
    if (iterationId) where.iterationId = iterationId

    const retros = await db.retrospective.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        iteration: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    })

    return NextResponse.json(retros)
  } catch (error) {
    console.error('Error fetching retrospectives:', error)
    return NextResponse.json({ error: 'Failed to fetch retrospectives' }, { status: 500 })
  }
}

// POST /api/retrospectives - Create retro or add item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Add item to existing retro
    if (body.retroId) {
      const data = addItemSchema.parse(body)

      const retro = await db.retrospective.findUnique({
        where: { id: data.retroId },
        select: { id: true, projectId: true, status: true },
      })

      if (!retro) {
        return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
      }

      if (retro.status === 'closed') {
        return NextResponse.json({ error: 'Cannot add items to a closed retrospective' }, { status: 400 })
      }

      const auth = await requireProjectPermission(request, retro.projectId, 'project:read')
      if (!auth.ok) return auth.response

      const item = await db.retroItem.create({
        data: {
          retrospectiveId: data.retroId,
          authorId: auth.actor.userId,
          category: data.category,
          content: data.content,
        },
      })

      return NextResponse.json(item, { status: 201 })
    }

    // Create new retro
    const data = createRetroSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const iteration = await db.iteration.findUnique({
      where: { id: data.iterationId },
      select: { id: true, projectId: true },
    })

    if (!iteration || iteration.projectId !== data.projectId) {
      return NextResponse.json(
        { error: 'Iteration must belong to the selected project' },
        { status: 400 }
      )
    }

    const retro = await db.retrospective.create({
      data: {
        projectId: data.projectId,
        iterationId: data.iterationId,
        facilitatorId: auth.actor.userId,
        title: data.title,
      },
    })

    return NextResponse.json(retro, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating retrospective:', error)
    return NextResponse.json({ error: 'Failed to create retrospective' }, { status: 500 })
  }
}
