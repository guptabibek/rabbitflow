import test from 'node:test'
import assert from 'node:assert/strict'
import { enqueueEmailWithFallback } from '../../src/lib/email-queue-fallback.ts'

const payload = {
  to: 'user@example.com',
  subject: 'Subject',
  text: 'Body',
}

test('enqueueEmailWithFallback: sends directly when queue enqueue fails', async () => {
  let directSendCount = 0

  await enqueueEmailWithFallback(payload, {
    addToQueue: async () => {
      throw new Error('redis unavailable')
    },
    sendDirect: async () => {
      directSendCount += 1
    },
  })

  assert.equal(directSendCount, 1)
})

test('enqueueEmailWithFallback: rethrows when queue and direct send both fail', async () => {
  await assert.rejects(
    enqueueEmailWithFallback(payload, {
      addToQueue: async () => {
        throw new Error('redis unavailable')
      },
      sendDirect: async () => {
        throw new Error('smtp unavailable')
      },
    }),
    /smtp unavailable/
  )
})