import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAreaAccessScope } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'
import { hasPermission } from '@/lib/domain/rbac'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const userId = searchParams.get('userId')
    const action = searchParams.get('action')
    const search = searchParams.get('search')?.trim()
    const cursor = searchParams.get('cursor')
    const take = Math.min(Math.max(Number.parseInt(searchParams.get('take') || '30', 10) || 30, 1), 100)

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'activity:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const scope = await getAreaAccessScope(projectId, auth.actor.projectRole, 'workitem:read', auth.actor.extraPermissions)

    const rows = await db.activity.findMany({
      where: {
        projectId,
        ...(userId ? { userId } : {}),
        ...(action ? { action } : {}),
        ...(search
          ? {
              OR: [
                { action: { contains: search, mode: 'insensitive' } },
                { details: { contains: search, mode: 'insensitive' } },
                { issue: { title: { contains: search, mode: 'insensitive' } } },
                { issue: { key: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        issue: { select: { id: true, key: true, title: true, areaId: true } },
      },
    })

    const filtered = rows.filter((row) => {
      if (!row.issue) {
        return hasPermission(auth.actor.projectRole, 'activity:read', {
          extraPermissions: auth.actor.extraPermissions,
        })
      }
      return scope.allowUnassigned && row.issue.areaId === null
        ? true
        : scope.allowedAreaIds.includes(row.issue.areaId ?? '')
    })

    const hasMore = filtered.length > take
    const items = hasMore ? filtered.slice(0, take) : filtered
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null

    return NextResponse.json({ items, nextCursor, hasMore })
  } catch (error) {
    console.error('Error fetching activity feed:', error)
    return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 })
  }
}