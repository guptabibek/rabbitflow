import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import {
  computeStatusDistribution,
  computeBacklogAging,
  computeBlockedItems,
  computeReopenedItems,
} from '@/lib/domain/reports'
import { parseBoundedInt } from '../_utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const report = searchParams.get('report')
    const teamId = searchParams.get('teamId') || undefined

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    // Aggregations over the whole project; throttled per user so a loop
    // cannot saturate the database.
    const limited = await enforceRateLimit(request, RATE_LIMITS.reports, auth.actor.userId)
    if (limited) return limited

    switch (report) {
      case 'status-distribution': {
        const data = await withCache(`reports:status-dist:${projectId}:${teamId || 'all'}`, 60, () =>
          computeStatusDistribution(projectId, teamId)
        )
        return NextResponse.json(data)
      }

      case 'backlog-aging': {
        const data = await withCache(`reports:backlog-aging:${projectId}:${teamId || 'all'}`, 120, () =>
          computeBacklogAging(projectId, teamId)
        )
        return NextResponse.json(data)
      }

      case 'blocked': {
        const data = await withCache(`reports:blocked:${projectId}:${teamId || 'all'}`, 60, () =>
          computeBlockedItems(projectId, teamId)
        )
        return NextResponse.json(data)
      }

      case 'reopened': {
        const days = parseBoundedInt(searchParams.get('days'), 30, 1, 365)
        const data = await withCache(`reports:reopened:${projectId}:${teamId || 'all'}:${days}`, 120, () =>
          computeReopenedItems(projectId, days, teamId)
        )
        return NextResponse.json(data)
      }

      default:
        return NextResponse.json(
          { error: 'Invalid report type. Use: status-distribution, backlog-aging, blocked, reopened' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error computing work item report:', error)
    return NextResponse.json({ error: 'Failed to compute report' }, { status: 500 })
  }
}
