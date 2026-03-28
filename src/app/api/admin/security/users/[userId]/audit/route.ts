import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemAdmin } from '@/lib/domain/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { userId: id } = await params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(
      Number.parseInt(searchParams.get('limit') || '100', 10) || 100,
      200
    )

    const user = await db.user.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const events = await db.securityAuditEvent.findMany({
      where: { targetUserId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        details: true,
        createdAt: true,
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Admin security audit fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch security timeline' }, { status: 500 })
  }
}
