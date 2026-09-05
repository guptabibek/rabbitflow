import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { db } from '@/lib/db'
import { withCache } from '@/lib/redis'
import { computeExecutiveDashboard } from '@/lib/domain/reports'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    // Aggregations over the whole project; throttled per user so a loop
    // cannot saturate the database.
    const limited = await enforceRateLimit(request, RATE_LIMITS.reports, auth.user.id)
    if (limited) return limited

    const memberships = await db.projectMember.findMany({
      where: { userId: auth.user.id, project: { isArchived: false } },
      select: { projectId: true },
    })
    const projectIds = memberships.map((m) => m.projectId)

    const data = await withCache(`reports:executive:${auth.user.id}`, 120, () =>
      computeExecutiveDashboard(projectIds)
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error computing executive dashboard:', error)
    return NextResponse.json({ error: 'Failed to compute executive dashboard' }, { status: 500 })
  }
}
