import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'

if (!process.env.REDIS_TEST_URL) throw new Error('REDIS_TEST_URL must point to an isolated test Redis')
process.env.REDIS_URL = process.env.REDIS_TEST_URL
const { getRedisClient, pingRedis } = await import('../../src/lib/redis.ts')

after(() => getRedisClient()?.disconnect())

test('readiness reconnects after a previously healthy Redis connection terminates', { timeout: 10_000 }, async () => {
  assert.equal(await pingRedis(), true, 'test Redis must initially be reachable')
  const client = getRedisClient()!
  const ended = once(client, 'end')
  client.disconnect()
  await ended
  assert.equal(await pingRedis(), true, 'a terminal connection must not keep a recovered service unready')
})
