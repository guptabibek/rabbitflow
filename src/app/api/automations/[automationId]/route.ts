import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

import { type Prisma } from '@prisma/client'

const updateRuleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  trigger: z.unknown().optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown(),
  })).optional(),
  actions: z.array(z.object({
    type: z.string(),
    field: z.string().optional(),
    value: z.unknown().optional(),
  })).min(1).optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ automationId: string }> }
) {
  try {
    const { automationId: id } = await params

    const rule = await db.automationRule.findUnique({
      where: { id },
      include: {
        logs: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            issueId: true,
            triggeredBy: true,
            status: true,
            actionsRun: true,
            error: true,
            createdAt: true,
          },
        },
      },
    })

    if (!rule) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, rule.projectId, 'project:read')
    if (!auth.ok) return auth.response

    return NextResponse.json(rule)
  } catch (error) {
    console.error('Error fetching automation rule:', error)
    return NextResponse.json({ error: 'Failed to fetch automation rule' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ automationId: string }> }
) {
  try {
    const { automationId: id } = await params

    const rule = await db.automationRule.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!rule) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, rule.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateRuleSchema.parse(body)

    const updateData: Prisma.AutomationRuleUpdateInput = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.trigger !== undefined) updateData.trigger = data.trigger as Prisma.InputJsonValue
    if (data.conditions !== undefined) updateData.conditions = data.conditions as Prisma.InputJsonValue
    if (data.actions !== undefined) updateData.actions = data.actions as Prisma.InputJsonValue
    if (data.isActive !== undefined) updateData.isActive = data.isActive
    if (data.order !== undefined) updateData.order = data.order

    const updated = await db.automationRule.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating automation rule:', error)
    return NextResponse.json({ error: 'Failed to update automation rule' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ automationId: string }> }
) {
  try {
    const { automationId: id } = await params

    const rule = await db.automationRule.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!rule) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, rule.projectId, 'project:update')
    if (!auth.ok) return auth.response

    await db.automationRule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting automation rule:', error)
    return NextResponse.json({ error: 'Failed to delete automation rule' }, { status: 500 })
  }
}
