import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_COOKIE, verifyToken } from '@/lib/auth'
import {
  hasPermission,
  listPermissions,
  normalizeProjectRole,
  Permission,
} from '@/lib/domain/rbac'

export type ActorContext = {
  userId: string
  projectRole: string | null
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

async function getIdentityFromRequest(request: NextRequest): Promise<RequestIdentity | null> {
  const headerUser = request.headers.get('x-user-id')
  if (headerUser) {
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

export async function resolveActorContext(
  request: NextRequest,
  projectId: string
): Promise<ActorContext | null> {
  const identity = await getIdentityFromRequest(request)
  if (!identity) return null

  const sessionOk = await validateActiveSession(identity)
  if (!sessionOk) return null

  const membership = await db.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: identity.userId,
      },
    },
    select: {
      role: true,
      userId: true,
    },
  })

  if (!membership) {
    // Fall back to system-wide admin role
    const user = await db.user.findUnique({
      where: { id: identity.userId },
      select: { id: true, globalRole: true },
    })

    if (user?.globalRole === 'admin') {
      return { userId: user.id, projectRole: 'Admin', sessionId: identity.sessionId }
    }

    return null
  }

  return {
    userId: membership.userId,
    projectRole: membership.role,
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
  _fallbackUserId?: string | null
): Promise<{ ok: true; actor: ActorContext } | { ok: false; response: NextResponse }> {
  const actor = await resolveActorContext(request, projectId)

  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  if (!hasPermission(actor.projectRole, permission)) {
    const normalizedRole = normalizeProjectRole(actor.projectRole)
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          details: {
            role: normalizedRole,
            requiredPermission: permission,
            grantedPermissions: listPermissions(normalizedRole),
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

  const sessionOk = await validateActiveSession(identity)
  if (!sessionOk) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Session expired or revoked' }, { status: 401 }),
    }
  }

  const user = await db.user.findUnique({
    where: { id: identity.userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      globalRole: true,
    },
  })

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'User not found' }, { status: 404 }),
    }
  }

  return {
    ok: true,
    user: {
      ...user,
      sessionId: identity.sessionId,
    },
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
