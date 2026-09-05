import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { db } from '@/lib/db'
import { createPasswordResetOtp } from '@/lib/auth-otp'
import { isSmtpConfigured, sendEmail } from '@/lib/email'
import { buildPasswordResetEmail } from '@/lib/domain/email-templates'

const requestSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = requestSchema.parse(body)

    // Caps outbound reset email per IP, so this endpoint cannot be used to
    // mail-bomb a user or to farm valid addresses.
    const limited = await enforceRateLimit(request, RATE_LIMITS.passwordResetRequest)
    if (limited) return limited

    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { error: 'SMTP is not configured on the server.' },
        { status: 503 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, isActive: true },
    })

    if (user?.isActive) {
      const { code } = await createPasswordResetOtp(normalizedEmail, user.id)

      const email = buildPasswordResetEmail({
        userName: user.name,
        otpCode: code,
      })
      await sendEmail({ to: user.email, ...email })
    }

    return NextResponse.json({
      message: 'If an account exists for this email, an OTP has been sent.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Password reset request error:', error)
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to send password reset OTP'

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
