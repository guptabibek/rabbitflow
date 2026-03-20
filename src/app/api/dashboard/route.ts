import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  requireAuthenticatedUser,
  requireProjectPermission,
} from '@/lib/domain/auth'
import { withCache } from '@/lib/redis'

function toCountValue(count: number | { _all?: number } | null | undefined) {
  if (typeof count === 'number') {
    return count
  }

  return count?._all ?? 0
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const now = new Date()

    if (projectId) {
      const permission = await requireProjectPermission(request, projectId, 'project:read')
      if (!permission.ok) return permission.response

      const data = await withCache(`dashboard:${projectId}:project`, 30, async () => {
        const [
          project,
          issuesByStatus,
          issuesByPriority,
          issuesByType,
          recentIssues,
          activeSprint,
          recentActivity,
        ] = await Promise.all([
          db.project.findUnique({
            where: { id: projectId },
            include: {
              members: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      avatar: true,
                    },
                  },
                },
              },
              _count: { select: { issues: true } },
            },
          }),
          db.issue.groupBy({
            by: ['status'],
            where: { projectId },
            _count: true,
          }),
          db.issue.groupBy({
            by: ['priority'],
            where: { projectId },
            _count: true,
          }),
          db.issue.groupBy({
            by: ['workItemType'],
            where: { projectId },
            _count: true,
          }),
          db.issue.findMany({
            where: { projectId },
            orderBy: { updatedAt: 'desc' },
            take: 10,
            select: {
              id: true,
              key: true,
              title: true,
              workItemType: true,
              status: true,
              priority: true,
              storyPoints: true,
              updatedAt: true,
              createdAt: true,
              assignee: { select: { id: true, name: true, avatar: true } },
            },
          }),
          db.iteration.findFirst({
            where: {
              projectId,
              iterationType: 'sprint',
              OR: [
                {
                  AND: [{ startDate: { lte: now } }, { endDate: { gte: now } }],
                },
                { startDate: null },
                { endDate: null },
              ],
            },
            include: {
              _count: { select: { issues: true } },
            },
            orderBy: { startDate: 'desc' },
          }),
          db.activity.findMany({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
            take: 15,
            include: {
              user: { select: { id: true, name: true, avatar: true } },
              issue: { select: { key: true, title: true } },
            },
          }),
        ])

        const totalIssues = issuesByStatus.reduce(
          (sum, entry) => sum + toCountValue(entry._count),
          0
        )
        const doneIssues = issuesByStatus
          .filter((entry) => entry.status === 'done')
          .reduce((sum, entry) => sum + toCountValue(entry._count), 0)

        return {
          project,
          stats: {
            total: totalIssues,
            done: doneIssues,
            progress: totalIssues > 0 ? Math.round((doneIssues / totalIssues) * 100) : 0,
          },
          issuesByStatus: issuesByStatus.map((entry) => ({
            status: entry.status,
            _count: toCountValue(entry._count),
          })),
          issuesByPriority: issuesByPriority.map((entry) => ({
            priority: entry.priority,
            _count: toCountValue(entry._count),
          })),
          issuesByType: issuesByType.map((entry) => ({
            workItemType: entry.workItemType,
            _count: toCountValue(entry._count),
          })),
          recentIssues,
          activeSprint,
          recentActivity,
        }
      })

      return NextResponse.json(data)
    }

    const data = await withCache(`dashboard:user:${auth.user.id}`, 30, async () => {
      const memberships = await db.projectMember.findMany({
        where: { userId: auth.user.id, project: { isArchived: false } },
        select: { projectId: true },
      })
      const projectIds = memberships.map((membership) => membership.projectId)

      const [
        totalProjects,
        totalIssues,
        recentProjects,
        recentIssues,
        issuesByStatus,
      ] = await Promise.all([
        db.project.count({ where: { id: { in: projectIds }, isArchived: false } }),
        db.issue.count({ where: { projectId: { in: projectIds } } }),
        db.project.findMany({
          where: { id: { in: projectIds }, isArchived: false },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          include: {
            _count: { select: { issues: true } },
          },
        }),
        db.issue.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          include: {
            project: { select: { key: true, name: true, color: true } },
            assignee: { select: { id: true, name: true, avatar: true } },
          },
        }),
        db.issue.groupBy({
          by: ['status'],
          where: { projectId: { in: projectIds } },
          _count: true,
        }),
      ])

      return {
        stats: {
          totalProjects,
          totalIssues,
          totalUsers: memberships.length,
        },
        recentProjects,
        recentIssues,
        issuesByStatus: issuesByStatus.map((entry) => ({
          status: entry.status,
          _count: toCountValue(entry._count),
        })),
      }
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching dashboard:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
