import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth'
import {
  hasPermission,
  listPermissions,
  normalizeProjectRole,
  type Permission,
} from '@/lib/domain/rbac'
import { canAccessProjectPermission, getProjectPermissionRules } from '@/lib/domain/access-control'
import {
  authenticateApiToken,
  readBearerToken,
  tokenAllowsMethod,
} from '@/lib/domain/api-token'

export type ActorContext = {
  userId: string
  projectRole: string | null
  extraPermissions: string[]
  sessionId: string | null
}

export type AuthenticatedUser = {
  id: string
  email: string
  name: string
  avatar: string | null
  globalRole: string
  sessionId: string | null
}

type RequestIdentity = {
  userId: string
  sessionId: string | null
  /** Set when the request authenticated with an API token rather than a cookie. */
  apiTokenId?: string
  /** Set when a valid token lacked the scope for this request's method. */
  tokenScopeDenied?: boolean
}

/**
 * Development-only escape hatch: treat an `x-user-id` header as proof of
 * identity, with no token verification.
 *
 * Hard-disabled in production regardless of configuration. A single stray
 * environment variable would otherwise turn any request that reaches the app
 * directly — bypassing the proxy — into an authenticated one for an arbitrary
 * user id.
 */
const ALLOW_HEADER_AUTH =
  process.env.ALLOW_HEADER_AUTH === 'true' && process.env.NODE_ENV !== 'production'

if (process.env.ALLOW_HEADER_AUTH === 'true' && process.env.NODE_ENV === 'production') {
  console.error(
    'SECURITY: ALLOW_HEADER_AUTH=true was ignored because NODE_ENV=production. ' +
      'Header-based authentication is never permitted in production.'
  )
}

async function getIdentityFromRequest(request: NextRequest): Promise<RequestIdentity | null> {
  const headerUser = request.headers.get('x-user-id')
  if (ALLOW_HEADER_AUTH && headerUser) {
    return {
      userId: headerUser,
      sessionId: request.headers.get('x-session-id') || null,
    }
  }

  // Bearer tokens for programmatic access. Checked before the cookie so an
  // explicit Authorization header always wins over an incidental browser session.
  const bearer = readBearerToken(request)
  if (bearer) {
    const identity = await authenticateApiToken(bearer)
    if (!identity) return null

    if (!tokenAllowsMethod(identity, request.method)) {
      // Distinguished from "unknown token" by the caller: a valid read-only token
      // attempting a write is a scope failure, not an authentication failure.
      return { userId: identity.userId, sessionId: null, tokenScopeDenied: true }
    }

    // API tokens carry no session: they are not revoked by signing out, and are
    // instead revoked individually through the token management UI.
    return { userId: identity.userId, sessionId: null, apiTokenId: identity.tokenId }
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value
  if (!token) return null

  try {
    const payload = await verifyToken(token)
    const userId = typeof payload.sub === 'string' ? payload.sub : null
    if (!userId) return null

    const sessionId =
      typeof (payload as { sid?: unknown }).sid === 'string'
        ? ((payload as { sid?: string }).sid ?? null)
        : null

    return { userId, sessionId }
  } catch {
    return null
  }
}

async function validateActiveSession(identity: RequestIdentity): Promise<boolean> {
  if (!identity.sessionId) return true

  const session = await db.authSession.findFirst({
    where: {
      id: identity.sessionId,
      userId: identity.userId,
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      lastSeenAt: true,
    },
  })

  if (!session) {
    return false
  }

  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })
  }

  return true
}

async function getAuthenticatedUserFromIdentity(
  identity: RequestIdentity
): Promise<AuthenticatedUser | null> {
  const sessionOk = await validateActiveSession(identity)
  if (!sessionOk) {
    return null
  }

  const user = await db.user.findUnique({
    where: { id: identity.userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      globalRole: true,
      isActive: true,
    },
  })

  if (!user || !user.isActive) {
    return null
  }

  return {
    ...user,
    sessionId: identity.sessionId,
  }
}

export async function getAuthenticatedUserFromToken(
  token: string | null | undefined
): Promise<AuthenticatedUser | null> {
  if (!token) return null

  try {
    const payload = await verifyToken(token)
    const userId = typeof payload.sub === 'string' ? payload.sub : null
    if (!userId) return null

    const sessionId =
      typeof (payload as { sid?: unknown }).sid === 'string'
        ? ((payload as { sid?: string }).sid ?? null)
        : null

    return getAuthenticatedUserFromIdentity({ userId, sessionId })
  } catch {
    return null
  }
}

/**
 * Why an actor could not be resolved.
 *
 * The distinction matters to clients: `unauthenticated` means the session is
 * gone and the user should be sent to sign in, whereas `not-a-member` means the
 * session is perfectly valid and only *this* resource is off limits. Collapsing
 * both into 401 caused clients to treat "you were removed from this project" as
 * "your session expired" and log the user out of the whole product.
 */
export type ActorResolutionFailure = 'unauthenticated' | 'not-a-member' | 'token-scope'

export type ActorResolution =
  | { ok: true; actor: ActorContext }
  | { ok: false; reason: ActorResolutionFailure }

