import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { invalidateAllMfaChallenges } from '@/lib/auth-otp'
import { requireSystemAdmin } from '@/lib/domain/auth'
import { createSecurityAuditEvent } from '@/lib/security-audit'

const resetMfaSchema = z.object({
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
    const { revokeSessions } = resetMfaSchema.parse(body)

    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!existing.isActive) {
      return NextResponse.json({ error: 'Cannot manage MFA for a deactivated user' }, { status: 409 })
    }

    const now = new Date()

    const result = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          mfaSecret: null,
          mfaEnabled: false,
          mfaEnabledAt: null,
          mfaExemptFromPolicy: false,
          mfaReenrollRequired: true,
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
            revokedReason: `ADMIN_MFA_RESET_BY:${admin.user.id}`,
          },
        })

        revokedSessions = revoked.count
      }

      return { revokedSessions }
    })

    await createSecurityAuditEvent({
      actorUserId: admin.user.id,
      targetUserId: id,
      action: revokeSessions ? 'MFA_RESET_WITH_SESSION_REVOKE' : 'MFA_RESET_ONLY',
      details: {
        revokeSessions,
        revokedSessions: result.revokedSessions,
      },
    })

    await invalidateAllMfaChallenges()

    return NextResponse.json({
      success: true,
      message: revokeSessions
        ? 'MFA reset completed. Sessions revoked and re-enrollment is required on next login.'
        : 'MFA reset completed. Re-enrollment is required on next login.',
      revokedSessions: result.revokedSessions,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Admin MFA reset error:', error)
    return NextResponse.json({ error: 'Failed to reset MFA' }, { status: 500 })
  }
}
