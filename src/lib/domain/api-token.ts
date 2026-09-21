import { createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'

/**
 * API token authentication.
 *
 * Tokens were previously minted, hashed and listed in a full management UI, but
 * nothing anywhere validated them: no bearer handling existed, `lastUsedAt` could
 * never populate, and `scopes` accepted arbitrary strings that were enforced
 * nowhere. Users were issuing credentials that granted nothing.
 */

/** Scopes a token may carry. Kept deliberately coarse. */
export const API_TOKEN_SCOPES = ['read', 'write'] as const

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]

export function isApiTokenScope(value: string): value is ApiTokenScope {
  return (API_TOKEN_SCOPES as readonly string[]).includes(value)
}

const TOKEN_PREFIX = 'rf'

export type GeneratedApiToken = {
  /** Full secret. Shown to the user exactly once, never stored. */
  token: string
  /** Non-secret identifier, safe to display in listings. */
  prefix: string
  /** SHA-256 of the full token — what actually goes in the database. */
  tokenHash: string
}

export function generateApiToken(): GeneratedApiToken {
  const prefix = `${TOKEN_PREFIX}_${randomBytes(4).toString('hex')}`
  const secret = randomBytes(32).toString('hex')
  const token = `${prefix}_${secret}`

  return { token, prefix, tokenHash: hashApiToken(token) }
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Extract a bearer token from the Authorization header, if present. */
export function readBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null

  const [scheme, ...rest] = header.split(' ')
  if (scheme.toLowerCase() !== 'bearer') return null

  const value = rest.join(' ').trim()
  return value.length > 0 ? value : null
}

export type ApiTokenIdentity = {
  userId: string
  tokenId: string
  scopes: ApiTokenScope[]
}

/**
 * Resolve a bearer token to its owner.
 *
 * Returns null for absent, malformed, unknown, revoked or expired tokens — the
 * caller cannot distinguish these, which is intentional.
 */
export async function authenticateApiToken(token: string): Promise<ApiTokenIdentity | null> {
  // Cheap shape check before hitting the database.
  if (!token.startsWith(`${TOKEN_PREFIX}_`)) return null

  const tokenHash = hashApiToken(token)

  const record = await db.apiToken.findFirst({
    where: {
      tokenHash,
      isRevoked: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      userId: true,
      scopes: true,
      lastUsedAt: true,
      user: { select: { isActive: true } },
    },
  })

  if (!record || !record.user.isActive) return null

  const scopes = Array.isArray(record.scopes)
    ? record.scopes.filter((scope): scope is ApiTokenScope =>
        typeof scope === 'string' && isApiTokenScope(scope)
      )
    : []

  // Throttled so a busy integration does not write on every request.
  const lastUsedAt = record.lastUsedAt?.getTime() ?? 0
  if (Date.now() - lastUsedAt > 60_000) {
    await db.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {
        // Usage tracking is best-effort; never fail a request over it.
      })
  }

  return { userId: record.userId, tokenId: record.id, scopes }
}

/**
 * Whether a token identity may perform a mutating request.
 *
 * Read-only tokens are restricted to safe HTTP methods.
 */
export function tokenAllowsMethod(identity: ApiTokenIdentity, method: string): boolean {
  const isSafeMethod = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  if (isSafeMethod) return identity.scopes.includes('read') || identity.scopes.includes('write')
  return identity.scopes.includes('write')
}