export async function resolveActorContextResult(
  request: NextRequest,
  projectId: string
): Promise<ActorResolution> {
  const identity = await getIdentityFromRequest(request)
  if (!identity) return { ok: false, reason: 'unauthenticated' }
  if (identity.tokenScopeDenied) return { ok: false, reason: 'token-scope' }

  const sessionOk = await validateActiveSession(identity)
  if (!sessionOk) return { ok: false, reason: 'unauthenticated' }

  const user = await db.user.findUnique({
    where: { id: identity.userId },
    select: { id: true, globalRole: true, isActive: true },
  })

  if (!user || !user.isActive) {
    return { ok: false, reason: 'unauthenticated' }
  }

  const membership = await db.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: identity.userId,
      },
    },
    select: {
      role: true,
      extraPermissions: true,
      userId: true,
    },
  })

  if (!membership) {
    // Fall back to system-wide admin role
    if (user?.globalRole === 'admin') {
      return {
        ok: true,
        actor: {
          userId: user.id,
          projectRole: 'Admin',
          extraPermissions: [],
          sessionId: identity.sessionId,
        },
      }
    }

    // Authenticated, but not a member of this project.
    return { ok: false, reason: 'not-a-member' }
  }

  return {
    ok: true,
    actor: {
      userId: membership.userId,
      projectRole: membership.role,
      extraPermissions: Array.isArray(membership.extraPermissions)
        ? membership.extraPermissions.filter((value): value is string => typeof value === 'string')
        : [],
      sessionId: identity.sessionId,
    },
  }
}

/**
 * Convenience wrapper preserving the original nullable contract for callers that
 * do not need to distinguish the failure reason.
 */
export async function resolveActorContext(
  request: NextRequest,
  projectId: string
): Promise<ActorContext | null> {
  const result = await resolveActorContextResult(request, projectId)
  return result.ok ? result.actor : null
}

/**
 * Check project-level permission for the current request actor.
 */
export async function requireProjectPermission(
  request: NextRequest,
  projectId: string,
  permission: Permission,
  _fallbackUserId?: string | null,
  options?: { areaId?: string | null; allowScoped?: boolean }
): Promise<{ ok: true; actor: ActorContext } | { ok: false; response: NextResponse }> {
  const resolution = await resolveActorContextResult(request, projectId)

  if (!resolution.ok) {
    // 401 only when there is no usable session. A valid session that simply lacks
    // access to this project must be 403, otherwise clients interpret it as an
    // expired session and sign the user out of the entire application.
    if (resolution.reason === 'unauthenticated') {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
      }
    }

    if (resolution.reason === 'token-scope') {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: 'This API token is read-only and cannot perform write operations.',
            code: 'TOKEN_SCOPE_INSUFFICIENT',
          },
          { status: 403 }
        ),
      }
    }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          details: { requiredPermission: permission, reason: 'not-a-project-member' },
        },
        { status: 403 }
      ),
    }
  }

  const actor = resolution.actor

  const access = await canAccessProjectPermission(projectId, actor.projectRole, permission, {
    ...options,
    extraPermissions: actor.extraPermissions,
  })

  if (!access.granted) {
    const normalizedRole = normalizeProjectRole(actor.projectRole)
    const rules = await getProjectPermissionRules(projectId)
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          details: {
            role: normalizedRole,
            requiredPermission: permission,
            grantedPermissions: listPermissions(normalizedRole, {
              rules: rules.map((rule) => ({
                role: rule.role,
                permission: rule.permission,
                effect: rule.effect,
                areaId: rule.areaId,
              })),
              areaId: options?.areaId ?? null,
              extraPermissions: actor.extraPermissions,
            }),
          },
        },
        { status: 403 }
      ),
    }
  }

  return { ok: true, actor }
}

/**
 * Check an additional permission for an actor that has already been resolved.
 *
 * Each `requireProjectPermission` call re-runs the whole chain — verify JWT,
 * load the session, load the user, load the membership, load the ACL rules.
 * A create that also assigns and transitions therefore paid for three full
 * resolutions (~15 queries) before writing a single row. Routes needing several
 * permissions should resolve the actor once and use this for the rest.
 */
export async function checkActorPermission(
  actor: ActorContext,
  projectId: string,
  permission: Permission,
  options?: { areaId?: string | null }
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const access = await canAccessProjectPermission(projectId, actor.projectRole, permission, {
    ...options,
    extraPermissions: actor.extraPermissions,
  })

  if (access.granted) return { ok: true }

  const normalizedRole = normalizeProjectRole(actor.projectRole)
  const rules = await getProjectPermissionRules(projectId)

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Forbidden',
        details: {
          role: normalizedRole,
          requiredPermission: permission,
          grantedPermissions: listPermissions(normalizedRole, {
            rules: rules.map((rule) => ({
              role: rule.role,
              permission: rule.permission,
              effect: rule.effect,
              areaId: rule.areaId,
            })),
            areaId: options?.areaId ?? null,
            extraPermissions: actor.extraPermissions,
          }),
        },
      },
      { status: 403 }
    ),
  }
}

export async function requireAuthenticatedUser(
  request: NextRequest
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }> {
  const identity = await getIdentityFromRequest(request)

  if (!identity) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  if (identity.tokenScopeDenied) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'This API token is read-only and cannot perform write operations.',
          code: 'TOKEN_SCOPE_INSUFFICIENT',
        },
        { status: 403 }
      ),
    }
  }

  const user = await getAuthenticatedUserFromIdentity(identity)

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Session expired, revoked, or user unavailable' }, { status: 401 }),
    }
  }

  return {
    ok: true,
    user,
  }
}

export async function requireSystemAdmin(
  request: NextRequest
): Promise<{ ok: true; user: AuthenticatedUser } | { ok: false; response: NextResponse }> {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth

  if (auth.user.globalRole !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return auth
}
