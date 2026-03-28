import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemAdmin } from '@/lib/domain/auth'
import { createSecurityAuditEvent } from '@/lib/security-audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { userId: id } = await params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(
      Number.parseInt(searchParams.get('limit') || '100', 10) || 100,
      250
    )

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        mfaEnabled: true,
        mfaEnabledAt: true,
        mfaReenrollRequired: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const sessions = await db.authSession.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        deviceLabel: true,
        userAgent: true,
        ipAddress: true,
        mfaVerifiedAt: true,
        mfaBypassed: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    })

    return NextResponse.json({ user, sessions })
  } catch (error) {
    console.error('Admin user sessions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch user sessions' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { userId: id } = await params
    const user = await db.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const revoked = await db.authSession.updateMany({
      where: {
        userId: id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: `ADMIN_BULK_SESSION_REVOKE_BY:${admin.user.id}`,
      },
    })

    await createSecurityAuditEvent({
      actorUserId: admin.user.id,
      targetUserId: id,
      action: 'SESSIONS_REVOKED_ALL',
      details: {
        revokedSessions: revoked.count,
      },
    })

    return NextResponse.json({
      success: true,
      revokedSessions: revoked.count,
    })
  } catch (error) {
    console.error('Admin bulk revoke sessions error:', error)
    return NextResponse.json({ error: 'Failed to revoke sessions' }, { status: 500 })
  }
}
