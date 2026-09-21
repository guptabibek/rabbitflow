import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import { computeDoraMetrics } from '@/lib/domain/reports'
import { parseBoundedInt } from '../_utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
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

    const days = parseBoundedInt(searchParams.get('days'), 90, 7, 365)
    const data = await withCache(`reports:dora:${projectId}:${teamId || 'all'}:${days}`, 300, () =>
      computeDoraMetrics(projectId, days, teamId)
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing DORA metrics:', error)
    return NextResponse.json({ error: 'Failed to compute DORA metrics' }, { status: 500 })
  }
}
