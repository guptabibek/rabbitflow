import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createTestRunSchema = z.object({
  testCaseId: z.string().trim().min(1),
  result: z.enum(['passed', 'failed', 'blocked', 'skipped']),
  notes: z.string().max(5000).nullable().optional(),
  duration: z.number().int().min(0).optional(),
})

// POST /api/test-runs - Record a test execution
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createTestRunSchema.parse(body)

    const testCase = await db.testCase.findUnique({
      where: { id: data.testCaseId },
      select: { id: true, projectId: true, testPlanId: true },
    })

    if (!testCase) {
      return NextResponse.json({ error: 'Test case not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, testCase.projectId, 'test:manage')
    if (!auth.ok) return auth.response

    const run = await db.testRun.create({
      data: {
        testCaseId: data.testCaseId,
        testPlanId: testCase.testPlanId ?? null,
        executedById: auth.actor.userId,
        result: data.result,
        notes: data.notes ?? null,
        duration: data.duration ?? null,
      },
    })

    return NextResponse.json(run, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating test run:', error)
    return NextResponse.json({ error: 'Failed to create test run' }, { status: 500 })
  }
}
