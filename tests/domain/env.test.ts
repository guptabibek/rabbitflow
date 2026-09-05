import test from 'node:test'
import assert from 'node:assert/strict'
import { collectEnvIssues } from '../../src/lib/env.ts'

/**
 * Regression tests for OPS-005.
 *
 * `new TextEncoder().encode(undefined)` yields an empty key rather than
 * throwing, so a deployment with no JWT_SECRET booted successfully and then
 * failed per-request in a way that looked like a token bug.
 */

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
} as unknown as NodeJS.ProcessEnv

const issueFor = (env: NodeJS.ProcessEnv, variable: string) =>
  collectEnvIssues(env).find((issue) => issue.variable === variable)

test('OPS-005: a valid minimal environment reports no issues', () => {
  assert.deepEqual(collectEnvIssues(validEnv), [])
})

test('OPS-005: a missing JWT_SECRET is caught', () => {
  assert.ok(issueFor({ ...validEnv, JWT_SECRET: undefined }, 'JWT_SECRET'))
  assert.ok(issueFor({ ...validEnv, JWT_SECRET: '' }, 'JWT_SECRET'))
  assert.ok(issueFor({ ...validEnv, JWT_SECRET: '   ' }, 'JWT_SECRET'))
})

test('OPS-005: a short JWT_SECRET is rejected', () => {
  const issue = issueFor({ ...validEnv, JWT_SECRET: 'too-short' }, 'JWT_SECRET')
  assert.ok(issue)
  assert.match(issue.message, /at least 32 bytes/)
})

test('OPS-005: exactly 32 bytes is accepted', () => {
  assert.equal(issueFor({ ...validEnv, JWT_SECRET: 'a'.repeat(32) }, 'JWT_SECRET'), undefined)
  assert.ok(issueFor({ ...validEnv, JWT_SECRET: 'a'.repeat(31) }, 'JWT_SECRET'))
})

test('OPS-005: DATABASE_URL must be present and postgres', () => {
  assert.ok(issueFor({ ...validEnv, DATABASE_URL: undefined }, 'DATABASE_URL'))

  const wrongScheme = issueFor({ ...validEnv, DATABASE_URL: 'mysql://x/y' }, 'DATABASE_URL')
  assert.ok(wrongScheme)
  assert.match(wrongScheme.message, /postgresql/)

  // Both accepted Prisma spellings.
  assert.equal(
    issueFor({ ...validEnv, DATABASE_URL: 'postgres://u:p@h:5432/d' }, 'DATABASE_URL'),
    undefined
  )
})

test('OPS-005: production-only checks do not fire outside production', () => {
  // NODE_ENV is read from the real process env, which is not "production" here,
  // so CRON_SECRET and APP_URL are optional and the header-auth escape hatch is
  // permitted.
  const issues = collectEnvIssues({ ...validEnv, ALLOW_HEADER_AUTH: 'true' })
  assert.deepEqual(issues, [])
})
