import { NextRequest, NextResponse } from 'next/server'
import { db, isUniqueConstraintError } from '@/lib/db'
import { hashPassword, signToken, AUTH_COOKIE, getAuthCookieOptions } from '@/lib/auth'
import { createAuthSessionRecordTx } from '@/lib/auth-session'
import { z } from 'zod'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// Self-service registration is disabled by default. An internal delivery platform
// should provision accounts through an administrator, not accept anonymous signups:
// every authenticated account is a foothold for directory enumeration and upload
// abuse. Set ALLOW_SELF_REGISTRATION=true to opt in, and optionally restrict which
// email domains may register.
const ALLOW_SELF_REGISTRATION = process.env.ALLOW_SELF_REGISTRATION === 'true'

const ALLOWED_SIGNUP_DOMAINS = (process.env.ALLOWED_SIGNUP_EMAIL_DOMAINS || '')
  .split(',')
  .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean)

function isAllowedSignupEmail(email: string) {
  if (ALLOWED_SIGNUP_DOMAINS.length === 0) return true
  const domain = email.split('@')[1]?.toLowerCase()
  return Boolean(domain && ALLOWED_SIGNUP_DOMAINS.includes(domain))
}

export async function POST(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, RATE_LIMITS.register)
    if (limited) return limited

    if (!ALLOW_SELF_REGISTRATION) {
      return NextResponse.json(
        {
          error: 'Self-service registration is disabled. Contact your administrator for an account.',
          code: 'REGISTRATION_DISABLED',
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const data = registerSchema.parse(body)
    const normalizedEmail = data.email.trim().toLowerCase()

    if (!isAllowedSignupEmail(normalizedEmail)) {
      return NextResponse.json(
        {
          error: 'This email domain is not permitted to register.',
          code: 'EMAIL_DOMAIN_NOT_ALLOWED',
        },
        { status: 403 }
      )
    }

    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(data.password)

    const { user, session } = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: data.name.trim(),
          passwordHash,
          globalRole: 'member',
          mustResetPassword: false,
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          globalRole: true,
        },
      })

      const createdSession = await createAuthSessionRecordTx(tx, {
        request,
        userId: createdUser.id,
        mfaVerified: false,
        mfaBypassed: false,
      })

      return {
        user: createdUser,
        session: createdSession,
      }
    })

    const token = await signToken(user.id, session.id, user.globalRole)

    const response = NextResponse.json({ user }, { status: 201 })
    response.cookies.set(AUTH_COOKIE, token, getAuthCookieOptions(request))
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }
    if (isUniqueConstraintError(error, ['email'])) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}

