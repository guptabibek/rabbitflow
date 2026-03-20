import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor')
    const takeParam = parseInt(searchParams.get('take') || '30', 10)
    const take = Math.min(Math.max(takeParam, 1), 100)

    const issue = await db.issue.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, issue.projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const rows = await db.activity.findMany({
      where: { issueId: id },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    })

    const hasMore = rows.length > take
    const items = hasMore ? rows.slice(0, take) : rows
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null

    return NextResponse.json({ items, nextCursor, hasMore })
  } catch (error) {
    console.error('Error fetching issue history:', error)
    return NextResponse.json({ error: 'Failed to fetch issue history' }, { status: 500 })
  }
}
