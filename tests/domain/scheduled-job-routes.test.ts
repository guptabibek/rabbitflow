import test from 'node:test'
import assert from 'node:assert/strict'
import { isScheduledJobRoute } from '../../src/lib/scheduled-job-routes.ts'

test('only exact scheduled-job endpoints bypass the browser session proxy', () => {
  assert.equal(isScheduledJobRoute('/api/cron'), true)
  assert.equal(isScheduledJobRoute('/api/recurring-tasks/execute'), true)
  assert.equal(isScheduledJobRoute('/api/sla-timers/check-breaches'), true)

  assert.equal(isScheduledJobRoute('/api/cron/anything'), false)
  assert.equal(isScheduledJobRoute('/api/recurring-tasks'), false)
  assert.equal(isScheduledJobRoute('/api/sla-timers'), false)
  assert.equal(isScheduledJobRoute('/api/issues'), false)
})
