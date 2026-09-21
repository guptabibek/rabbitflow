import { NextRequest, NextResponse } from 'next/server'
import { checkAndMarkBreachedTimers } from '@/lib/domain/sla-engine'
import { getAuthorizedCronSecret } from '@/lib/cron-auth'

/**
 * POST /api/sla-timers/check-breaches
 *
 * Cron endpoint that marks running SLA timers as breached when their
 * target deadline has passed. Should be called every 1-5 minutes.
 */
export async function POST(request: NextRequest) {
  try {
    if (!getAuthorizedCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const breachedCount = await checkAndMarkBreachedTimers()

    return NextResponse.json({ breached: breachedCount })
  } catch (error) {
    console.error('SLA breach check failed:', error)
    return NextResponse.json({ error: 'Breach check failed' }, { status: 500 })
  }
}
