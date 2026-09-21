import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db, resetDatabase, disconnect } from './support/db.ts'
import { addMember, createIssue, createProject, createUser, type SeededUser } from './support/fixtures.ts'
import { applyRetentionPolicies } from '../../src/lib/domain/retention.ts'

/**
 * Retention sweeps (DB-005).
 *
 * Activity, Notification, WebhookDelivery, AutomationLog and expired
 * AuthSession rows grew forever — no partitioning, no TTL, no archival.
 * WebhookDelivery stored up to 4 KB of receiver response per attempt.
 */

let project: Awaited<ReturnType<typeof createProject>>
let user: SeededUser
const DAY = 24 * 60 * 60 * 1000

before(async () => {
  await resetDatabase()
  project = await createProject({ key: 'RETAIN' })
  user = await createUser()
  await addMember(project.id, user.id, 'Admin')
})

after(async () => { await disconnect() })

beforeEach(async () => {
  await db.notification.deleteMany({})
  await db.activity.deleteMany({})
  await db.webhookDelivery.deleteMany({})
  await db.webhook.deleteMany({})
})

test('DB-005: old webhook deliveries are removed, recent ones kept', async () => {
  const webhook = await db.webhook.create({
    data: { projectId: project.id, name: 'wh', url: 'https://example.com/h', secret: 's', events: ['issue.created'] },
  })

  await db.webhookDelivery.create({
    data: { webhookId: webhook.id, event: 'issue.created', payload: {}, success: true, attempt: 1,
            createdAt: new Date(Date.now() - 60 * DAY) },
  })
  await db.webhookDelivery.create({
    data: { webhookId: webhook.id, event: 'issue.created', payload: {}, success: true, attempt: 1,
            createdAt: new Date(Date.now() - 2 * DAY) },
  })

  const result = await applyRetentionPolicies()

  assert.equal(result.webhookDeliveries, 1, 'only the 60-day-old row should go')
  assert.equal(await db.webhookDelivery.count(), 1)
})

test('DB-005: read notifications age out but unread ones are kept', async () => {
  const base = { userId: user.id, projectId: project.id, type: 'assignment', title: 'x' }

  // Notification_read_state_chk requires isRead and readAt to agree.
  await db.notification.create({ data: { ...base, isRead: true, readAt: new Date(), createdAt: new Date(Date.now() - 200 * DAY) } })
  // Unread is still someone's inbox, however old.
  await db.notification.create({ data: { ...base, isRead: false, createdAt: new Date(Date.now() - 200 * DAY) } })
  await db.notification.create({ data: { ...base, isRead: true, readAt: new Date(), createdAt: new Date(Date.now() - 2 * DAY) } })

  const result = await applyRetentionPolicies()

  assert.equal(result.notifications, 1)
  assert.equal(await db.notification.count(), 2)
  assert.equal(await db.notification.count({ where: { isRead: false } }), 1)
})

test('DB-005: activity is retained far longer than operational logs', async () => {
  const issue = await createIssue({ projectId: project.id, reporterId: user.id })
  const base = { projectId: project.id, issueId: issue.id, userId: user.id, action: 'work_item_created' }

  // 400 days is past the one-year activity window; 100 days is well inside it,
  // though it would have been swept by the 90-day operational policies.
  await db.activity.create({ data: { ...base, createdAt: new Date(Date.now() - 400 * DAY) } })
  await db.activity.create({ data: { ...base, createdAt: new Date(Date.now() - 100 * DAY) } })

  const result = await applyRetentionPolicies()

  assert.equal(result.activities, 1)
  assert.equal(await db.activity.count(), 1)
})

test('DB-005: a sweep with nothing to remove is a no-op, not an error', async () => {
  const result = await applyRetentionPolicies()

  for (const [table, count] of Object.entries(result)) {
    assert.equal(count, 0, `${table} should have removed nothing`)
  }
})
