import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { invalidateAllMfaChallenges } from '@/lib/auth-otp'
import { requireSystemAdmin } from '@/lib/domain/auth'
import { createSecurityAuditEvent } from '@/lib/security-audit'

const updateMfaSchema = z.object({
  action: z.enum(['enable', 'disable']),
  revokeSessions: z.boolean().optional().default(true),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { userId: id } = await params
    const body = await request.json().catch(() => ({}))
    const { action, revokeSessions } = updateMfaSchema.parse(body)

    const targetUser = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!targetUser.isActive) {
      return NextResponse.json({ error: 'Cannot manage MFA for a deactivated user' }, { status: 409 })
    }

    const now = new Date()

    const result = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data:
          action === 'enable'
            ? {
                mfaSecret: null,
                mfaEnabled: false,
                mfaEnabledAt: null,
                mfaExemptFromPolicy: false,
                mfaReenrollRequired: true,
              }
            : {
                mfaSecret: null,
                mfaEnabled: false,
                mfaEnabledAt: null,
                mfaExemptFromPolicy: true,
                mfaReenrollRequired: false,
              },
      })

      let revokedSessions = 0
      if (revokeSessions) {
        const revoked = await tx.authSession.updateMany({
          where: {
            userId: id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedReason: `ADMIN_MFA_${action.toUpperCase()}_BY:${admin.user.id}`,
          },
        })
        revokedSessions = revoked.count
      }

      return { revokedSessions }
    })

    await createSecurityAuditEvent({
      actorUserId: admin.user.id,
      targetUserId: id,
      action: action === 'enable' ? 'MFA_ENFORCED' : 'MFA_DISABLED',
      details: {
        revokeSessions,
        revokedSessions: result.revokedSessions,
      },
    })

    await invalidateAllMfaChallenges()

    return NextResponse.json({
      success: true,
      message:
        action === 'enable'
          ? 'MFA will be required at the user\'s next sign-in.'
          : 'MFA has been disabled for this user.',
      revokedSessions: result.revokedSessions,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Admin MFA policy update error:', error)
    return NextResponse.json({ error: 'Failed to update MFA policy' }, { status: 500 })
  }
}