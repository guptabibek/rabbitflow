import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { createAuditLog } from '@/lib/domain/audit'

const updateStateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).optional(),
  category: z.enum(['New', 'In Progress', 'Done']).optional(),
  isFinal: z.boolean().optional(),
  order: z.number().int().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const data = updateStateSchema.parse(body)

    const existing = await db.state.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        name: true,
        color: true,
        category: true,
        isFinal: true,
        order: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'State not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    const updated = await db.state.update({
      where: { id },
      data: {
        name: data.name,
        color: data.color,
        category: data.category,
        isFinal: data.isFinal,
        order: data.order,
      },
    })

    await createAuditLog({
      projectId: existing.projectId,
      userId: auth.actor.userId,
      action: 'state_config_updated',
      details: {
        stateId: existing.id,
        before: existing,
        after: {
          name: updated.name,
          color: updated.color,
          category: updated.category,
          isFinal: updated.isFinal,
          order: updated.order,
        },
      },
    })

    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating state:', error)
    return NextResponse.json({ error: 'Failed to update state' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.state.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        name: true,
        _count: {
          select: {
            issues: true,
            workItemTypeMappings: true,
            outgoingTransitions: true,
            incomingTransitions: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'State not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'masterdata:manage')
    if (!auth.ok) return auth.response

    if (existing._count.issues > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a state used by existing work items' },
        { status: 409 }
      )
    }

    await db.state.delete({ where: { id } })

    await createAuditLog({
      projectId: existing.projectId,
      userId: auth.actor.userId,
      action: 'state_config_deleted',
      details: {
        stateId: existing.id,
        name: existing.name,
      },
    })

    await invalidateProjectCaches(existing.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting state:', error)
    return NextResponse.json({ error: 'Failed to delete state' }, { status: 500 })
  }
}
