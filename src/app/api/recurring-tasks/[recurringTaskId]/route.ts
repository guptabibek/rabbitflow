import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { computeNextRun } from '../route'

const updateSchema = z.object({
  templateTitle: z.string().trim().min(1).max(500).optional(),
  templateBody: z.string().max(50000).nullable().optional(),
  templatePriority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
  templateAssigneeId: z.string().trim().min(1).nullable().optional(),
  templateType: z.string().trim().min(1).optional(),
  rrule: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recurringTaskId: string }> }
) {
  try {
    const { recurringTaskId: id } = await params

    const task = await db.recurringTask.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    if (!task) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, task.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    return NextResponse.json(task)
  } catch (error) {
    console.error('Error fetching recurring task:', error)
    return NextResponse.json({ error: 'Failed to fetch recurring task' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recurringTaskId: string }> }
) {
  try {
    const { recurringTaskId: id } = await params

    const task = await db.recurringTask.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, task.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateSchema.parse(body)

    const updateData: Record<string, unknown> = {}
    if (data.templateTitle !== undefined) updateData.templateTitle = data.templateTitle
    if (data.templateBody !== undefined) updateData.templateBody = data.templateBody
    if (data.templatePriority !== undefined) updateData.templatePriority = data.templatePriority
    if (data.templateAssigneeId !== undefined) updateData.templateAssigneeId = data.templateAssigneeId
    if (data.templateType !== undefined) updateData.templateType = data.templateType
    if (data.rrule !== undefined) {
      updateData.rrule = data.rrule
      updateData.nextRunAt = computeNextRun(data.rrule, new Date())
    }
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    const updated = await db.recurringTask.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating recurring task:', error)
    return NextResponse.json({ error: 'Failed to update recurring task' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ recurringTaskId: string }> }
) {
  try {
    const { recurringTaskId: id } = await params

    const task = await db.recurringTask.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!task) {
      return NextResponse.json({ error: 'Recurring task not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, task.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    await db.recurringTask.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting recurring task:', error)
    return NextResponse.json({ error: 'Failed to delete recurring task' }, { status: 500 })
  }
}
