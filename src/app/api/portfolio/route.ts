import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() || ''

    const memberships = await db.projectMember.findMany({
      where: { userId: auth.user.id, project: { isArchived: false } },
      select: { projectId: true },
    })

    const projectIds = memberships.map((membership) => membership.projectId)

    const [projects, queryMatches, objectives, dueSoon] = await Promise.all([
      db.project.findMany({
        where: { id: { in: projectIds }, isArchived: false },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { issues: true, members: true } },
          issues: {
            select: { status: true, dueDate: true },
          },
        },
      }),
      db.issue.findMany({
        where: {
          projectId: { in: projectIds },
          ...(query
            ? {
                OR: [
                  { title: { contains: query, mode: 'insensitive' } },
                  { key: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          project: { select: { id: true, key: true, name: true, color: true } },
          assignee: { select: { id: true, name: true, avatar: true } },
        },
      }),
      db.objective.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, title: true, progress: true, status: true, projectId: true },
      }),
      db.issue.findMany({
        where: {
          projectId: { in: projectIds },
          dueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: { not: 'done' },
        },
        orderBy: { dueDate: 'asc' },
        take: 20,
        select: {
          id: true,
          key: true,
          title: true,
          dueDate: true,
          status: true,
          project: { select: { id: true, key: true, name: true, color: true } },
        },
      }),
    ])

    const projectSummaries = projects.map((project) => {
      const total = project.issues.length
      const done = project.issues.filter((issue) => issue.status === 'done').length
      const dueSoonCount = project.issues.filter(
        (issue) =>
          issue.dueDate &&
          issue.dueDate.getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000 &&
          issue.status !== 'done'
      ).length

      return {
        id: project.id,
        key: project.key,
        name: project.name,
        color: project.color,
        description: project.description,
        members: project._count.members,
        totalIssues: total,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
        dueSoonCount,
      }
    })

    const objectiveHealth = objectives.length
      ? Math.round(objectives.reduce((sum, objective) => sum + objective.progress, 0) / objectives.length)
      : 0

    return NextResponse.json({
      summary: {
        totalProjects: projectSummaries.length,
        totalObjectives: objectives.length,
        objectiveHealth,
        dueSoonCount: dueSoon.length,
      },
      projects: projectSummaries,
      queryResults: queryMatches,
      dueSoon,
    })
  } catch (error) {
    console.error('Error fetching portfolio:', error)
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
  }
}