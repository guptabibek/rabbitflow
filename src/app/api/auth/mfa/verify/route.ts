import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { AUTH_COOKIE, COOKIE_OPTIONS, signToken } from '@/lib/auth'
import { createAuthSession } from '@/lib/auth-session'
import {
  deleteMfaChallenge,
  getMfaChallenge,
  isOtpExpired,
  reachedOtpAttemptLimit,
  updateMfaChallenge,
  verifyTotpCode,
} from '@/lib/auth-otp'

const verifyMfaSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(6).max(12),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { challengeToken, code } = verifyMfaSchema.parse(body)

    const challenge = await getMfaChallenge(challengeToken)

    if (!challenge || isOtpExpired(challenge.expiresAt)) {
      await deleteMfaChallenge(challengeToken)
      return NextResponse.json(
        { error: 'MFA session expired. Please sign in again.' },
        { status: 401 }
      )
    }

    const users = await db.$queryRaw<Array<{
      id: string
      email: string
      name: string
      avatar: string | null
      globalRole: string
      mfaSecret: string | null
      mfaEnabled: boolean
    }>>`
      SELECT
        "id",
        "email",
        "name",
        "avatar",
        "globalRole",
        "mfaSecret",
        "mfaEnabled"
      FROM "User"
      WHERE "id" = ${challenge.userId}
      LIMIT 1
    `

    const user = users[0] || null

    if (!user) {
      await deleteMfaChallenge(challengeToken)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const secret = challenge.mode === 'setup' ? challenge.secret : user.mfaSecret

    if (!secret || !verifyTotpCode(secret, code)) {
      const nextAttempts = challenge.attempts + 1
      if (reachedOtpAttemptLimit(nextAttempts)) {
        await deleteMfaChallenge(challengeToken)
        return NextResponse.json(
          { error: 'Too many invalid codes. Please sign in again.' },
          { status: 429 }
        )
      }

      await updateMfaChallenge(challengeToken, {
        ...challenge,
        attempts: nextAttempts,
      })

      return NextResponse.json({ error: 'Invalid authenticator code' }, { status: 401 })
    }

    if (challenge.mode === 'setup') {
      await db.$executeRaw`
        UPDATE "User"
        SET
          "mfaSecret" = ${secret},
          "mfaEnabled" = true,
          "mfaEnabledAt" = ${new Date()},
          "mfaReenrollRequired" = false
        WHERE "id" = ${user.id}
      `
    }

    await deleteMfaChallenge(challengeToken)

    const session = await createAuthSession({
      request,
      userId: user.id,
      mfaVerified: true,
      mfaBypassed: false,
    })
    const token = await signToken(user.id, session.id)

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        globalRole: user.globalRole,
      },
    })

    response.cookies.set(AUTH_COOKIE, token, COOKIE_OPTIONS)
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('MFA verify error:', error)
    return NextResponse.json({ error: 'MFA verification failed' }, { status: 500 })
  }
}
