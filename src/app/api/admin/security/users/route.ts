import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSystemAdmin } from '@/lib/domain/auth'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireSystemAdmin(request)
    if (!admin.ok) return admin.response

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')?.trim() || ''

    const users = await db.user.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        globalRole: true,
        mfaEnabled: true,
        mfaEnabledAt: true,
        mfaReenrollRequired: true,
      },
    })

    const now = new Date()

    const sessionStats = await db.authSession.groupBy({
      by: ['userId'],
      where: {
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      _count: {
        _all: true,
      },
      _max: {
        lastSeenAt: true,
      },
    })

    const byUserId = new Map(
      sessionStats.map((row) => [
        row.userId,
        {
          activeSessions: row._count._all,
          lastSeenAt: row._max.lastSeenAt,
        },
      ])
    )

    return NextResponse.json(
      users.map((user) => {
        const stats = byUserId.get(user.id)
        return {
          ...user,
          activeSessions: stats?.activeSessions ?? 0,
          lastSeenAt: stats?.lastSeenAt ?? null,
        }
      })
    )
  } catch (error) {
    console.error('Admin security users list error:', error)
    return NextResponse.json({ error: 'Failed to fetch security users' }, { status: 500 })
  }
}
