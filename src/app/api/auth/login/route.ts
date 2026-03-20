import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_COOKIE, COOKIE_OPTIONS, signToken, verifyPassword } from '@/lib/auth'
import { createAuthSession } from '@/lib/auth-session'
import {
  createMfaChallenge,
  createTotpOtpAuthUrl,
  createTotpSecret,
} from '@/lib/auth-otp'
import QRCode from 'qrcode'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const MFA_REQUIRE_ENROLLMENT = process.env.MFA_REQUIRE_ENROLLMENT !== 'false'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)
    const normalizedEmail = email.trim().toLowerCase()

    const users = await db.$queryRaw<Array<{
      id: string
      email: string
      name: string
      avatar: string | null
      globalRole: string
      passwordHash: string | null
      mfaSecret: string | null
      mfaEnabled: boolean
      mfaReenrollRequired: boolean
    }>>`
      SELECT
        "id",
        "email",
        "name",
        "avatar",
        "globalRole",
        "passwordHash",
        "mfaSecret",
        "mfaEnabled",
        "mfaReenrollRequired"
      FROM "User"
      WHERE "email" = ${normalizedEmail}
      LIMIT 1
    `

    const user = users[0] || null

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (user.globalRole === 'admin') {
      const session = await createAuthSession({
        request,
        userId: user.id,
        mfaVerified: false,
        mfaBypassed: true,
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
    }

    const hasConfiguredMfa = Boolean(
      user.mfaEnabled && user.mfaSecret && !user.mfaReenrollRequired
    )

    if (hasConfiguredMfa) {
      const { challengeToken } = await createMfaChallenge({
        userId: user.id,
        mode: 'verify',
      })

      return NextResponse.json({
        mfaRequired: true,
        setupRequired: false,
        challengeToken,
      })
    }

    if (MFA_REQUIRE_ENROLLMENT || user.mfaReenrollRequired) {
      const secret = createTotpSecret()
      const otpAuthUrl = createTotpOtpAuthUrl(user.email, secret)
      const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl)
      const { challengeToken } = await createMfaChallenge({
        userId: user.id,
        mode: 'setup',
        secret,
      })

      return NextResponse.json({
        mfaRequired: true,
        setupRequired: true,
        challengeToken,
        otpAuthUrl,
        qrCodeDataUrl,
        manualEntryKey: secret,
      })
    }

    const session = await createAuthSession({
      request,
      userId: user.id,
      mfaVerified: false,
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
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}

