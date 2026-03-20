import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createPasswordResetOtp } from '@/lib/auth-otp'
import { isSmtpConfigured, sendEmail } from '@/lib/email'

const requestSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = requestSchema.parse(body)

    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { error: 'SMTP is not configured on the server.' },
        { status: 503 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true },
    })

    if (user) {
      const { code } = await createPasswordResetOtp(normalizedEmail, user.id)

      await sendEmail({
        to: user.email,
        subject: 'RabbitFlow password reset code',
        text: `Hello ${user.name},\n\nUse this one-time password to reset your RabbitFlow account password: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Hello ${user.name},</p><p>Use this one-time password to reset your RabbitFlow account password:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
      })
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
    return NextResponse.json(
      { error: 'Failed to send password reset OTP' },
      { status: 500 }
    )
  }
}
