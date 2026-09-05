import { NextRequest, NextResponse } from 'next/server'
import { checkAndMarkBreachedTimers } from '@/lib/domain/sla-engine'
import { purgeExpiredAuthChallenges, secretsMatch } from '@/lib/auth-otp'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * POST /api/cron
 *
 * Unified cron endpoint that runs all scheduled jobs:
 *  - SLA breach detection
 *  - Recurring task execution (delegates to /api/recurring-tasks/execute)
 *
 * Called every 1–5 minutes by an external scheduler (e.g. crontab, Docker
 * healthcheck, systemd timer, or Vercel Cron).
 *
 * Secured by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-cron-secret')
    if (!CRON_SECRET || !secret || !secretsMatch(CRON_SECRET, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results: Record<string, unknown> = {}

    // 1. SLA breach detection
    try {
      const breached = await checkAndMarkBreachedTimers()
      results.slaBreaches = { breached }
    } catch (error) {
      console.error('SLA breach check failed in cron:', error)
      results.slaBreaches = { error: String(error) }
    }

    // 2. Purge expired auth challenges so the table does not grow without bound
    try {
      const purged = await purgeExpiredAuthChallenges()
      results.authChallenges = { purged }
    } catch (error) {
      console.error('Auth challenge purge failed in cron:', error)
      results.authChallenges = { error: String(error) }
    }

    // 3. Recurring task execution – call the existing endpoint
    try {
      const baseUrl = request.nextUrl.origin
      const response = await fetch(`${baseUrl}/api/recurring-tasks/execute`, {
        method: 'POST',
        headers: { 'x-cron-secret': CRON_SECRET },
      })
      results.recurringTasks = await response.json()
    } catch (error) {
      console.error('Recurring task execution failed in cron:', error)
      results.recurringTasks = { error: String(error) }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Cron execution failed:', error)
    return NextResponse.json({ error: 'Cron execution failed' }, { status: 500 })
  }
}
