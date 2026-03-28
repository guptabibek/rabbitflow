import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createTestPlanSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  iterationId: z.string().trim().min(1).nullable().optional(),
})

const createTestCaseSchema = z.object({
  testPlanId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  preconditions: z.string().max(10000).nullable().optional(),
  steps: z.array(z.object({
    order: z.number().int().min(1),
    action: z.string().min(1).max(2000),
    expectedResult: z.string().max(2000).optional(),
  })).min(1),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  linkedIssueId: z.string().trim().min(1).nullable().optional(),
})

// GET /api/test-plans?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const plans = await db.testPlan.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { testCases: true } },
      },
    })

    return NextResponse.json(plans)
  } catch (error) {
    console.error('Error fetching test plans:', error)
    return NextResponse.json({ error: 'Failed to fetch test plans' }, { status: 500 })
  }
}

// POST /api/test-plans
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Creating a test case
    if (body.testPlanId) {
      const data = createTestCaseSchema.parse(body)

      const plan = await db.testPlan.findUnique({
        where: { id: data.testPlanId },
        select: { id: true, projectId: true },
      })

      if (!plan) {
        return NextResponse.json({ error: 'Test plan not found' }, { status: 404 })
      }

      const auth = await requireProjectPermission(request, plan.projectId, 'test:manage')
      if (!auth.ok) return auth.response

      const testCase = await db.testCase.create({
        data: {
          projectId: plan.projectId,
          testPlanId: data.testPlanId,
          title: data.title,
          description: data.description ?? null,
          preconditions: data.preconditions ?? null,
          steps: data.steps,
          priority: data.priority ?? 'medium',
          linkedIssueId: data.linkedIssueId ?? null,
        },
      })

      return NextResponse.json(testCase, { status: 201 })
    }

    // Creating a test plan
    const data = createTestPlanSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'test:manage')
    if (!auth.ok) return auth.response

    const plan = await db.testPlan.create({
      data: {
        projectId: data.projectId,
        createdById: auth.actor.userId,
        title: data.title,
        description: data.description ?? null,
        iterationId: data.iterationId ?? null,
      },
    })

    return NextResponse.json(plan, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating test plan:', error)
    return NextResponse.json({ error: 'Failed to create test plan' }, { status: 500 })
  }
}
