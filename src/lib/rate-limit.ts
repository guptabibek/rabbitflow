import { NextRequest, NextResponse } from 'next/server'
import { parseClientIpFromHeaders } from '@/lib/auth-session-core'

/**
 * Fixed-window rate limiting for abuse-prone endpoints.
 *
 * Nothing throttled login, registration, password reset or search, so an
 * attacker could brute-force credentials at full speed and — because the account
 * lockout triggers after three failures — could also lock any known user out
 * indefinitely with three requests an hour.
 *
 * Redis-backed when available so limits hold across replicas, with an in-process
 * fallback. Unlike the auth-challenge storage this *may* degrade to per-process
 * counting: a rate limiter that fails open on a cache outage is an availability
 * trade-off, whereas an auth challenge that fails open is a correctness bug.
 */

type Bucket = { count: number; resetAt: number }

const localBuckets = new Map<string, Bucket>()

// Bound the in-process map so a flood of distinct keys cannot exhaust memory.
const MAX_LOCAL_BUCKETS = 10_000

function pruneLocalBuckets(now: number) {
  if (localBuckets.size < MAX_LOCAL_BUCKETS) return

  for (const [key, bucket] of localBuckets) {
    if (bucket.resetAt <= now) localBuckets.delete(key)
  }

  // Still oversized after pruning expired entries: drop the oldest arbitrarily
  // rather than grow without bound.
  if (localBuckets.size >= MAX_LOCAL_BUCKETS) {
    const excess = localBuckets.size - MAX_LOCAL_BUCKETS + 1
    let removed = 0
    for (const key of localBuckets.keys()) {
      localBuckets.delete(key)
      if (++removed >= excess) break
    }
  }
}

export type RateLimitRule = {
  /** Distinguishes counters for different endpoints. */
  name: string
  /** Maximum requests permitted per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

async function incrementRedis(
  key: string,
  windowSeconds: number
): Promise<{ count: number; ttl: number } | null> {
  // Imported lazily so this module stays usable in contexts without Redis.
  const { getRedisClient } = await import('@/lib/redis')
  const client = getRedisClient()
  if (!client) return null

  try {
    const count = await client.incr(key)
    if (count === 1) {
      await client.expire(key, windowSeconds)
    }
    const ttl = await client.ttl(key)
    return { count, ttl: ttl > 0 ? ttl : windowSeconds }
  } catch {
    return null
  }
}

function incrementLocal(key: string, windowSeconds: number) {
  const now = Date.now()
  pruneLocalBuckets(now)

  const existing = localBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const bucket = { count: 1, resetAt: now + windowSeconds * 1000 }
    localBuckets.set(key, bucket)
    return { count: 1, ttl: windowSeconds }
  }

  existing.count += 1
  return {
    count: existing.count,
    ttl: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

export async function checkRateLimit(
  rule: RateLimitRule,
  identifier: string
): Promise<RateLimitResult> {
  const key = `ratelimit:${rule.name}:${identifier}`

  const result =
    (await incrementRedis(key, rule.windowSeconds)) ?? incrementLocal(key, rule.windowSeconds)

  const allowed = result.count <= rule.limit

  return {
    allowed,
    remaining: Math.max(0, rule.limit - result.count),
    retryAfterSeconds: allowed ? 0 : result.ttl,
  }
}

/** Stable per-caller identifier: the client IP, falling back to a shared bucket. */
export function clientIdentifier(request: NextRequest): string {
  return parseClientIpFromHeaders(request.headers) ?? 'unknown'
}

/**
 * Apply a rate limit and return a 429 response when exceeded, or `null` to
 * continue. Callers combine the IP with a request-specific discriminator (an
 * email, for example) so one attacker cannot exhaust another user's budget.
 */
export async function enforceRateLimit(
  request: NextRequest,
  rule: RateLimitRule,
  discriminator?: string
): Promise<NextResponse | null> {
  const identifier = discriminator
    ? `${clientIdentifier(request)}:${discriminator}`
    : clientIdentifier(request)

  const result = await checkRateLimit(rule, identifier)

  if (result.allowed) return null

  return NextResponse.json(
    {
      error: 'Too many requests. Please slow down and try again shortly.',
      code: 'RATE_LIMITED',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(rule.limit),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}

/** Shared rules so limits stay consistent across the auth surface. */
export const RATE_LIMITS = {
  login: { name: 'login', limit: 10, windowSeconds: 300 },
  register: { name: 'register', limit: 5, windowSeconds: 3600 },
  passwordResetRequest: { name: 'pwreset-request', limit: 5, windowSeconds: 3600 },
  passwordResetConfirm: { name: 'pwreset-confirm', limit: 10, windowSeconds: 900 },
  mfaVerify: { name: 'mfa-verify', limit: 15, windowSeconds: 900 },
  search: { name: 'search', limit: 60, windowSeconds: 60 },
  // Report endpoints run multi-table aggregations over the whole project, so
  // they are the cheapest way for an authenticated user to saturate the
  // database. Generous enough for a dashboard that loads several panels at
  // once, tight enough to stop a loop.
  reports: { name: 'reports', limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>
