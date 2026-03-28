export type HeaderReader = {
  get(name: string): string | null
}

export type AuthSessionRecord = {
  id: string
  expiresAt: Date
}

export type AuthSessionWriter = {
  authSession: {
    updateMany(args: {
      where: {
        userId: string
        revokedAt: null
        expiresAt: { gt: Date }
      }
      data: {
        revokedAt: Date
        revokedReason: string
      }
    }): Promise<unknown>
    create(args: {
      data: {
        userId: string
        userAgent: string | null
        ipAddress: string | null
        deviceLabel: string
        mfaVerifiedAt: Date | null
        mfaBypassed: boolean
        expiresAt: Date
      }
      select: {
        id: true
        expiresAt: true
      }
    }): Promise<AuthSessionRecord>
  }
}

export function parseClientIpFromHeaders(headers: HeaderReader): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = headers.get('x-real-ip')
  return realIp?.trim() || null
}

export function inferDeviceLabel(userAgent: string | null): string {
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

export async function createAuthSessionRecordOnTx(
  tx: AuthSessionWriter,
  args: {
    headers: HeaderReader
    userId: string
    mfaVerified: boolean
    mfaBypassed?: boolean
    ttlSeconds: number
    now?: Date
  }
): Promise<AuthSessionRecord> {
  const now = args.now ?? new Date()
  const expiresAt = new Date(now.getTime() + args.ttlSeconds * 1000)
  const userAgent = args.headers.get('user-agent')

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
      ipAddress: parseClientIpFromHeaders(args.headers),
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
}