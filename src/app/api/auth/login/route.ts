import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { AUTH_COOKIE, getAuthCookieOptions, signToken, verifyPassword } from '@/lib/auth'
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
const MAX_FAILED_LOGIN_ATTEMPTS = 3
const LOCKOUT_DURATION_MS = 60 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)
    const normalizedEmail = email.trim().toLowerCase()

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        globalRole: true,
        isActive: true,
        passwordHash: true,
        mfaSecret: true,
        mfaEnabled: true,
        mfaExemptFromPolicy: true,
        mfaReenrollRequired: true,
        mustResetPassword: true,
        failedLoginAttempts: true,
        lockoutUntil: true,
      },
    })

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        {
          error: 'This account has been deactivated. Contact your administrator.',
          code: 'ACCOUNT_DEACTIVATED',
        },
        { status: 403 }
      )
    }

    if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
      const retryAfterMinutes = Math.max(
        1,
        Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000)
      )

      return NextResponse.json(
        {
          error: `Account temporarily locked. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
          code: 'ACCOUNT_LOCKED',
          retryAfterMinutes,
        },
        { status: 423 }
      )
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      const nextFailedAttempts = user.failedLoginAttempts + 1
      const shouldLock = nextFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS

      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: shouldLock ? 0 : nextFailedAttempts,
          lockoutUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      })

      if (shouldLock) {
        return NextResponse.json(
          {
            error: 'Account temporarily locked due to repeated failed sign-in attempts. Try again in 60 minutes.',
            code: 'ACCOUNT_LOCKED',
            retryAfterMinutes: 60,
          },
          { status: 423 }
        )
      }

      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    if (user.failedLoginAttempts > 0 || user.lockoutUntil) {
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockoutUntil: null,
        },
      })
    }

    if (user.mustResetPassword) {
      return NextResponse.json(
        {
          error: 'Password reset required before continuing.',
          code: 'PASSWORD_RESET_REQUIRED',
        },
        { status: 403 }
      )
    }

    if (user.globalRole === 'admin') {
      const session = await createAuthSession({
        request,
        userId: user.id,
        mfaVerified: false,
        mfaBypassed: true,
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

    if (!user.mfaExemptFromPolicy && (MFA_REQUIRE_ENROLLMENT || user.mfaReenrollRequired)) {
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
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}

