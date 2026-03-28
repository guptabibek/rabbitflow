import test from 'node:test'
import assert from 'node:assert/strict'
import { isUniqueConstraintError } from '../../src/lib/db.ts'
import {
  createAuthSessionRecordOnTx,
  inferDeviceLabel,
  parseClientIpFromHeaders,
} from '../../src/lib/auth-session-core.ts'
import { buildOnboardingStepSeedData } from '../../src/lib/domain/onboarding-seed.ts'
import { DEFAULT_ONBOARDING_STEPS } from '../../src/lib/domain/onboarding-steps.ts'

test('isUniqueConstraintError: detects P2002 conflicts with matching target fields', () => {
  const error = {
    code: 'P2002',
    meta: {
      target: ['projectId', 'userId'],
    },
  }

  assert.equal(isUniqueConstraintError(error, ['projectId', 'userId']), true)
  assert.equal(isUniqueConstraintError(error, ['email']), false)
})

test('isUniqueConstraintError: treats missing target metadata as a conflict', () => {
  assert.equal(isUniqueConstraintError({ code: 'P2002' }), true)
  assert.equal(isUniqueConstraintError({ code: 'P2003' }), false)
})

test('parseClientIpFromHeaders: prefers the first forwarded IP', () => {
  const headers = new Headers({
    'x-forwarded-for': '203.0.113.10, 10.0.0.2',
    'x-real-ip': '198.51.100.7',
  })

  assert.equal(parseClientIpFromHeaders(headers), '203.0.113.10')
})

test('inferDeviceLabel: extracts browser and operating system', () => {
  assert.equal(
    inferDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0 Safari/537.36'),
    'Chrome on Windows'
  )
  assert.equal(inferDeviceLabel(null), 'Unknown device')
})

test('createAuthSessionRecordOnTx: writes revocation and session create in one tx flow', async () => {
  const calls: string[] = []
  const headers = new Headers({
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0 Safari/537.36',
    'x-forwarded-for': '203.0.113.10, 10.0.0.2',
  })

  const session = await createAuthSessionRecordOnTx(
    {
      authSession: {
        async updateMany(args) {
          calls.push(`revoke:${args.where.userId}`)
          return { count: 1 }
        },
        async create(args) {
          calls.push(`create:${args.data.userId}`)
          assert.equal(args.data.ipAddress, '203.0.113.10')
          assert.equal(args.data.deviceLabel, 'Chrome on Windows')
          assert.equal(args.data.mfaBypassed, true)
          assert.ok(args.data.mfaVerifiedAt instanceof Date)
          return { id: 'session-1', expiresAt: args.data.expiresAt }
        },
      },
    },
    {
      headers,
      userId: 'user-1',
      mfaVerified: true,
      mfaBypassed: true,
      ttlSeconds: 60,
      now: new Date('2026-03-28T10:00:00.000Z'),
    }
  )

  assert.deepEqual(calls, ['revoke:user-1', 'create:user-1'])
  assert.equal(session.id, 'session-1')
  assert.equal(session.expiresAt.toISOString(), '2026-03-28T10:01:00.000Z')
})

test('createAuthSessionRecordOnTx: propagates create failure for transaction rollback', async () => {
  let revokeCalled = false

  await assert.rejects(
    createAuthSessionRecordOnTx(
      {
        authSession: {
          async updateMany() {
            revokeCalled = true
            return { count: 1 }
          },
          async create() {
            throw new Error('session insert failed')
          },
        },
      },
      {
        headers: new Headers(),
        userId: 'user-2',
        mfaVerified: false,
        ttlSeconds: 60,
        now: new Date('2026-03-28T10:00:00.000Z'),
      }
    ),
    /session insert failed/
  )

  assert.equal(revokeCalled, true)
})

test('buildOnboardingStepSeedData: produces deterministic seed rows for every default step', () => {
  const rows = buildOnboardingStepSeedData('project-1')

  assert.equal(rows.length, DEFAULT_ONBOARDING_STEPS.length)
  assert.deepEqual(
    rows.map((row) => row.key),
    DEFAULT_ONBOARDING_STEPS.map((step) => step.key)
  )
  assert.ok(rows.every((row) => row.projectId === 'project-1' && row.isEnabled === true))
})