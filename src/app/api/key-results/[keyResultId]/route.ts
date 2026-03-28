import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const updateKRSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  currentValue: z.number().min(0).optional(),
  targetValue: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ keyResultId: string }> }
) {
  try {
    const { keyResultId: id } = await params

    const kr = await db.keyResult.findUnique({
      where: { id },
      include: { objective: { select: { projectId: true } } },
    })

    if (!kr) {
      return NextResponse.json({ error: 'Key result not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, kr.objective.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateKRSchema.parse(body)

    const updated = await db.keyResult.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating key result:', error)
    return NextResponse.json({ error: 'Failed to update key result' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ keyResultId: string }> }
) {
  try {
    const { keyResultId: id } = await params

    const kr = await db.keyResult.findUnique({
      where: { id },
      include: { objective: { select: { projectId: true } } },
    })

    if (!kr) {
      return NextResponse.json({ error: 'Key result not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, kr.objective.projectId, 'project:update')
    if (!auth.ok) return auth.response

    await db.keyResult.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting key result:', error)
    return NextResponse.json({ error: 'Failed to delete key result' }, { status: 500 })
  }
}
