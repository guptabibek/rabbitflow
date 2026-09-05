import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import {
  computeWorkloadDistribution,
  computeCompletionRates,
  computeTimeVsEstimates,
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
      case 'workload': {
        const iterationId = searchParams.get('iterationId') || undefined
        const cacheKey = `reports:workload:${projectId}:${teamId || 'all'}:${iterationId || 'all'}`
        const data = await withCache(cacheKey, 60, () =>
          computeWorkloadDistribution(projectId, iterationId, teamId)
        )
        return NextResponse.json(data)
      }

      case 'completion-rates': {
        const days = parseBoundedInt(searchParams.get('days'), 30, 1, 365)
        const data = await withCache(`reports:completion:${projectId}:${teamId || 'all'}:${days}`, 120, () =>
          computeCompletionRates(projectId, days, teamId)
        )
        return NextResponse.json(data)
      }

      case 'time-estimates': {
        const iterationId = searchParams.get('iterationId') || undefined
        const cacheKey = `reports:time-est:${projectId}:${teamId || 'all'}:${iterationId || 'all'}`
        const data = await withCache(cacheKey, 60, () =>
          computeTimeVsEstimates(projectId, iterationId, teamId)
        )
        return NextResponse.json(data)
      }

      default:
        return NextResponse.json(
          { error: 'Invalid report type. Use: workload, completion-rates, time-estimates' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error computing productivity report:', error)
    return NextResponse.json({ error: 'Failed to compute report' }, { status: 500 })
  }
}
