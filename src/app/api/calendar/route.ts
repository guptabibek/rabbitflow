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
          {
            startDate: { lte: monthEnd },
            dueDate: { gte: monthStart },
          },
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
        version: true,
        startDate: true,
        dueDate: true,
        areaId: true,
        area: { select: { id: true, name: true } },
        iteration: {
          select: {
            id: true,
            name: true,
            iterationType: true,
            team: { select: { id: true, name: true } },
          },
        },
        linkedKeyResults: {
          select: { objective: { select: { id: true, title: true } } },
        },
        assignee: { select: { id: true, name: true, avatar: true } },
      },
    })

    const unscheduledIssues = await db.issue.findMany({
      where: { projectId, startDate: null, dueDate: null },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        priority: true,
        workItemType: true,
        version: true,
        startDate: true,
        dueDate: true,
        areaId: true,
        area: { select: { id: true, name: true } },
        iteration: {
          select: {
            id: true,
            name: true,
            iterationType: true,
            team: { select: { id: true, name: true } },
          },
        },
        linkedKeyResults: {
          select: { objective: { select: { id: true, title: true } } },
        },
        assignee: { select: { id: true, name: true, avatar: true } },
      },
    })

    const items = issues.filter((issue) => {
      if (issue.areaId === null) return scope.allowUnassigned
      return scope.allowedAreaIds.includes(issue.areaId)
    })
    const unscheduled = unscheduledIssues.filter((issue) => {
      if (issue.areaId === null) return scope.allowUnassigned
      return scope.allowedAreaIds.includes(issue.areaId)
    })

    const serialize = (issue: (typeof issues)[number]) => ({
      ...issue,
      objectives: Array.from(
        new Map(issue.linkedKeyResults.map((entry) => [entry.objective.id, entry.objective])).values()
      ),
      linkedKeyResults: undefined,
    })

    return NextResponse.json({
      month: monthStart.toISOString(),
      items: items.map(serialize),
      unscheduled: unscheduled.map(serialize),
    })
  } catch (error) {
    console.error('Error fetching calendar view:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar view' }, { status: 500 })
  }
}
