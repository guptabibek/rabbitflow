import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAreaAccessScope } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'

function getMonthRange(dateParam: string | null) {
  const source = dateParam ? new Date(dateParam) : new Date()
  const monthStart = new Date(source.getFullYear(), source.getMonth(), 1)
  const monthEnd = new Date(source.getFullYear(), source.getMonth() + 1, 0, 23, 59, 59, 999)
  return { monthStart, monthEnd }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'calendar:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const scope = await getAreaAccessScope(projectId, auth.actor.projectRole, 'workitem:read', auth.actor.extraPermissions)
    const { monthStart, monthEnd } = getMonthRange(searchParams.get('month'))

    const issues = await db.issue.findMany({
      where: {
        projectId,
        OR: [
          { dueDate: { gte: monthStart, lte: monthEnd } },
          { startDate: { gte: monthStart, lte: monthEnd } },
        ],
      },
      orderBy: [{ dueDate: 'asc' }, { startDate: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        priority: true,
        workItemType: true,
        startDate: true,
        dueDate: true,
        areaId: true,
        assignee: { select: { id: true, name: true, avatar: true } },
      },
    })

    const items = issues.filter((issue) => {
      if (issue.areaId === null) return scope.allowUnassigned
      return scope.allowedAreaIds.includes(issue.areaId)
    })

    return NextResponse.json({
      month: monthStart.toISOString(),
      items,
    })
  } catch (error) {
    console.error('Error fetching calendar view:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar view' }, { status: 500 })
  }
}