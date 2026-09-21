import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { db, resetDatabase, disconnect } from './support/db.ts'
import { authedRequest, readResponse } from './support/fixtures.ts'

import { POST as login } from '../../src/app/api/auth/login/route.ts'
import { POST as mfaVerify } from '../../src/app/api/auth/mfa/verify/route.ts'
import { POST as logout } from '../../src/app/api/auth/logout/route.ts'
import { POST as register } from '../../src/app/api/auth/register/route.ts'

/**
 * The authentication pipeline end to end.
 *
 * These cover the exact defects found during the audit — the admin MFA bypass,
 * challenge durability, the account-lockout DoS lever — so a regression fails
 * here rather than in production.
 */

const PASSWORD = 'Password123!'
let passwordHash: string

async function makeUser(options: {
  email: string
  globalRole?: string
  mfaEnabled?: boolean
  mfaSecret?: string | null
  isActive?: boolean
}) {
  return db.user.create({
    data: {
      email: options.email,
      name: options.email.split('@')[0],
      passwordHash,
      globalRole: options.globalRole ?? 'member',
      mfaEnabled: options.mfaEnabled ?? false,
      mfaSecret: options.mfaSecret ?? null,
      // Exempt from the enrolment policy unless a test opts in, so tests that
      // are not about MFA get a plain password login.
      mfaExemptFromPolicy: true,
      isActive: options.isActive ?? true,
    },
  })
}

function loginRequest(email: string, password: string, ip = '10.1.1.1') {
  return authedRequest(null, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
    // Rate limiting keys on client IP; vary it so unrelated tests do not
    // exhaust one another's budget.
    headers: { 'x-forwarded-for': ip },
  })
}

before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4) // low cost: these are throwaway
  await resetDatabase()
})

after(async () => {
  await disconnect()
})

beforeEach(async () => {
  await db.authChallenge.deleteMany({})
  await db.authSession.deleteMany({})
  await db.user.deleteMany({})
})

// ---------------------------------------------------------------------------
// Password login
// ---------------------------------------------------------------------------

test('a correct password issues a session', async () => {
  await makeUser({ email: 'ok@test.local' })

  const res = await readResponse<{ user: { email: string } }>(
    await login(loginRequest('ok@test.local', PASSWORD, '10.1.1.10'))
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.user.email, 'ok@test.local')
  assert.equal(await db.authSession.count({ where: { revokedAt: null } }), 1)
})

test('a wrong password is refused and issues no session', async () => {
  await makeUser({ email: 'wrong@test.local' })

  const res = await readResponse(
    await login(loginRequest('wrong@test.local', 'not-the-password', '10.1.1.11'))
  )

  assert.equal(res.status, 401)
  assert.equal(await db.authSession.count(), 0)
})

test('an unknown email is refused without disclosing that it is unknown', async () => {
  const res = await readResponse<{ error: string }>(
    await login(loginRequest('nobody@test.local', PASSWORD, '10.1.1.12'))
  )

  assert.equal(res.status, 401)
  assert.match(res.body?.error ?? '', /invalid email or password/i)
})

test('a deactivated account cannot sign in', async () => {
  const user = await makeUser({ email: 'gone@test.local' })
  await db.user.update({
    where: { id: user.id },
    data: { isActive: false, deactivatedAt: new Date() },
  })

  const res = await readResponse<{ code: string }>(
    await login(loginRequest('gone@test.local', PASSWORD, '10.1.1.13'))
  )

  assert.equal(res.status, 403)
  assert.equal(res.body?.code, 'ACCOUNT_DEACTIVATED')
})

test('repeated failures lock the account', async () => {
  await makeUser({ email: 'lockme@test.local' })

  // Three failures is the configured threshold.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await login(loginRequest('lockme@test.local', 'bad', '10.1.1.14'))
  }

  const locked = await readResponse<{ code: string }>(
    await login(loginRequest('lockme@test.local', 'bad', '10.1.1.14'))
  )
  assert.equal(locked.status, 423)
  assert.equal(locked.body?.code, 'ACCOUNT_LOCKED')

  // The correct password is refused while the lock stands.
  const afterLock = await readResponse<{ code: string }>(
    await login(loginRequest('lockme@test.local', PASSWORD, '10.1.1.14'))
  )
  assert.equal(afterLock.status, 423)
})

