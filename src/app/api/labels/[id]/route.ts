import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateProjectCaches } from '@/lib/domain/cache'
import { z } from 'zod'

const updateLabelSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
})

async function resolveLabel(id: string) {
  return db.label.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
    },
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const label = await resolveLabel(id)

    if (!label) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      label.projectId,
      'workitem:update'
    )
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateLabelSchema.parse(body)

    const updated = await db.label.update({
      where: { id },
      data,
    })

    await invalidateProjectCaches(label.projectId)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }
    console.error('Error updating label:', error)
    return NextResponse.json({ error: 'Failed to update label' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const label = await resolveLabel(id)

    if (!label) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      label.projectId,
      'workitem:update'
    )
    if (!auth.ok) return auth.response

    await db.label.delete({
      where: { id },
    })

    await invalidateProjectCaches(label.projectId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting label:', error)
    return NextResponse.json({ error: 'Failed to delete label' }, { status: 500 })
  }
}
