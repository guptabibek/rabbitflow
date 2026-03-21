import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    if (auth.user.id !== id && auth.user.globalRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true, passwordHash: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.passwordHash && auth.user.id === id) {
      const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }
    }

    const newHash = await hashPassword(parsed.data.newPassword)
    await db.user.update({
      where: { id },
      data: {
        passwordHash: newHash,
        mustResetPassword: false,
        failedLoginAttempts: 0,
        lockoutUntil: null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error changing password:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
