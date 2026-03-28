import { type Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_SESSION_TTL_SECONDS } from '@/lib/auth'
import { createAuthSessionRecordOnTx } from '@/lib/auth-session-core'

export async function createAuthSession(args: {
  request: NextRequest
  userId: string
  mfaVerified: boolean
  mfaBypassed?: boolean
}) {
  return db.$transaction(async (tx) => createAuthSessionRecordTx(tx, args))
}

export async function createAuthSessionRecordTx(
  tx: Prisma.TransactionClient,
  args: {
    request: NextRequest
    userId: string
    mfaVerified: boolean
    mfaBypassed?: boolean
  }
) {
  return createAuthSessionRecordOnTx(tx, {
    headers: args.request.headers,
    userId: args.userId,
    mfaVerified: args.mfaVerified,
    mfaBypassed: args.mfaBypassed,
    ttlSeconds: AUTH_SESSION_TTL_SECONDS,
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
