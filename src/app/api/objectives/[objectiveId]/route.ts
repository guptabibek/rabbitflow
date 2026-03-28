import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const updateObjectiveSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['draft', 'active', 'completed', 'cancelled']).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ objectiveId: string }> }
) {
  try {
    const { objectiveId: id } = await params

    const objective = await db.objective.findUnique({
      where: { id },
      include: {
        keyResults: { orderBy: { createdAt: 'asc' } },
        owner: { select: { id: true, name: true, email: true } },
        children: {
          include: {
            keyResults: true,
            owner: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!objective) {
      return NextResponse.json({ error: 'Objective not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, objective.projectId, 'project:read')
    if (!auth.ok) return auth.response

    return NextResponse.json(objective)
  } catch (error) {
    console.error('Error fetching objective:', error)
    return NextResponse.json({ error: 'Failed to fetch objective' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ objectiveId: string }> }
) {
  try {
    const { objectiveId: id } = await params

    const objective = await db.objective.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!objective) {
      return NextResponse.json({ error: 'Objective not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, objective.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateObjectiveSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.status !== undefined) updateData.status = data.status
    if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null
    if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null
    if (data.parentId !== undefined) updateData.parentId = data.parentId

    const updated = await db.objective.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating objective:', error)
    return NextResponse.json({ error: 'Failed to update objective' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ objectiveId: string }> }
) {
  try {
    const { objectiveId: id } = await params

    const objective = await db.objective.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!objective) {
      return NextResponse.json({ error: 'Objective not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, objective.projectId, 'project:update')
    if (!auth.ok) return auth.response

    await db.$transaction([
      db.keyResult.deleteMany({ where: { objectiveId: id } }),
      db.objective.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting objective:', error)
    return NextResponse.json({ error: 'Failed to delete objective' }, { status: 500 })
  }
}
