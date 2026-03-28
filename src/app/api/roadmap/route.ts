import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAreaAccessScope } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'roadmap:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const scope = await getAreaAccessScope(projectId, auth.actor.projectRole, 'workitem:read', auth.actor.extraPermissions)

    const issues = await db.issue.findMany({
      where: {
        projectId,
        OR: [{ startDate: { not: null } }, { dueDate: { not: null } }, { parentIssueId: { not: null } }],
      },
      orderBy: [{ parentIssueId: 'asc' }, { startDate: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        project: { select: { id: true, key: true, name: true, color: true } },
        assignee: { select: { id: true, name: true, avatar: true } },
        parentIssue: { select: { id: true, key: true, title: true, workItemType: true } },
        typeDefinition: { select: { key: true, name: true, hierarchyLevel: true, color: true } },
        sourceRelations: {
          where: { relationType: { in: ['blocks', 'blocked_by'] } },
          select: { id: true, relationType: true, targetIssueId: true },
        },
      },
    })

    const filteredIssues = issues.filter((issue) => {
      if (issue.areaId === null) return scope.allowUnassigned
      return scope.allowedAreaIds.includes(issue.areaId)
    })

    const items = filteredIssues.map((issue) => {
      const start = issue.startDate ?? issue.createdAt
      const end = issue.dueDate ?? issue.startDate ?? addDays(issue.createdAt, 7)
      const hierarchyLevel = issue.typeDefinition?.hierarchyLevel ?? 4
      const epicKey = hierarchyLevel <= 2 ? issue.id : issue.parentIssueId

      return {
        id: issue.id,
        key: issue.key,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        workItemType: issue.workItemType,
        hierarchyLevel,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        assignee: issue.assignee,
        project: issue.project,
        epicGroupId: epicKey,
        epicGroupLabel:
          hierarchyLevel <= 2
            ? `${issue.key} · ${issue.title}`
            : issue.parentIssue
              ? `${issue.parentIssue.key} · ${issue.parentIssue.title}`
              : 'Unparented roadmap items',
        dependencies: issue.sourceRelations.map((relation) => ({
          id: relation.id,
          relationType: relation.relationType,
          targetIssueId: relation.targetIssueId,
        })),
      }
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error fetching roadmap:', error)
    return NextResponse.json({ error: 'Failed to fetch roadmap' }, { status: 500 })
  }
}