import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { db, resetDatabase, disconnect } from './support/db.ts'
import { authedRequest, readResponse } from './support/fixtures.ts'
import { isEncryptedValue } from '../../src/lib/crypto-box.ts'

import { POST as login } from '../../src/app/api/auth/login/route.ts'
import { POST as mfaVerify } from '../../src/app/api/auth/mfa/verify/route.ts'

/**
 * End-to-end proof for SEC-014: a seed written through the real enrolment flow
 * is unreadable in the database, and the user can still sign in with it.
 *
 * Skipped when MFA_ENCRYPTION_KEY is unset, which is the documented
 * backward-compatible mode.
 */

const PASSWORD = 'Password123!'
const encryptionConfigured = Boolean(process.env.MFA_ENCRYPTION_KEY?.trim())

before(async () => { await resetDatabase() })
after(async () => { await disconnect() })

test('an enrolled TOTP seed is encrypted at rest and still usable', { skip: !encryptionConfigured }, async () => {
  await db.user.create({
    data: {
      email: 'enrol@test.local',
      name: 'Enrol',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      mfaExemptFromPolicy: false,
    },
  })

  // Login with enrolment required returns a setup challenge carrying the seed.
  const challenge = await readResponse<{ challengeToken: string; manualEntryKey: string }>(
    await login(
      authedRequest(null, '/api/auth/login', {
        method: 'POST',
        body: { email: 'enrol@test.local', password: PASSWORD },
        headers: { 'x-forwarded-for': '10.5.5.1' },
      })
    )
  )

  const seed = challenge.body!.manualEntryKey
  assert.ok(seed, 'enrolment must return a seed for the authenticator app')

  // The in-flight enrolment seed is already encrypted on the challenge row.
  const challengeRow = await db.authChallenge.findFirstOrThrow({
    where: { token: challenge.body!.challengeToken },
  })
  assert.ok(challengeRow.secret)
  assert.ok(isEncryptedValue(challengeRow.secret), 'challenge seed must be encrypted')
  assert.ok(!challengeRow.secret.includes(seed), 'plaintext seed must not appear on the row')

  // Complete enrolment with a real code.
  const verified = await readResponse(
    await mfaVerify(
      authedRequest(null, '/api/auth/mfa/verify', {
        method: 'POST',
        body: { challengeToken: challenge.body!.challengeToken, code: authenticator.generate(seed) },
        headers: { 'x-forwarded-for': '10.5.5.1' },
      })
    )
  )
  assert.equal(verified.status, 200)

  // The persisted seed is encrypted.
  const user = await db.user.findUniqueOrThrow({ where: { email: 'enrol@test.local' } })
  assert.ok(user.mfaSecret)
  assert.ok(isEncryptedValue(user.mfaSecret), 'stored seed must be encrypted')
  assert.ok(!user.mfaSecret.includes(seed), 'plaintext seed must not appear in the column')

  // And it still authenticates on a subsequent sign-in.
  const second = await readResponse<{ challengeToken: string }>(
    await login(
      authedRequest(null, '/api/auth/login', {
        method: 'POST',
        body: { email: 'enrol@test.local', password: PASSWORD },
        headers: { 'x-forwarded-for': '10.5.5.2' },
      })
    )
  )
  const signedIn = await readResponse(
    await mfaVerify(
      authedRequest(null, '/api/auth/mfa/verify', {
        method: 'POST',
        body: { challengeToken: second.body!.challengeToken, code: authenticator.generate(seed) },
        headers: { 'x-forwarded-for': '10.5.5.2' },
      })
    )
  )
  assert.equal(signedIn.status, 200, 'the encrypted seed must still verify')
})

test('a seed stored before encryption is upgraded on next successful verify', { skip: !encryptionConfigured }, async () => {
  const seed = authenticator.generateSecret()
  await db.user.create({
    data: {
      email: 'legacy@test.local',
      name: 'Legacy',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      mfaEnabled: true,
      // Written in the clear, as rows predating encryption are.
      mfaSecret: seed,
      mfaExemptFromPolicy: true,
    },
  })

  const challenge = await readResponse<{ challengeToken: string }>(
    await login(
      authedRequest(null, '/api/auth/login', {
        method: 'POST',
        body: { email: 'legacy@test.local', password: PASSWORD },
        headers: { 'x-forwarded-for': '10.5.5.3' },
      })
    )
  )

  const res = await readResponse(
    await mfaVerify(
      authedRequest(null, '/api/auth/mfa/verify', {
        method: 'POST',
        body: { challengeToken: challenge.body!.challengeToken, code: authenticator.generate(seed) },
        headers: { 'x-forwarded-for': '10.5.5.3' },
      })
    )
  )

  assert.equal(res.status, 200, 'a legacy plaintext seed must still authenticate')

  const user = await db.user.findUniqueOrThrow({ where: { email: 'legacy@test.local' } })
  assert.ok(isEncryptedValue(user.mfaSecret!), 'the seed should be upgraded in place')
})
