import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { calculatePortfolioHealth, PORTFOLIO_HEALTH_EXPLANATION } from '@/lib/domain/portfolio-health'

const DRILLDOWN_SCOPES = new Set(['all', 'open', 'completed', 'dueSoon', 'overdue', 'blocked'])

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() || ''
    const requestedScope = searchParams.get('scope') || ''
    const scope = DRILLDOWN_SCOPES.has(requestedScope) ? requestedScope : ''
    const requestedProjectId = searchParams.get('projectId')?.trim() || ''
    const generatedAt = new Date()
    const dueSoonEnd = new Date(generatedAt.getTime() + 7 * 24 * 60 * 60 * 1000)

    const memberships = await db.projectMember.findMany({
      where: { userId: auth.user.id, project: { isArchived: false } },
      select: { projectId: true },
    })
    const projectIds = memberships.map((membership) => membership.projectId)
    const projectId = projectIds.includes(requestedProjectId) ? requestedProjectId : ''

    const [projects, objectives, blockingRelations] = await Promise.all([
      db.project.findMany({
        where: { id: { in: projectIds }, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { members: true } },
          issues: {
            select: {
              id: true, key: true, title: true, status: true, priority: true,
              dueDate: true, updatedAt: true,
              assignee: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
      }),
      db.objective.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, title: true, progress: true, status: true, projectId: true, updatedAt: true,
          keyResults: { select: { currentValue: true, targetValue: true } },
          project: { select: { id: true, key: true, name: true, color: true } },
        },
      }),
      db.issueRelation.findMany({
        where: {
          relationType: { in: ['blocks', 'blocked_by'] },
          OR: [
            { sourceIssue: { projectId: { in: projectIds } } },
            { targetIssue: { projectId: { in: projectIds } } },
          ],
        },
        select: {
          sourceIssueId: true, targetIssueId: true, relationType: true,
          sourceIssue: { select: { status: true } },
          targetIssue: { select: { status: true } },
        },
      }),
    ])

    const blockedIssueIds = new Set<string>()
    for (const relation of blockingRelations) {
      if (relation.relationType === 'blocks') {
        if (!['done', 'cancelled'].includes(relation.sourceIssue.status)) blockedIssueIds.add(relation.targetIssueId)
      } else if (!['done', 'cancelled'].includes(relation.targetIssue.status)) {
        blockedIssueIds.add(relation.sourceIssueId)
      }
    }

    const objectiveSummaries = objectives.map((objective) => ({
      ...objective,
      progress: objective.keyResults.length === 0
        ? 0
        : Math.round(objective.keyResults.reduce((sum, result) => sum + (result.targetValue === 0 ? 0 : Math.min(1, result.currentValue / result.targetValue)), 0) / objective.keyResults.length * 100),
      keyResults: undefined,
    }))

    const projectSummaries = projects.map((project) => {
      const total = project.issues.length
      const completed = project.issues.filter((issue) => issue.status === 'done').length
      const open = project.issues.filter((issue) => !['done', 'cancelled'].includes(issue.status))
      const dueSoonCount = open.filter((issue) => issue.dueDate && issue.dueDate >= generatedAt && issue.dueDate <= dueSoonEnd).length
      const overdueCount = open.filter((issue) => issue.dueDate && issue.dueDate < generatedAt).length
      const blockedCount = open.filter((issue) => blockedIssueIds.has(issue.id)).length

      return {
        id: project.id, key: project.key, name: project.name, color: project.color,
        description: project.description, members: project._count.members,
        totalIssues: total, openIssues: open.length, completedIssues: completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        dueSoonCount, overdueCount, blockedCount,
        health: calculatePortfolioHealth({ totalWork: total, openWork: open.length, overdueWork: overdueCount, blockedWork: blockedCount }),
      }
    })

    const issueWhere: Prisma.IssueWhereInput = { projectId: { in: projectId ? [projectId] : projectIds } }
    if (query) issueWhere.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { key: { contains: query, mode: 'insensitive' } },
    ]
    if (scope === 'open') issueWhere.status = { notIn: ['done', 'cancelled'] }
    if (scope === 'completed') issueWhere.status = 'done'
    if (scope === 'dueSoon') {
      issueWhere.status = { notIn: ['done', 'cancelled'] }
      issueWhere.dueDate = { gte: generatedAt, lte: dueSoonEnd }
    }
    if (scope === 'overdue') {
      issueWhere.status = { notIn: ['done', 'cancelled'] }
      issueWhere.dueDate = { lt: generatedAt }
    }
    if (scope === 'blocked') issueWhere.id = { in: Array.from(blockedIssueIds) }

    const shouldLoadResults = Boolean(query || scope)
    const [queryMatches, resultCount] = shouldLoadResults
      ? await Promise.all([
          db.issue.findMany({
            where: issueWhere,
            orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
            take: 100,
            select: {
              id: true, key: true, title: true, status: true, priority: true, dueDate: true,
              project: { select: { id: true, key: true, name: true, color: true } },
              assignee: { select: { id: true, name: true, avatar: true } },
            },
          }),
          db.issue.count({ where: issueWhere }),
        ])
      : [[], 0]

    const allOpenIssues = projects.flatMap((project) => project.issues.filter((issue) => !['done', 'cancelled'].includes(issue.status)))
    const dueSoonCount = allOpenIssues.filter((issue) => issue.dueDate && issue.dueDate >= generatedAt && issue.dueDate <= dueSoonEnd).length

    return NextResponse.json({
      generatedAt: generatedAt.toISOString(),
      healthExplanation: PORTFOLIO_HEALTH_EXPLANATION,
      summary: {
        totalProjects: projectSummaries.length,
        totalObjectives: objectives.length,
        objectiveHealth: objectiveSummaries.length ? Math.round(objectiveSummaries.reduce((sum, objective) => sum + objective.progress, 0) / objectiveSummaries.length) : null,
        dueSoonCount,
        overdueCount: allOpenIssues.filter((issue) => issue.dueDate && issue.dueDate < generatedAt).length,
        blockedCount: allOpenIssues.filter((issue) => blockedIssueIds.has(issue.id)).length,
      },
      projects: projectSummaries,
      objectives: objectiveSummaries,
      queryResults: queryMatches,
      resultCount,
      resultScope: scope || (query ? 'search' : null),
      resultProjectId: projectId || null,
    })
  } catch (error) {
    console.error('Error fetching portfolio:', error)
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
  }
}
