import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { AUTH_COOKIE, getAuthCookieOptions, signToken } from '@/lib/auth'
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

    // Bounded per challenge as well as per IP: the per-challenge attempt counter
    // resets whenever a new challenge is issued, so without this an attacker
    // could re-request challenges to keep guessing TOTP codes indefinitely.
    const limited = await enforceRateLimit(request, RATE_LIMITS.mfaVerify, challengeToken)
    if (limited) return limited

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
      isActive: boolean
      mfaSecret: string | null
      mfaEnabled: boolean
      mfaExemptFromPolicy: boolean
      mfaReenrollRequired: boolean
    }>>`
      SELECT
        "id",
        "email",
        "name",
        "avatar",
        "globalRole",
        "isActive",
        "mfaSecret",
        "mfaEnabled",
        "mfaExemptFromPolicy",
        "mfaReenrollRequired"
      FROM "User"
      WHERE "id" = ${challenge.userId}
      LIMIT 1
    `

    const user = users[0] || null

    if (!user) {
      await deleteMfaChallenge(challengeToken)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.isActive) {
      await deleteMfaChallenge(challengeToken)
      return NextResponse.json({ error: 'Account deactivated' }, { status: 403 })
    }

    if (challenge.mode === 'verify' && (!user.mfaEnabled || !user.mfaSecret)) {
      await deleteMfaChallenge(challengeToken)
      return NextResponse.json(
        { error: 'MFA session expired. Please sign in again.' },
        { status: 401 }
      )
    }

    if (challenge.mode === 'setup' && user.mfaExemptFromPolicy) {
      await deleteMfaChallenge(challengeToken)
      return NextResponse.json(
        { error: 'MFA session expired. Please sign in again.' },
        { status: 401 }
      )
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
          "mfaExemptFromPolicy" = false,
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
    const token = await signToken(user.id, session.id, user.globalRole)

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        globalRole: user.globalRole,
      },
    })

    response.cookies.set(AUTH_COOKIE, token, getAuthCookieOptions(request))
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
