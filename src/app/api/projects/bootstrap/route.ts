import { NextRequest, NextResponse } from 'next/server'
import { db, runWithDbRetry } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { issueMutationInclude, serializeIssueRecord } from '@/lib/domain/issues'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'
import { listPermissions, normalizeProjectRole } from '@/lib/domain/rbac'
import { withCache } from '@/lib/redis'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const pageSizeRaw = Number.parseInt(searchParams.get('pageSize') || '200', 10)
    const pageSize = Number.isNaN(pageSizeRaw) || pageSizeRaw < 1 ? 200 : Math.min(pageSizeRaw, 200)

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    await runWithDbRetry(() => ensureProjectSystemRecords(projectId, auth.actor.userId))

    const data = await withCache(
      `project:${projectId}:bootstrap:user:${auth.actor.userId}:pageSize:${pageSize}`,
      30,
      () =>
        runWithDbRetry(async () => {
        const [
          issues,
          issueTotal,
          labels,
          iterations,
          states,
          users,
          areas,
          teams,
          workItemTypes,
          typeStateMappings,
          stateTransitions,
        ] = await Promise.all([
          db.issue.findMany({
            where: { projectId },
            orderBy: [
              { parentIssueId: 'asc' },
              { columnOrder: 'asc' },
              { createdAt: 'asc' },
            ],
            take: pageSize,
            include: issueMutationInclude,
          }),
          // The client caps how many work items it holds. Returning the true
          // total lets the UI say so instead of silently showing a partial
          // board as if it were the whole project.
          db.issue.count({ where: { projectId } }),
          db.label.findMany({
            where: { projectId },
            orderBy: { name: 'asc' },
            include: { _count: { select: { issues: true } } },
          }),
          db.iteration.findMany({
            where: { projectId },
            orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
            include: {
              team: { select: { id: true, name: true, color: true } },
              _count: { select: { issues: true } },
              children: {
                orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
                select: {
                  id: true,
                  name: true,
                  path: true,
                  status: true,
                  startDate: true,
                  endDate: true,
                  teamId: true,
                },
              },
            },
          }),
          db.state.findMany({
            where: { projectId },
            orderBy: { order: 'asc' },
            include: { _count: { select: { issues: true } } },
          }),
          db.projectMember.findMany({
            where: { projectId },
            orderBy: { user: { name: 'asc' } },
            select: {
              role: true,
              extraPermissions: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  avatar: true,
                  globalRole: true,
                },
              },
            },
          }),
          db.area.findMany({
            where: { projectId },
            orderBy: [{ path: 'asc' }, { name: 'asc' }],
          }),
          db.team.findMany({
            where: { projectId },
            orderBy: [{ name: 'asc' }],
            include: {
              lead: { select: { id: true, name: true, email: true, avatar: true } },
              members: {
                orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
                include: {
                  user: { select: { id: true, name: true, email: true, avatar: true } },
                },
              },
              _count: {
                select: { iterations: true },
              },
            },
          }),
          db.workItemTypeDefinition.findMany({
            where: { projectId, isEnabled: true },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            include: {
              sections: {
                orderBy: { order: 'asc' },
                include: {
                  fields: {
                    orderBy: { order: 'asc' },
                  },
                },
              },
              fields: {
                orderBy: { order: 'asc' },
              },
              _count: {
                select: { issues: true },
              },
            },
          }),
          db.workItemTypeStateMapping.findMany({
            where: { projectId },
            orderBy: [{ workItemType: { order: 'asc' } }, { order: 'asc' }],
            select: {
              workItemTypeId: true,
              stateId: true,
              order: true,
              isInitial: true,
            },
          }),
          db.stateTransition.findMany({
            where: { projectId, isEnabled: true },
            orderBy: [{ workItemType: { order: 'asc' } }, { order: 'asc' }],
            select: {
              workItemTypeId: true,
              fromStateId: true,
              toStateId: true,
              order: true,
              isEnabled: true,
            },
          }),
        ])

        const normalizedRole = normalizeProjectRole(auth.actor.projectRole)

        return {
          issues: issues.map((issue) => serializeIssueRecord(issue)),
          issueTotal,
          issuePageSize: pageSize,
          labels,
          iterations,
          states,
          users: users.map((member) => ({
            ...member.user,
            projectRole: member.role,
            extraPermissions: Array.isArray(member.extraPermissions)
              ? member.extraPermissions.filter((value): value is string => typeof value === 'string')
              : [],
          })),
          areas,
          teams,
          workItemTypes,
          typeStateMappings,
          stateTransitions,
          rbac: {
            role: normalizedRole,
            permissions: listPermissions(normalizedRole, {
              extraPermissions: auth.actor.extraPermissions,
            }),
          },
        }
        })
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching project bootstrap data:', error)
    return NextResponse.json({ error: 'Failed to fetch project bootstrap data' }, { status: 500 })
  }
}
