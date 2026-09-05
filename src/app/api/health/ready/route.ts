import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRedisConfigured, pingRedis } from '@/lib/redis'

/**
 * Readiness probe.
 *
 * Answers "can this instance correctly serve user traffic right now?". A failure
 * means the orchestrator should take the instance *out of rotation* without
 * restarting it.
 *
 * Redis counts as a hard dependency whenever it is configured: MFA challenges and
 * password-reset OTPs live there, so an instance without Redis cannot complete a
 * challenged login or a password reset, and must not receive traffic.
 */
export async function GET() {
  const checks: Record<string, string> = {}

  let databaseOk = false
  try {
    await db.$queryRawUnsafe('SELECT 1')
    databaseOk = true
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  const redisConfigured = isRedisConfigured()
  let redisReady = true

  if (redisConfigured) {
    redisReady = await pingRedis()
    checks.redis = redisReady ? 'ok' : 'error'
  } else {
    checks.redis = 'not-configured'
  }

  const ready = databaseOk && redisReady

  return NextResponse.json(
    {
      status: ready ? 'ready' : 'not-ready',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  )
}
