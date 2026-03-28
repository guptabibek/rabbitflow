import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

// GET /api/sla-timers?issueId=xxx&projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issueId')
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const where: Record<string, unknown> = {}
    if (issueId) {
      where.issueId = issueId
    } else {
      // Get running/breached/paused timers for project
      where.issue = { projectId }
      where.status = { in: ['running', 'breached', 'paused'] }
    }

    const timers = await db.slaTimer.findMany({
      where,
      orderBy: { targetAt: 'asc' },
      include: {
        policy: { select: { id: true, name: true, priorityFilter: true } },
        issue: { select: { id: true, key: true, title: true, status: true, priority: true } },
      },
    })

    // Compute time remaining for each
    const now = new Date()
    const enriched = timers.map((timer) => {
      const targetAt = timer.targetAt ? new Date(timer.targetAt) : null
      const remaining = targetAt
        ? timer.status === 'paused'
          ? targetAt.getTime() - (timer.pausedAt?.getTime() ?? now.getTime())
          : targetAt.getTime() - now.getTime()
        : null
      return {
        ...timer,
        remainingMs: remaining,
        isBreached: timer.status === 'breached' || (remaining !== null && remaining < 0),
        isAtRisk: remaining !== null && remaining > 0 && remaining < 30 * 60 * 1000,
      }
    })

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching SLA timers:', error)
    return NextResponse.json({ error: 'Failed to fetch SLA timers' }, { status: 500 })
  }
}
