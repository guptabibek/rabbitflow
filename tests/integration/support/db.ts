import { PrismaClient } from '@prisma/client'

/**
 * Integration-test database access.
 *
 * These tests run against a real PostgreSQL instance because the behaviour they
 * cover — row-level authorization, foreign-key protection, optimistic locking,
 * transaction boundaries — does not exist in a mock. A mocked Prisma client
 * would happily "pass" every authorization test while the real query returned
 * another tenant's rows.
 *
 * Requires TEST_DATABASE_URL. Refuses to run against anything that does not
 * look like a throwaway database, because these helpers truncate tables.
 */

const url = process.env.TEST_DATABASE_URL

if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is required for integration tests.\n' +
      'Start one with:\n' +
      '  docker run -d --name rf-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \\\n' +
      '    -e POSTGRES_DB=rabbitflow_test -p 55433:5432 postgres:16-alpine\n' +
      'then: TEST_DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_test'
  )
}

// Guard against a mis-set variable wiping a real database.
if (!/test/i.test(url)) {
  throw new Error(
    `Refusing to run integration tests against "${url}": the database name must contain "test".`
  )
}

export const db = new PrismaClient({ datasourceUrl: url, log: ['error'] })

/**
 * Tables cleared between test files, ordered so that dependents go first.
 * `Project` and `User` cascade to most of the rest, but the join and log tables
 * are listed explicitly so a schema change that breaks a cascade surfaces here
 * rather than as cross-test contamination.
 */
const TRUNCATE_ORDER = [
  'AuthChallenge',
  'AuthSession',
  'SecurityAuditEvent',
  'WebhookDelivery',
  'Webhook',
  'ApiToken',
  'Notification',
  'Activity',
  'CommentRevision',
  'CommentMention',
  'Comment',
  'Attachment',
  'IssueLabel',
  'IssueRelation',
  'WorkItemFieldValue',
  'SlaTimer',
  'ApprovalDecision',
  'ApprovalRequest',
  'GitLink',
  'Issue',
  'Label',
  'SprintCapacity',
  'Iteration',
  'Area',
  'TeamMember',
  'Team',
  'ProjectPermissionRule',
  'ProjectMember',
  'Project',
  'User',
]

export async function resetDatabase() {
  // TRUNCATE ... CASCADE in one statement so ordering between the listed tables
  // cannot deadlock, and RESTART IDENTITY so sequences do not leak across tests.
  const quoted = TRUNCATE_ORDER.map((table) => `"${table}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`)
}

export async function disconnect() {
  await db.$disconnect()
}
