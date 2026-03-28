import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWithRetry, parseJsonResponse } from '../../src/lib/utils.ts'
import { runWithDbRetry } from '../../src/lib/db.ts'

test('parseJsonResponse: returns fallback when the response body is malformed JSON', async () => {
  const response = new Response('{"broken":', {
    headers: { 'content-type': 'application/json' },
  })

  const payload = await parseJsonResponse(response, { safe: true })

  assert.deepEqual(payload, { safe: true })
})

test('fetchWithRetry: retries transient 500 responses and eventually succeeds', async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = (async () => {
    attempts += 1

    if (attempts === 1) {
      return new Response(JSON.stringify({ error: 'temporary failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const response = await fetchWithRetry('http://example.test/resilience', {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 50,
    })

    assert.equal(response.status, 200)
    assert.equal(attempts, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchWithRetry: retries timed out requests before succeeding', async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = (async (_input, init) => {
    attempts += 1

    if (attempts === 1) {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          { once: true }
        )
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  try {
    const response = await fetchWithRetry('http://example.test/timeout', {
      retries: 1,
      retryDelayMs: 1,
      timeoutMs: 5,
    })

    assert.equal(response.status, 200)
    assert.equal(attempts, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('runWithDbRetry: retries transient Prisma-style errors and then succeeds', async () => {
  let attempts = 0

  const result = await runWithDbRetry(async () => {
    attempts += 1

    if (attempts < 3) {
      throw Object.assign(new Error('Can\'t reach database server'), { code: 'P1001' })
    }

    return 'ok'
  }, {
    attempts: 3,
    retryDelayMs: 1,
  })

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('runWithDbRetry: does not retry non-transient errors', async () => {
  let attempts = 0

  await assert.rejects(
    runWithDbRetry(async () => {
      attempts += 1
      throw new Error('validation failed')
    }, {
      attempts: 3,
      retryDelayMs: 1,
    }),
    /validation failed/
  )

  assert.equal(attempts, 1)
})