import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemAdmin } from '@/lib/domain/auth'
import { createSecurityAuditEvent } from '@/lib/security-audit'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { sessionId } = await params

    const session = await db.authSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
      },
    })

    if (!session || session.revokedAt) {
      return NextResponse.json({ error: 'Session not found or already revoked' }, { status: 404 })
    }

    await db.authSession.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        revokedReason: `ADMIN_SESSION_REVOKED_BY:${admin.user.id}`,
      },
    })

    await createSecurityAuditEvent({
      actorUserId: admin.user.id,
      targetUserId: session.userId,
      action: 'SESSION_REVOKED',
      details: { sessionId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin revoke session error:', error)
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 })
  }
}
