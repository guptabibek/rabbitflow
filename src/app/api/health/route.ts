import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isRedisConfigured, pingRedis } from '@/lib/redis'

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
  const ready = databaseOk

  return NextResponse.json(
    {
      status: ready ? 'ok' : 'degraded',
      checks: {
        database: databaseOk ? 'ok' : 'error',
        redis: redisConfigured ? (redisOk ? 'ok' : 'degraded') : 'not-configured',
      },
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  )
}