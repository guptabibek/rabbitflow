import { db } from '@/lib/db'

/**
 * Retention for append-only tables.
 *
 * `Activity`, `Notification`, `WebhookDelivery`, `AutomationLog` and expired
 * `AuthSession` rows grew without bound — no partitioning, no TTL, no archival.
 * `WebhookDelivery` was the worst: it stored up to 4 KB of receiver response per
 * attempt, so a chatty project with retries could dominate the database within
 * months.
 *
 * Called from the scheduled-job endpoint. Deletes are batched and capped per run
 * so a first execution against a large table cannot hold locks for minutes or
 * blow the statement timeout.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

function envDays(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Ceiling on rows removed per table per run. Keeps each pass short; the job runs
 * every couple of minutes, so a backlog drains steadily rather than in one
 * long-running transaction.
 */
const MAX_DELETES_PER_TABLE = 5_000

export type RetentionResult = Record<string, number>

export async function applyRetentionPolicies(now = new Date()): Promise<RetentionResult> {
  const result: RetentionResult = {}

  // Delivery logs are diagnostic. Anything older than a month is of no practical
  // use and is the largest contributor by volume.
  result.webhookDeliveries = await deleteOlderThan(
    'WebhookDelivery',
    'createdAt',
    daysAgo(envDays('RETENTION_WEBHOOK_DELIVERY_DAYS', 30), now)
  )

  // Read notifications past their useful life. Unread ones are deliberately
  // kept: they are still someone's inbox.
  result.notifications = await deleteReadNotificationsOlderThan(
    daysAgo(envDays('RETENTION_NOTIFICATION_DAYS', 90), now)
  )

  result.automationLogs = await deleteOlderThan(
    'AutomationLog',
    'createdAt',
    daysAgo(envDays('RETENTION_AUTOMATION_LOG_DAYS', 90), now)
  )

  // Activity is the work-item audit trail, so it is kept far longer than the
  // operational logs above.
  result.activities = await deleteOlderThan(
    'Activity',
    'createdAt',
    daysAgo(envDays('RETENTION_ACTIVITY_DAYS', 365), now)
  )

  // Sessions that expired long ago carry no value; revocation is already
  // decided by expiresAt.
  result.authSessions = await deleteOlderThan(
    'AuthSession',
    'expiresAt',
    daysAgo(envDays('RETENTION_EXPIRED_SESSION_DAYS', 30), now)
  )

  return result
}

/**
 * Delete in one bounded statement using a subquery, so the row cap is applied by
 * the database rather than by loading ids into the application first.
 */
async function deleteOlderThan(
  table: string,
  column: string,
  cutoff: Date
): Promise<number> {
  // `table` and `column` are compile-time literals from this module, never user
  // input; the cutoff is bound as a parameter.
  const sql = `
    DELETE FROM "${table}"
    WHERE "id" IN (
      SELECT "id" FROM "${table}"
      WHERE "${column}" < $1
      LIMIT ${MAX_DELETES_PER_TABLE}
    )
  `

  try {
    return await db.$executeRawUnsafe(sql, cutoff)
  } catch (error) {
    console.error(`Retention sweep failed for ${table}:`, error)
    return 0
  }
}

async function deleteReadNotificationsOlderThan(cutoff: Date): Promise<number> {
  try {
    return await db.$executeRawUnsafe(
      `
        DELETE FROM "Notification"
        WHERE "id" IN (
          SELECT "id" FROM "Notification"
          WHERE "createdAt" < $1 AND "isRead" = true
          LIMIT ${MAX_DELETES_PER_TABLE}
        )
      `,
      cutoff
    )
  } catch (error) {
    console.error('Retention sweep failed for Notification:', error)
    return 0
  }
}
