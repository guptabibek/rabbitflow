import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { applyAreaScopeFilter, getAreaAccessScope } from '@/lib/domain/access-control'
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

    const auth = await requireProjectPermission(request, projectId, 'workitem:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const areaScope = await getAreaAccessScope(
      projectId,
      auth.actor.projectRole,
      'workitem:read',
      auth.actor.extraPermissions
    )
    const issueScope = applyAreaScopeFilter<Prisma.IssueWhereInput>({ projectId }, areaScope)
    const where: Prisma.SlaTimerWhereInput = {
      issue: { is: issueScope },
    }
    if (issueId) {
      where.issueId = issueId
    } else {
      // Get running/breached/paused timers for project
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
