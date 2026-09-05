import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { authenticator } from 'otplib'
import { db } from '@/lib/db'

const MFA_CHALLENGE_TTL_SECONDS = Number.parseInt(process.env.MFA_CHALLENGE_TTL_SECONDS || '600', 10)
const PASSWORD_RESET_OTP_TTL_SECONDS = Number.parseInt(process.env.PASSWORD_RESET_OTP_TTL_SECONDS || '600', 10)
const OTP_MAX_ATTEMPTS = 5

const KIND_MFA = 'mfa'
const KIND_PASSWORD_RESET = 'password_reset'

export type MfaChallengePayload = {
  userId: string
  mode: 'setup' | 'verify'
  secret?: string
  attempts: number
  expiresAt: number
}

export type PasswordResetOtpPayload = {
  userId: string
  codeHash: string
  attempts: number
  expiresAt: number
}

/**
 * Generate a numeric one-time code using a cryptographically secure RNG.
 *
 * `Math.random()` must never be used here: it is a non-cryptographic PRNG whose
 * internal state is recoverable from a modest number of observed outputs, which
 * would make subsequent account-recovery codes predictable.
 */
export function generateNumericOtp(length = 6) {
  const min = 10 ** (length - 1)
  const max = 10 ** length
  return String(randomInt(min, max))
}

/**
 * Constant-time comparison for secret values (OTPs, shared secrets).
 *
 * Falls back to a `false` result rather than throwing when lengths differ, while
 * still comparing a fixed number of bytes so the timing signal stays flat.
 */
