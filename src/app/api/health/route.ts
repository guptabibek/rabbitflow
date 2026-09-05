import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRedisConfigured, pingRedis } from '@/lib/redis'

/**
 * Combined health endpoint.
 *
 * Readiness intentionally accounts for Redis. Auth state (MFA challenges,
 * password-reset OTPs) is held in Redis, so an instance that has lost Redis
 * cannot complete a login for any account that is challenged — it must not stay
 * in the load-balancer rotation. Previously this endpoint reported
 * `status: "ok"` with `redis: "degraded"` and HTTP 200 while every non-admin
 * login was failing, which kept broken instances serving traffic.
 *
 * `/api/health/live` and `/api/health/ready` expose the two signals separately
 * for orchestrators that distinguish them.
 */
export async function GET() {
  let databaseOk = false

  try {
    await db.$queryRawUnsafe('SELECT 1')
    databaseOk = true
  } catch {
    databaseOk = false
  }

  const redisConfigured = isRedisConfigured()
  const redisOk = redisConfigured ? await pingRedis() : null

  // When Redis is configured it is a hard dependency of the auth path.
  const redisReady = !redisConfigured || redisOk === true
  const ready = databaseOk && redisReady

  return NextResponse.json(
    {
      status: ready ? 'ok' : 'degraded',
      checks: {
        database: databaseOk ? 'ok' : 'error',
        redis: redisConfigured ? (redisOk ? 'ok' : 'error') : 'not-configured',
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  )
}
