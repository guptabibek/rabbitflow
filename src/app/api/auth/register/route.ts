import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, signToken, AUTH_COOKIE, COOKIE_OPTIONS } from '@/lib/auth'
import { createAuthSession } from '@/lib/auth-session'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = registerSchema.parse(body)
    const normalizedEmail = data.email.trim().toLowerCase()

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

    const user = await db.user.create({
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

    const session = await createAuthSession({
      request,
      userId: user.id,
      mfaVerified: false,
      mfaBypassed: false,
    })
    const token = await signToken(user.id, session.id, user.globalRole)

    const response = NextResponse.json({ user }, { status: 201 })
    response.cookies.set(AUTH_COOKIE, token, COOKIE_OPTIONS)
    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }
    console.error('Register error:', error)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}

