import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { revokeAllUserSessions } from '@/lib/auth-session'
import { invalidateUserMfaChallenges } from '@/lib/auth-otp'
import { createSecurityAuditEvent } from '@/lib/security-audit'
import { z } from 'zod'

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  avatar: z.string().nullable().optional(),
})

async function authorizeUserAccess(request: NextRequest, id: string) {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth

  if (auth.user.id !== id && auth.user.globalRole !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true as const, user: auth.user }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: id } = await params
    const access = await authorizeUserAccess(request, id)
    if (!access.ok) return access.response

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        globalRole: true,
        projectMemberships: {
          select: {
            role: true,
            joinedAt: true,
            project: {
              select: {
                id: true,
                key: true,
                name: true,
                color: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: id } = await params
    const access = await authorizeUserAccess(request, id)
    if (!access.ok) return access.response

    const body = await request.json()
    const data = updateUserSchema.parse(body)

    const normalizedUpdate = {
      ...data,
      name: data.name?.trim(),
      email: data.email?.trim().toLowerCase(),
    }

    const user = await db.user.update({
      where: { id },
      data: normalizedUpdate,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        globalRole: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

/**
 * Deactivate a user.
 *
 * This previously called `db.user.delete()`. Because `Issue.reporterId` cascaded
 * from `User`, that deleted every work item the user had ever reported, along
 * with those items' comments, attachments, activity and relations — an
 * unrecoverable loss of project history triggered by ordinary offboarding.
 *
 * Deactivation is the correct operation for a system that keeps an audit trail:
 * the account can no longer authenticate, every session is revoked, and the
 * history they authored stays intact and attributable.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: id } = await params
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    if (auth.user.globalRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (auth.user.id === id) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account.', code: 'CANNOT_DEACTIVATE_SELF' },
        { status: 400 }
      )
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    })

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await db.user.update({
      where: { id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        // Clear MFA enrolment so a future reactivation re-enrols cleanly.
        mfaReenrollRequired: true,
      },
    })

    const revoked = await revokeAllUserSessions(id, 'USER_DEACTIVATED')
    await invalidateUserMfaChallenges(id)

    await createSecurityAuditEvent({
      actorUserId: auth.user.id,
      targetUserId: id,
      action: 'USER_DEACTIVATED',
      details: { revokedSessions: revoked.count, viaEndpoint: 'DELETE /api/users/[userId]' },
    })

    return NextResponse.json({
      success: true,
      deactivated: true,
      revokedSessions: revoked.count,
    })
  } catch (error) {
    console.error('Error deactivating user:', error)
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 })
  }
}
