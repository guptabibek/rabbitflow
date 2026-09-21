import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'
import { computeAuditReport } from '@/lib/domain/reports'
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

    const userId = searchParams.get('userId') || undefined
    const action = searchParams.get('action') || undefined
    const days = parseBoundedInt(searchParams.get('days'), 30, 1, 365)
    const page = parseBoundedInt(searchParams.get('page'), 1, 1, 1000)
    const pageSize = parseBoundedInt(searchParams.get('pageSize'), 50, 1, 200)

    const cacheKey = `reports:audit:${projectId}:${teamId || 'all'}:${userId || ''}:${action || ''}:${days}:${page}:${pageSize}`
    const data = await withCache(cacheKey, 30, () =>
      computeAuditReport(projectId, { userId, action, teamId, days, page, pageSize })
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing audit report:', error)
    return NextResponse.json({ error: 'Failed to compute audit report' }, { status: 500 })
  }
}
