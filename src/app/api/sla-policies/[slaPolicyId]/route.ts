import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  responseTimeMinutes: z.number().int().min(1).optional(),
  resolutionTimeMinutes: z.number().int().min(1).optional(),
  businessHoursOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
  priorityFilter: z.unknown().nullable().optional(),
  typeFilter: z.unknown().nullable().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slaPolicyId: string }> }
) {
  try {
    const { slaPolicyId: id } = await params

    const policy = await db.slaPolicy.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!policy) {
      return NextResponse.json({ error: 'SLA policy not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, policy.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateSchema.parse(body)

    const updateData: Prisma.SlaPolicyUpdateInput = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.responseTimeMinutes !== undefined) updateData.responseTimeMinutes = data.responseTimeMinutes
    if (data.resolutionTimeMinutes !== undefined) updateData.resolutionTimeMinutes = data.resolutionTimeMinutes
    if (data.businessHoursOnly !== undefined) updateData.businessHoursOnly = data.businessHoursOnly
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.priorityFilter !== undefined) updateData.priorityFilter = data.priorityFilter as Prisma.InputJsonValue
    if (data.typeFilter !== undefined) updateData.typeFilter = data.typeFilter as Prisma.InputJsonValue

    const updated = await db.slaPolicy.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating SLA policy:', error)
    return NextResponse.json({ error: 'Failed to update SLA policy' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slaPolicyId: string }> }
) {
  try {
    const { slaPolicyId: id } = await params

    const policy = await db.slaPolicy.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!policy) {
      return NextResponse.json({ error: 'SLA policy not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, policy.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    await db.slaPolicy.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting SLA policy:', error)
    return NextResponse.json({ error: 'Failed to delete SLA policy' }, { status: 500 })
  }
}
