import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET
)

function parseSessionTtlSeconds() {
  const ttlSeconds = Number.parseInt(process.env.AUTH_SESSION_TTL_SECONDS || '', 10)
  if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    return ttlSeconds
  }

  const ttlDays = Number.parseInt(process.env.AUTH_SESSION_TTL_DAYS || '30', 10)
  if (Number.isFinite(ttlDays) && ttlDays > 0) {
    return ttlDays * 24 * 60 * 60
  }

  return 30 * 24 * 60 * 60
}

export const AUTH_SESSION_TTL_SECONDS = parseSessionTtlSeconds()

export async function signToken(
  userId: string,
  sessionId?: string,
  globalRole?: string
): Promise<string> {
  const claims: Record<string, string> = { sub: userId }
  if (sessionId) {
    claims.sid = sessionId
  }
  if (globalRole) {
    claims.role = globalRole
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${AUTH_SESSION_TTL_SECONDS}s`)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWT_SECRET)
  return payload
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export const AUTH_COOKIE = 'auth-token'

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: AUTH_SESSION_TTL_SECONDS,
}