test('login is rate limited independently of the account lockout', async () => {
  await makeUser({ email: 'flood@test.local' })

  const statuses: number[] = []
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const res = await login(loginRequest('flood@test.local', 'bad', '10.9.9.9'))
    statuses.push(res.status)
  }

  // Without a rate limit the 3-attempt lockout is also a denial-of-service
  // lever: anyone knowing an address could lock that user out repeatedly.
  assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(',')}`)
})

// ---------------------------------------------------------------------------
// MFA
// ---------------------------------------------------------------------------

test('a user with MFA enrolled is challenged rather than signed in', async () => {
  const secret = authenticator.generateSecret()
  await makeUser({ email: 'mfa@test.local', mfaEnabled: true, mfaSecret: secret })

  const res = await readResponse<{ mfaRequired: boolean; challengeToken: string }>(
    await login(loginRequest('mfa@test.local', PASSWORD, '10.1.1.20'))
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.mfaRequired, true)
  assert.ok(res.body?.challengeToken)
  // Critically: no session yet.
  assert.equal(await db.authSession.count(), 0)
})

test('system administrators are challenged too', async () => {
  // The login route previously returned a session for any globalRole === admin
  // before MFA was considered, exempting the highest-privilege accounts — even
  // when they had explicitly enrolled.
  const secret = authenticator.generateSecret()
  await makeUser({
    email: 'admin@test.local',
    globalRole: 'admin',
    mfaEnabled: true,
    mfaSecret: secret,
  })

  const res = await readResponse<{ mfaRequired: boolean }>(
    await login(loginRequest('admin@test.local', PASSWORD, '10.1.1.21'))
  )

  assert.equal(res.body?.mfaRequired, true)
  assert.equal(await db.authSession.count(), 0, 'admin must not receive a session before MFA')
})

test('a valid TOTP code completes sign-in', async () => {
  const secret = authenticator.generateSecret()
  await makeUser({ email: 'totp@test.local', mfaEnabled: true, mfaSecret: secret })

  const challenge = await readResponse<{ challengeToken: string }>(
    await login(loginRequest('totp@test.local', PASSWORD, '10.1.1.22'))
  )

  const res = await readResponse<{ user: { email: string } }>(
    await mfaVerify(
      authedRequest(null, '/api/auth/mfa/verify', {
        method: 'POST',
        body: {
          challengeToken: challenge.body?.challengeToken,
          code: authenticator.generate(secret),
        },
        headers: { 'x-forwarded-for': '10.1.1.22' },
      })
    )
  )

  assert.equal(res.status, 200)
  assert.equal(res.body?.user.email, 'totp@test.local')
  assert.equal(await db.authSession.count({ where: { revokedAt: null } }), 1)
})

test('an invalid TOTP code is refused and issues no session', async () => {
  const secret = authenticator.generateSecret()
  await makeUser({ email: 'badtotp@test.local', mfaEnabled: true, mfaSecret: secret })

  const challenge = await readResponse<{ challengeToken: string }>(
    await login(loginRequest('badtotp@test.local', PASSWORD, '10.1.1.23'))
  )

  const res = await readResponse(
    await mfaVerify(
      authedRequest(null, '/api/auth/mfa/verify', {
        method: 'POST',
        body: { challengeToken: challenge.body?.challengeToken, code: '000000' },
        headers: { 'x-forwarded-for': '10.1.1.23' },
      })
    )
  )

  assert.equal(res.status, 401)
  assert.equal(await db.authSession.count(), 0)
})

test('MFA challenges are persisted in the database, not a cache', async () => {
  // This is the SEC-002 regression. Challenges lived in Redis via a helper that
  // silently discards writes when Redis is down, so an outage issued tokens
  // that could never be verified and locked every non-admin out permanently.
  const secret = authenticator.generateSecret()
  const user = await makeUser({ email: 'durable@test.local', mfaEnabled: true, mfaSecret: secret })

  const challenge = await readResponse<{ challengeToken: string }>(
    await login(loginRequest('durable@test.local', PASSWORD, '10.1.1.24'))
  )

  const row = await db.authChallenge.findFirst({
    where: { userId: user.id, kind: 'mfa', consumedAt: null },
  })

  assert.ok(row, 'the challenge must exist as a durable row')
  assert.equal(row?.token, challenge.body?.challengeToken)
})

test('a consumed challenge cannot be replayed', async () => {
  const secret = authenticator.generateSecret()
  await makeUser({ email: 'replay@test.local', mfaEnabled: true, mfaSecret: secret })

  const challenge = await readResponse<{ challengeToken: string }>(
    await login(loginRequest('replay@test.local', PASSWORD, '10.1.1.25'))
  )
  const token = challenge.body?.challengeToken

  const first = await mfaVerify(
    authedRequest(null, '/api/auth/mfa/verify', {
      method: 'POST',
      body: { challengeToken: token, code: authenticator.generate(secret) },
      headers: { 'x-forwarded-for': '10.1.1.25' },
    })
  )
  assert.equal(first.status, 200)

  const replayed = await readResponse(
    await mfaVerify(
      authedRequest(null, '/api/auth/mfa/verify', {
        method: 'POST',
        body: { challengeToken: token, code: authenticator.generate(secret) },
        headers: { 'x-forwarded-for': '10.1.1.25' },
      })
    )
  )

  assert.equal(replayed.status, 401, 'a consumed challenge must not be reusable')
})

// ---------------------------------------------------------------------------
// Logout and registration
// ---------------------------------------------------------------------------

test('logout revokes the session server-side, not just the cookie', async () => {
  await makeUser({ email: 'bye@test.local' })

  const signIn = await login(loginRequest('bye@test.local', PASSWORD, '10.1.1.30'))
  const cookie = signIn.headers.get('set-cookie') ?? ''
  const token = cookie.match(/auth-token=([^;]+)/)?.[1]
  assert.ok(token)

  const res = await logout(
    authedRequest(null, '/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `auth-token=${token}` },
    })
  )

  assert.equal(res.status, 200)
  const session = await db.authSession.findFirst({ where: { revokedAt: { not: null } } })
  assert.ok(session, 'the session row must be revoked')
  assert.equal(session?.revokedReason, 'USER_LOGOUT')
})

test('self-registration is refused unless explicitly enabled', async () => {
  // ALLOW_SELF_REGISTRATION is unset in the test environment, matching the
  // production default.
  const res = await readResponse<{ code: string }>(
    await register(
      authedRequest(null, '/api/auth/register', {
        method: 'POST',
        body: { name: 'Nope', email: 'nope@test.local', password: PASSWORD },
        headers: { 'x-forwarded-for': '10.1.1.40' },
      })
    )
  )

  assert.equal(res.status, 403)
  assert.equal(res.body?.code, 'REGISTRATION_DISABLED')
  assert.equal(await db.user.count({ where: { email: 'nope@test.local' } }), 0)
})
