import assert from 'node:assert/strict'
import test from 'node:test'
import { getApiErrorMessage } from '../../src/lib/utils.ts'

test('API errors prefer an actionable user message over the stable machine error', async () => {
  const response = new Response(
    JSON.stringify({
      error: 'Invalid workflow transition',
      details: {
        userMessage: 'Open the item and choose one of the available State options first.',
      },
    }),
    { status: 400, headers: { 'content-type': 'application/json' } }
  )

  assert.equal(
    await getApiErrorMessage(response, 'Fallback'),
    'Open the item and choose one of the available State options first.'
  )
})

test('API errors retain the top-level error when no user message is supplied', async () => {
  const response = new Response(JSON.stringify({ error: 'Validation failed' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })

  assert.equal(await getApiErrorMessage(response, 'Fallback'), 'Validation failed')
})
