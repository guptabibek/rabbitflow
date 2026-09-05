import { NextRequest, NextResponse } from 'next/server'
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { db } from '@/lib/db'
import { issuesToCsv } from '@/lib/domain/reports'

const EXPORT_COLUMNS = [
  'key', 'title', 'workItemType', 'status', 'priority', 'severity',
  'storyPoints', 'estimatedHours', 'completedHours', 'remainingHours',
  'assigneeName', 'iterationName', 'areaName',
  'createdAt', 'updatedAt', 'completedDate', 'startDate', 'dueDate',
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    // Aggregations over the whole project; throttled per user so a loop
    // cannot saturate the database.
    const limited = await enforceRateLimit(request, RATE_LIMITS.reports, auth.actor.userId)
    if (limited) return limited

    const status = searchParams.get('status') || undefined
    const workItemType = searchParams.get('workItemType') || undefined
    const iterationId = searchParams.get('iterationId') || undefined
    const assigneeId = searchParams.get('assigneeId') || undefined
    const teamId = searchParams.get('teamId') || undefined

    const where: Record<string, unknown> = { projectId }
    if (status) where.status = status
    if (workItemType) where.workItemType = workItemType
    if (iterationId) where.iterationId = iterationId
    if (assigneeId) where.assigneeId = assigneeId
    if (teamId) {
      where.OR = [
        { iteration: { teamId } },
        { assignee: { teamMemberships: { some: { teamId } } } },
      ]
    }

    const issues = await db.issue.findMany({
      where,
      select: {
        key: true,
        title: true,
        workItemType: true,
        status: true,
        priority: true,
        severity: true,
        storyPoints: true,
        estimatedHours: true,
        completedHours: true,
        remainingHours: true,
        createdAt: true,
        updatedAt: true,
        completedDate: true,
        startDate: true,
        dueDate: true,
        assignee: { select: { name: true } },
        iteration: { select: { name: true } },
        area: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    const rows = issues.map((issue) => ({
      ...issue,
      assigneeName: issue.assignee?.name || '',
      iterationName: issue.iteration?.name || '',
      areaName: issue.area?.name || '',
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
      completedDate: issue.completedDate?.toISOString() || '',
      startDate: issue.startDate?.toISOString() || '',
      dueDate: issue.dueDate?.toISOString() || '',
    }))

    const csv = issuesToCsv(rows, EXPORT_COLUMNS)

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="work-items-${projectId}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting data:', error)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
