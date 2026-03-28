import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth'
import {
  hasPermission,
  listPermissions,
  normalizeProjectRole,
  Permission,
} from '@/lib/domain/rbac'
import { canAccessProjectPermission, getProjectPermissionRules } from '@/lib/domain/access-control'

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
}

const ALLOW_HEADER_AUTH = process.env.ALLOW_HEADER_AUTH === 'true'

async function getIdentityFromRequest(request: NextRequest): Promise<RequestIdentity | null> {
  const headerUser = request.headers.get('x-user-id')
  if (ALLOW_HEADER_AUTH && headerUser) {
    return {
      userId: headerUser,
      sessionId: request.headers.get('x-session-id') || null,
    }
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

export async function resolveActorContext(
  request: NextRequest,
  projectId: string
): Promise<ActorContext | null> {
  const identity = await getIdentityFromRequest(request)
  if (!identity) return null

  const sessionOk = await validateActiveSession(identity)
  if (!sessionOk) return null

  const user = await db.user.findUnique({
    where: { id: identity.userId },
    select: { id: true, globalRole: true, isActive: true },
  })

  if (!user || !user.isActive) {
    return null
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
        userId: user.id,
        projectRole: 'Admin',
        extraPermissions: [],
        sessionId: identity.sessionId,
      }
    }

    return null
  }

  return {
    userId: membership.userId,
    projectRole: membership.role,
    extraPermissions: Array.isArray(membership.extraPermissions)
      ? membership.extraPermissions.filter((value): value is string => typeof value === 'string')
      : [],
    sessionId: identity.sessionId,
  }
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
  const actor = await resolveActorContext(request, projectId)

  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

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
