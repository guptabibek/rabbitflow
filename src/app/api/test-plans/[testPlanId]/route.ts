import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const updatePlanSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testPlanId: string }> }
) {
  try {
    const { testPlanId: id } = await params

    const plan = await db.testPlan.findUnique({
      where: { id },
      include: {
        testCases: {
          orderBy: { createdAt: 'asc' },
          include: {
            runs: {
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Test plan not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, plan.projectId, 'project:read')
    if (!auth.ok) return auth.response

    // Calculate test summary
    const totalCases = plan.testCases.length
    const passedCases = plan.testCases.filter((tc) =>
      tc.runs[0]?.result === 'passed'
    ).length
    const failedCases = plan.testCases.filter((tc) =>
      tc.runs[0]?.result === 'failed'
    ).length

    return NextResponse.json({
      ...plan,
      summary: {
        total: totalCases,
        passed: passedCases,
        failed: failedCases,
        notRun: totalCases - passedCases - failedCases,
        passRate: totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0,
      },
    })
  } catch (error) {
    console.error('Error fetching test plan:', error)
    return NextResponse.json({ error: 'Failed to fetch test plan' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ testPlanId: string }> }
) {
  try {
    const { testPlanId: id } = await params

    const plan = await db.testPlan.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Test plan not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, plan.projectId, 'test:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updatePlanSchema.parse(body)

    const updated = await db.testPlan.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating test plan:', error)
    return NextResponse.json({ error: 'Failed to update test plan' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ testPlanId: string }> }
) {
  try {
    const { testPlanId: id } = await params

    const plan = await db.testPlan.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!plan) {
      return NextResponse.json({ error: 'Test plan not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, plan.projectId, 'test:manage')
    if (!auth.ok) return auth.response

    await db.$transaction(async (tx) => {
      // Delete test runs and cases first
      const caseIds = await tx.testCase.findMany({
        where: { testPlanId: id },
        select: { id: true },
      })
      await tx.testRun.deleteMany({ where: { testCaseId: { in: caseIds.map((c) => c.id) } } })
      await tx.testCase.deleteMany({ where: { testPlanId: id } })
      await tx.testPlan.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting test plan:', error)
    return NextResponse.json({ error: 'Failed to delete test plan' }, { status: 500 })
  }
}
