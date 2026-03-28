import Redis from 'ioredis'

let redis: Redis | null = null
let connectionFailed = false
let lastFailureAt = 0
const localEphemeralStore = new Map<string, { value: string; expiresAt: number }>()

const FAILURE_RETRY_MS = 30_000

function getRedisUrl() {
  return (
    process.env.REDIS_URL ||
    process.env.REDIS_TLS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    process.env.UPSTASH_REDIS_TLS_URL ||
    null
  )
}

function getRedisOptions() {
  const host = process.env.REDIS_HOST
  const port = process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT, 10) : undefined
  const password =
    process.env.REDIS_PASSWORD ||
    process.env.REDIS_KEY ||
    process.env.UPSTASH_REDIS_PASSWORD ||
    undefined

  if (!host || !port || Number.isNaN(port)) return null

  return {
    host,
    port,
    password,
    username: process.env.REDIS_USERNAME || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  }
}

function getRedis(): Redis | null {
  if (connectionFailed && Date.now() - lastFailureAt < FAILURE_RETRY_MS) {
    return null
  }

  if (connectionFailed && Date.now() - lastFailureAt >= FAILURE_RETRY_MS) {
    connectionFailed = false
  }

  if (redis) return redis

  const url = getRedisUrl()
  const options = getRedisOptions()

  if (!url && !options) return null

  try {
    redis = url
      ? new Redis(url, {
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
          connectTimeout: 3000,
        })
      : new Redis({
          ...(options || {}),
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          lazyConnect: true,
          connectTimeout: 3000,
        })

    redis.on('connect', () => {
      connectionFailed = false
    })
    redis.on('error', () => {
      redis?.disconnect()
      redis = null
      connectionFailed = true
      lastFailureAt = Date.now()
    })

    return redis
  } catch {
    connectionFailed = true
    lastFailureAt = Date.now()
    return null
  }
}

export function isRedisConfigured() {
  return Boolean(getRedisUrl() || getRedisOptions())
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis()
  if (!client) return null
  try {
    const data = await client.get(key)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export async function cacheSet(
  key: string,
  data: unknown,
  ttlSeconds = 30
): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data))
  } catch {
    // Cache write failures are non-fatal
  }
}

export async function cacheInvalidate(...patterns: string[]): Promise<void> {
  const client = getRedis()
  if (!client) return
  try {
    for (const pattern of patterns) {
      let cursor = '0'
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = nextCursor
        if (keys.length > 0) await client.unlink(...keys)
      } while (cursor !== '0')
    }
  } catch {
    // Cache invalidation failures are non-fatal
  }
}

export async function withCache<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(key)
  if (cached !== null) return cached
  const data = await fetcher()
  await cacheSet(key, data, ttl)
  return data
}

function pruneEphemeralStore(now = Date.now()) {
  for (const [key, entry] of localEphemeralStore.entries()) {
    if (entry.expiresAt <= now) {
      localEphemeralStore.delete(key)
    }
  }
}

export async function ephemeralSet(
  key: string,
  data: unknown,
  ttlSeconds = 60
): Promise<void> {
  const client = getRedis()
  if (client) {
    try {
      await client.set(key, JSON.stringify(data), 'EX', ttlSeconds)
      return
    } catch {
      // Fall through to local store
    }
  }

  localEphemeralStore.set(key, {
    value: JSON.stringify(data),
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export async function ephemeralScan<T>(pattern: string): Promise<Array<{ key: string; value: T }>> {
  const client = getRedis()
  if (client) {
    try {
      const items: Array<{ key: string; value: T }> = []
      let cursor = '0'

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = nextCursor
        if (keys.length === 0) continue

        const values = await client.mget(keys)
        keys.forEach((key, index) => {
          const raw = values[index]
          if (!raw) return
          try {
            items.push({ key, value: JSON.parse(raw) as T })
          } catch {
            // Ignore malformed entries
          }
        })
      } while (cursor !== '0')

      return items
    } catch {
      // Fall through to local store
    }
  }

  pruneEphemeralStore()
  const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
  const items: Array<{ key: string; value: T }> = []

  for (const [key, entry] of localEphemeralStore.entries()) {
    if (!key.startsWith(prefix)) continue
    try {
      items.push({ key, value: JSON.parse(entry.value) as T })
    } catch {
      // Ignore malformed entries
    }
  }

  return items
}
