import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { getAutomationRules } from '@/lib/domain/automation-service'

const createRuleSchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  trigger: z.unknown(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.unknown(),
  })).optional(),
  actions: z.array(z.object({
    type: z.string(),
    field: z.string().optional(),
    value: z.unknown().optional(),
  })).min(1),
  isActive: z.boolean().optional(),
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

    const rules = await getAutomationRules(projectId)
    return NextResponse.json(rules)
  } catch (error) {
    console.error('Error fetching automation rules:', error)
    return NextResponse.json({ error: 'Failed to fetch automation rules' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createRuleSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:update')
    if (!auth.ok) return auth.response

    // Check max rules per project
    const count = await db.automationRule.count({ where: { projectId: data.projectId } })
    if (count >= 50) {
      return NextResponse.json({ error: 'Maximum 50 automation rules per project' }, { status: 400 })
    }

    const rule = await db.automationRule.create({
      data: {
        projectId: data.projectId,
        createdById: auth.actor.userId,
        name: data.name,
        description: data.description ?? null,
        trigger: data.trigger as Prisma.InputJsonValue,
        conditions: (data.conditions ?? []) as Prisma.InputJsonValue,
        actions: data.actions as Prisma.InputJsonValue,
        isActive: data.isActive ?? true,
        order: count,
      },
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating automation rule:', error)
    return NextResponse.json({ error: 'Failed to create automation rule' }, { status: 500 })
  }
}
