import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_SESSION_TTL_SECONDS } from '@/lib/auth'

function parseClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  return realIp?.trim() || null
}

function inferDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'

  const ua = userAgent.toLowerCase()
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome/')
      ? 'Chrome'
      : ua.includes('safari/') && !ua.includes('chrome/')
        ? 'Safari'
        : ua.includes('firefox/')
          ? 'Firefox'
          : 'Browser'

  const device = ua.includes('windows')
    ? 'Windows'
    : ua.includes('mac os')
      ? 'macOS'
      : ua.includes('android')
        ? 'Android'
        : ua.includes('iphone') || ua.includes('ipad')
          ? 'iOS'
          : 'Device'

  return `${browser} on ${device}`
}

export async function createAuthSession(args: {
  request: NextRequest
  userId: string
  mfaVerified: boolean
  mfaBypassed?: boolean
}) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + AUTH_SESSION_TTL_SECONDS * 1000)
  const userAgent = args.request.headers.get('user-agent')

  return db.$transaction(async (tx) => {
    await tx.authSession.updateMany({
      where: {
        userId: args.userId,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
        revokedReason: 'REPLACED_BY_NEW_LOGIN',
      },
    })

    return tx.authSession.create({
      data: {
        userId: args.userId,
        userAgent,
        ipAddress: parseClientIp(args.request),
        deviceLabel: inferDeviceLabel(userAgent),
        mfaVerifiedAt: args.mfaVerified ? now : null,
        mfaBypassed: args.mfaBypassed === true,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    })
  })
}

export async function revokeAuthSession(sessionId: string, reason: string) {
  return db.authSession.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })
}

export async function revokeAllUserSessions(userId: string, reason: string) {
  return db.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })
}
