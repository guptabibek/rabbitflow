import { randomUUID } from 'node:crypto'
import { authenticator } from 'otplib'
import { cacheGet, cacheInvalidate, cacheSet } from '@/lib/redis'

const MFA_CHALLENGE_TTL_SECONDS = Number.parseInt(process.env.MFA_CHALLENGE_TTL_SECONDS || '600', 10)
const PASSWORD_RESET_OTP_TTL_SECONDS = Number.parseInt(process.env.PASSWORD_RESET_OTP_TTL_SECONDS || '600', 10)
const OTP_MAX_ATTEMPTS = 5

type MfaChallengePayload = {
  userId: string
  mode: 'setup' | 'verify'
  secret?: string
  attempts: number
  expiresAt: number
}

type PasswordResetOtpPayload = {
  userId: string
  code: string
  attempts: number
  expiresAt: number
}

function mfaChallengeKey(challengeToken: string) {
  return `auth:mfa:challenge:${challengeToken}`
}

function passwordResetKey(email: string) {
  return `auth:password-reset:${email.toLowerCase()}`
}

export function generateNumericOtp(length = 6) {
  const max = 10 ** length
  const min = 10 ** (length - 1)
  return String(Math.floor(Math.random() * (max - min) + min))
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

export async function createMfaChallenge(payload: Omit<MfaChallengePayload, 'attempts' | 'expiresAt'>) {
  const challengeToken = randomUUID()
  const challenge: MfaChallengePayload = {
    ...payload,
    attempts: 0,
    expiresAt: Date.now() + MFA_CHALLENGE_TTL_SECONDS * 1000,
  }

  await cacheSet(mfaChallengeKey(challengeToken), challenge, MFA_CHALLENGE_TTL_SECONDS)
  return { challengeToken, challenge }
}

export async function getMfaChallenge(challengeToken: string) {
  return cacheGet<MfaChallengePayload>(mfaChallengeKey(challengeToken))
}

export async function updateMfaChallenge(challengeToken: string, payload: MfaChallengePayload) {
  const ttl = Math.max(1, Math.ceil((payload.expiresAt - Date.now()) / 1000))
  await cacheSet(mfaChallengeKey(challengeToken), payload, ttl)
}

export async function deleteMfaChallenge(challengeToken: string) {
  await cacheInvalidate(mfaChallengeKey(challengeToken))
}

export async function invalidateAllMfaChallenges() {
  await cacheInvalidate('auth:mfa:challenge:*')
}

export async function createPasswordResetOtp(email: string, userId: string) {
  const code = generateNumericOtp()
  const payload: PasswordResetOtpPayload = {
    userId,
    code,
    attempts: 0,
    expiresAt: Date.now() + PASSWORD_RESET_OTP_TTL_SECONDS * 1000,
  }

  await cacheSet(passwordResetKey(email), payload, PASSWORD_RESET_OTP_TTL_SECONDS)
  return { code, payload }
}

export async function getPasswordResetOtp(email: string) {
  return cacheGet<PasswordResetOtpPayload>(passwordResetKey(email))
}

export async function updatePasswordResetOtp(email: string, payload: PasswordResetOtpPayload) {
  const ttl = Math.max(1, Math.ceil((payload.expiresAt - Date.now()) / 1000))
  await cacheSet(passwordResetKey(email), payload, ttl)
}

export async function deletePasswordResetOtp(email: string) {
  await cacheInvalidate(passwordResetKey(email))
}

export function isOtpExpired(expiresAt: number) {
  return Date.now() > expiresAt
}

export function reachedOtpAttemptLimit(attempts: number) {
  return attempts >= OTP_MAX_ATTEMPTS
}
