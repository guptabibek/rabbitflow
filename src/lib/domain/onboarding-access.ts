import { NextRequest, NextResponse } from 'next/server'
import { resolveActorContext, type ActorContext } from '@/lib/domain/auth'
import { normalizeProjectRole } from '@/lib/domain/rbac'

export function isOnboardingManagerRole(role: string | null | undefined): boolean {
  return normalizeProjectRole(role ?? null) === 'Admin'
}

export async function requireOnboardingManager(
  request: NextRequest,
  projectId: string
): Promise<{ ok: true; actor: ActorContext } | { ok: false; response: NextResponse }> {
  const actor = await resolveActorContext(request, projectId)

  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  if (!isOnboardingManagerRole(actor.projectRole)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Forbidden',
          details: {
            requiredRole: 'Admin',
            currentRole: normalizeProjectRole(actor.projectRole),
          },
        },
        { status: 403 }
      ),
    }
  }

  return { ok: true, actor }
}