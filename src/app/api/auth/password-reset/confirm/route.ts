import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import {
  deletePasswordResetOtp,
  getPasswordResetOtp,
  hashOtpCode,
  isOtpExpired,
  reachedOtpAttemptLimit,
  secretsMatch,
  updatePasswordResetOtp,
} from '@/lib/auth-otp'
import { hashPassword } from '@/lib/auth'
import { revokeAllUserSessions } from '@/lib/auth-session'

const confirmSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(8),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, otp, newPassword } = confirmSchema.parse(body)

    const normalizedEmail = email.trim().toLowerCase()

    // A 6-digit OTP is only 10^6 wide; the per-challenge attempt counter alone
    // does not stop an attacker re-requesting codes to keep guessing.
    const limited = await enforceRateLimit(
      request,
      RATE_LIMITS.passwordResetConfirm,
      normalizedEmail
    )
    if (limited) return limited

    const payload = await getPasswordResetOtp(normalizedEmail)

    if (!payload || isOtpExpired(payload.expiresAt)) {
      await deletePasswordResetOtp(normalizedEmail)
      return NextResponse.json(
        { error: 'OTP is invalid or expired' },
        { status: 400 }
      )
    }

    if (!secretsMatch(payload.codeHash, hashOtpCode(otp))) {
      const nextAttempts = payload.attempts + 1

      if (reachedOtpAttemptLimit(nextAttempts)) {
        await deletePasswordResetOtp(normalizedEmail)
        return NextResponse.json(
          { error: 'Too many invalid attempts. Request a new OTP.' },
          { status: 429 }
        )
      }

      await updatePasswordResetOtp(normalizedEmail, {
        ...payload,
        attempts: nextAttempts,
      })

      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPassword)

    const updated = await db.user.updateMany({
      where: {
        id: payload.userId,
        isActive: true,
      },
      data: {
        passwordHash,
        mustResetPassword: false,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    })

    if (updated.count === 0) {
      await deletePasswordResetOtp(normalizedEmail)
      return NextResponse.json({ error: 'Account unavailable' }, { status: 403 })
    }

    await deletePasswordResetOtp(normalizedEmail)

    // A password reset is the remedy for a suspected compromise, so every
    // pre-existing session must be invalidated — otherwise an attacker who is
    // already signed in keeps their session for the remainder of its 30-day TTL.
    await revokeAllUserSessions(payload.userId, 'PASSWORD_RESET')

    return NextResponse.json({ message: 'Password reset successful' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Password reset confirm error:', error)
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    )
  }
}