export function secretsMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const providedBuffer = Buffer.from(provided, 'utf8')

  if (expectedBuffer.length !== providedBuffer.length) {
    // Still perform a comparison of equal-length buffers so that a length
    // mismatch is not distinguishable by timing alone.
    timingSafeEqual(expectedBuffer, expectedBuffer)
    return false
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

/** OTPs are persisted as a digest so a database dump never yields a live code. */
export function hashOtpCode(code: string): string {
  return createHash('sha256').update(code.trim(), 'utf8').digest('hex')
}

export function createTotpSecret() {
  return authenticator.generateSecret()
}

export function verifyTotpCode(secret: string, code: string) {
  const normalizedCode = code.replace(/\s+/g, '')
  authenticator.options = { window: 1 }
  return authenticator.check(normalizedCode, secret)
}

export function createTotpOtpAuthUrl(email: string, secret: string) {
  const issuer = process.env.MFA_ISSUER || 'RabbitFlow'
  return authenticator.keyuri(email, issuer, secret)
}

// ---------------------------------------------------------------------------
// MFA challenges
//
// Persisted in PostgreSQL rather than Redis. These rows are authentication
// state: if the write is lost the user cannot complete sign-in, so it must not
// live in a cache whose writes are dropped when the cache is unreachable.
// ---------------------------------------------------------------------------

export async function createMfaChallenge(
  payload: Omit<MfaChallengePayload, 'attempts' | 'expiresAt'>
) {
  const challengeToken = randomUUID()
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_SECONDS * 1000)

  // Supersede any other in-flight MFA challenge for this user so an abandoned
  // attempt cannot be resumed alongside a fresh one.
  await db.authChallenge.updateMany({
    where: { userId: payload.userId, kind: KIND_MFA, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  await db.authChallenge.create({
    data: {
      token: challengeToken,
      kind: KIND_MFA,
      userId: payload.userId,
      // `mode` is encoded in the secret's presence: setup carries the seed being
      // enrolled, verify reads the seed already stored on the user.
      secret: payload.mode === 'setup' ? (payload.secret ?? null) : null,
      codeHash: payload.mode,
      expiresAt,
    },
  })

  const challenge: MfaChallengePayload = {
    ...payload,
    attempts: 0,
    expiresAt: expiresAt.getTime(),
  }

  return { challengeToken, challenge }
}

export async function getMfaChallenge(
  challengeToken: string
): Promise<MfaChallengePayload | null> {
  const row = await db.authChallenge.findFirst({
    where: { token: challengeToken, kind: KIND_MFA, consumedAt: null },
    select: {
      userId: true,
      secret: true,
      codeHash: true,
      attempts: true,
      expiresAt: true,
    },
  })

  if (!row) return null

  return {
    userId: row.userId,
    mode: row.codeHash === 'setup' ? 'setup' : 'verify',
    secret: row.secret ?? undefined,
    attempts: row.attempts,
    expiresAt: row.expiresAt.getTime(),
  }
}

export async function updateMfaChallenge(challengeToken: string, payload: MfaChallengePayload) {
  await db.authChallenge.updateMany({
    where: { token: challengeToken, kind: KIND_MFA, consumedAt: null },
    data: { attempts: payload.attempts },
  })
}

export async function deleteMfaChallenge(challengeToken: string) {
  // Marked consumed rather than deleted so the row remains available for
  // forensic review until the expiry sweep removes it.
  await db.authChallenge.updateMany({
    where: { token: challengeToken, kind: KIND_MFA, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}

export async function invalidateAllMfaChallenges() {
  await db.authChallenge.updateMany({
    where: { kind: KIND_MFA, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}

export async function invalidateUserMfaChallenges(userId: string) {
  await db.authChallenge.updateMany({
    where: { userId, kind: KIND_MFA, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}

// ---------------------------------------------------------------------------
// Password-reset OTPs
//
// Keyed by user rather than by email so a change of address cannot orphan an
// in-flight reset, and stored as a SHA-256 digest so the emailed code is never
// recoverable from the database.
// ---------------------------------------------------------------------------

export async function createPasswordResetOtp(email: string, userId: string) {
  const code = generateNumericOtp()
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_TTL_SECONDS * 1000)

  // Only one reset may be in flight at a time; issuing a new code invalidates
  // any previous one so an older email cannot still be redeemed.
  await db.authChallenge.updateMany({
    where: { userId, kind: KIND_PASSWORD_RESET, consumedAt: null },
    data: { consumedAt: new Date() },
  })

  await db.authChallenge.create({
    data: {
      token: randomUUID(),
      kind: KIND_PASSWORD_RESET,
      userId,
      codeHash: hashOtpCode(code),
      expiresAt,
    },
  })

  const payload: PasswordResetOtpPayload = {
    userId,
    codeHash: hashOtpCode(code),
    attempts: 0,
    expiresAt: expiresAt.getTime(),
  }

  // The plaintext code is returned once, for the outbound email only.
  return { code, payload }
}

export async function getPasswordResetOtp(
  email: string
): Promise<PasswordResetOtpPayload | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  })

  if (!user) return null

  const row = await db.authChallenge.findFirst({
    where: { userId: user.id, kind: KIND_PASSWORD_RESET, consumedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, codeHash: true, attempts: true, expiresAt: true },
  })

  if (!row || !row.codeHash) return null

  return {
    userId: row.userId,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt.getTime(),
  }
}

export async function updatePasswordResetOtp(
  email: string,
  payload: PasswordResetOtpPayload
) {
  await db.authChallenge.updateMany({
    where: { userId: payload.userId, kind: KIND_PASSWORD_RESET, consumedAt: null },
    data: { attempts: payload.attempts },
  })
}

export async function deletePasswordResetOtp(email: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  })

  if (!user) return

  await db.authChallenge.updateMany({
    where: { userId: user.id, kind: KIND_PASSWORD_RESET, consumedAt: null },
    data: { consumedAt: new Date() },
  })
}

/**
 * Remove expired and consumed challenge rows. Called from the scheduled-job
 * endpoint so the table does not grow without bound.
 */
export async function purgeExpiredAuthChallenges(now = new Date()) {
  const result = await db.authChallenge.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        // Consumed rows are retained briefly for forensics, then removed.
        { consumedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      ],
    },
  })

  return result.count
}

export function isOtpExpired(expiresAt: number) {
  return Date.now() > expiresAt
}

export function reachedOtpAttemptLimit(attempts: number) {
  return attempts >= OTP_MAX_ATTEMPTS
}
