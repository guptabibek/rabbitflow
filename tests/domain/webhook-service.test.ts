import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
  buildWebhookRetryPlan,
} from '../../src/lib/domain/webhook-retry.ts'

test('buildWebhookRetryPlan: returns one attempt entry per configured retry', () => {
  const plan = buildWebhookRetryPlan()

  assert.equal(plan.length, WEBHOOK_MAX_ATTEMPTS)
  assert.deepEqual(plan.map((entry) => entry.attempt), [1, 2, 3, 4])
})

test('buildWebhookRetryPlan: uses configured backoff delays after the first attempt', () => {
  const plan = buildWebhookRetryPlan()

  assert.deepEqual(plan.map((entry) => entry.delayMs), WEBHOOK_BACKOFF_MS)
})

test('buildWebhookRetryPlan: reuses the last delay when attempts exceed configured backoff values', () => {
  const plan = buildWebhookRetryPlan(6, [0, 250, 1000])

  assert.deepEqual(plan, [
    { attempt: 1, delayMs: 0 },
    { attempt: 2, delayMs: 250 },
    { attempt: 3, delayMs: 1000 },
    { attempt: 4, delayMs: 1000 },
    { attempt: 5, delayMs: 1000 },
    { attempt: 6, delayMs: 1000 },
  ])
})

test('buildWebhookRetryPlan: returns an empty plan for zero attempts', () => {
  assert.deepEqual(buildWebhookRetryPlan(0, [0, 1000]), [])
})