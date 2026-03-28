import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAreaAccessScope } from '@/lib/domain/access-control'
import { requireProjectPermission } from '@/lib/domain/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const issueId = searchParams.get('issueId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'dependency:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const scope = await getAreaAccessScope(projectId, auth.actor.projectRole, 'workitem:read', auth.actor.extraPermissions)

    const [issues, relations] = await Promise.all([
      db.issue.findMany({
        where: { projectId },
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          priority: true,
          workItemType: true,
          areaId: true,
          assignee: { select: { id: true, name: true, avatar: true } },
        },
      }),
      db.issueRelation.findMany({
        where: {
          relationType: { in: ['blocks', 'blocked_by', 'tests', 'tested_by'] },
          OR: [{ sourceIssue: { projectId } }, { targetIssue: { projectId } }],
        },
        select: {
          id: true,
          relationType: true,
          sourceIssueId: true,
          targetIssueId: true,
        },
      }),
    ])

    const visibleIssues = issues.filter((issue) => {
      if (issue.areaId === null) return scope.allowUnassigned
      return scope.allowedAreaIds.includes(issue.areaId)
    })
    const visibleIds = new Set(visibleIssues.map((issue) => issue.id))

    const edges = relations.filter(
      (relation) => visibleIds.has(relation.sourceIssueId) && visibleIds.has(relation.targetIssueId)
    )

    return NextResponse.json({
      nodes: issueId
        ? visibleIssues.filter((issue) => issue.id === issueId || edges.some((edge) => edge.sourceIssueId === issue.id || edge.targetIssueId === issue.id))
        : visibleIssues,
      edges,
    })
  } catch (error) {
    console.error('Error fetching dependency graph:', error)
    return NextResponse.json({ error: 'Failed to fetch dependency graph' }, { status: 500 })
  }
}