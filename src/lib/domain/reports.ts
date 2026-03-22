import { db } from '@/lib/db'
import { differenceInBusinessDays, differenceInCalendarDays, differenceInHours } from 'date-fns'

// Re-export pure helpers so consumers can still import from reports.ts
export { issuesToCsv, getProjectHealth, percentile, median } from './report-helpers'
import { getProjectHealth } from './report-helpers'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface DateRange {
  from: Date
  to: Date
}

interface IssueRow {
  id: string
  status: string
  workItemType: string
  priority: string
  severity: string | null
  storyPoints: number | null
  estimatedHours: number | null
  remainingHours: number | null
  completedHours: number | null
  createdAt: Date
  updatedAt: Date
  completedDate: Date | null
  startDate: Date | null
  dueDate: Date | null
  assigneeId: string | null
  iterationId: string | null
  areaId: string | null
  parentIssueId: string | null
}

const DONE_STATUSES = new Set(['done', 'cancelled'])
const ACTIVE_STATUSES = new Set(['in_progress', 'in_review'])
const FINAL_STATUS = 'done'

// ---------------------------------------------------------------------------
// 1. Sprint / Agile Reports
// ---------------------------------------------------------------------------

export interface BurndownPoint {
  date: string
  remaining: number
  ideal: number
  completed: number
  scope: number
}

export interface VelocityEntry {
  sprintName: string
  sprintId: string
  completedPoints: number
  completedCount: number
  committedPoints: number
  committedCount: number
  startDate: string | null
  endDate: string | null
}

export interface CumulativeFlowEntry {
  date: string
  [status: string]: number | string
}

function clampInt(value: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function normalizeStatus(status: string): string {
  const allowed = new Set(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'])
  return allowed.has(status) ? status : 'backlog'
}

function issueTeamFilter(teamId?: string): Record<string, unknown> {
  if (!teamId) return {}
  return {
    OR: [
      { iteration: { teamId } },
      { assignee: { teamMemberships: { some: { teamId } } } },
    ],
  }
}

export async function computeSprintBurndown(sprintId: string, teamId?: string) {
  const sprint = await db.iteration.findUnique({
    where: { id: sprintId },
    select: { id: true, startDate: true, endDate: true, projectId: true, name: true, teamId: true },
  })
  if (!sprint || !sprint.startDate || !sprint.endDate) return null
  if (teamId && sprint.teamId && sprint.teamId !== teamId) return null

  const issues = await db.issue.findMany({
    where: { iterationId: sprintId, ...issueTeamFilter(teamId) },
    select: {
      id: true,
      status: true,
      storyPoints: true,
      completedDate: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const start = new Date(sprint.startDate)
  const end = new Date(sprint.endDate)
  const now = new Date()
  const burndownEnd = end < now ? end : now

  const totalPoints = issues.reduce((s, i) => s + (i.storyPoints || 0), 0)
  const totalDays = Math.max(1, differenceInCalendarDays(end, start))

  const burndown: BurndownPoint[] = []
  const current = new Date(start)
  let dayIndex = 0

  while (current <= burndownEnd) {
    const dayEnd = new Date(current)
    dayEnd.setHours(23, 59, 59, 999)

    const completedByDay = issues.filter((i) => {
      if (i.status !== FINAL_STATUS) return false
      const effectiveDate = i.completedDate || i.updatedAt
      return effectiveDate <= dayEnd
    })
    const completedPts = completedByDay.reduce((s, i) => s + (i.storyPoints || 0), 0)

    // Scope added after sprint start
    const scopeByDay = issues.filter((i) => i.createdAt <= dayEnd)
    const scopePts = scopeByDay.reduce((s, i) => s + (i.storyPoints || 0), 0)

    const ideal = Math.max(0, Math.round(totalPoints * (1 - dayIndex / totalDays) * 10) / 10)

    burndown.push({
      date: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      remaining: scopePts - completedPts,
      ideal,
      completed: completedPts,
      scope: scopePts,
    })

    current.setDate(current.getDate() + 1)
    dayIndex++
  }

  return {
    sprint: { id: sprint.id, name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate },
    totalPoints,
    totalItems: issues.length,
    burndown,
  }
}

export async function computeVelocity(projectId: string, lastN = 10, teamId?: string): Promise<VelocityEntry[]> {
  lastN = clampInt(lastN, 10, 1, 52)

  const sprints = await db.iteration.findMany({
    where: {
      projectId,
      iterationType: 'sprint',
      status: { in: ['Closed', 'Active'] },
      ...(teamId ? { teamId } : {}),
    },
    orderBy: { startDate: 'desc' },
    take: lastN,
    select: { id: true, name: true, startDate: true, endDate: true },
  })

  if (!sprints.length) return []

  const sprintIds = sprints.map((s) => s.id)
  const issues = await db.issue.findMany({
    where: { iterationId: { in: sprintIds }, ...issueTeamFilter(teamId) },
    select: {
      id: true,
      iterationId: true,
      status: true,
      storyPoints: true,
    },
  })

  const bySprintId = new Map<string, typeof issues>()
  for (const issue of issues) {
    if (!issue.iterationId) continue
    const list = bySprintId.get(issue.iterationId) || []
    list.push(issue)
    bySprintId.set(issue.iterationId, list)
  }

  return sprints.reverse().map((sprint) => {
    const sprintIssues = bySprintId.get(sprint.id) || []
    const completed = sprintIssues.filter((i) => i.status === FINAL_STATUS)
    return {
      sprintName: sprint.name,
      sprintId: sprint.id,
      completedPoints: completed.reduce((s, i) => s + (i.storyPoints || 0), 0),
      completedCount: completed.length,
      committedPoints: sprintIssues.reduce((s, i) => s + (i.storyPoints || 0), 0),
      committedCount: sprintIssues.length,
      startDate: sprint.startDate?.toISOString() ?? null,
      endDate: sprint.endDate?.toISOString() ?? null,
    }
  })
}

export async function computeCumulativeFlow(projectId: string, days = 30, teamId?: string): Promise<CumulativeFlowEntry[]> {
  days = clampInt(days, 30, 1, 365)

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  // Get all status changes in range. We compute daily snapshots by walking backward
  // from current state to avoid O(days * issues * activities) scans.
  const activities = await db.activity.findMany({
    where: {
      projectId,
      action: 'status_changed',
      createdAt: { gt: startDate, lte: endDate },
      ...(teamId ? { issue: issueTeamFilter(teamId) } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, issueId: true, action: true, details: true, createdAt: true },
  })

  // Get current issue state and creation day once.
  const issues = await db.issue.findMany({
    where: { projectId, ...issueTeamFilter(teamId) },
    select: { id: true, status: true, createdAt: true },
  })

  const statusCategories = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']
  const createdByDay = new Map<string, string[]>()
  const statusByIssue = new Map<string, string>()
  const counts: Record<string, number> = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    cancelled: 0,
  }

  for (const issue of issues) {
    if (issue.createdAt > endDate) continue
    const createdKey = toDayKey(issue.createdAt)
    const list = createdByDay.get(createdKey) || []
    list.push(issue.id)
    createdByDay.set(createdKey, list)

    const normalized = normalizeStatus(issue.status)
    statusByIssue.set(issue.id, normalized)
    counts[normalized]++
  }

  const transitionsByDay = new Map<string, Array<{ issueId: string; from: string; to: string }>>()
  for (const act of activities) {
    if (!act.issueId || !act.details) continue
    try {
      const parsed = JSON.parse(act.details) as { from?: string; to?: string }
      if (!parsed.from || !parsed.to) continue
      const dayKey = toDayKey(act.createdAt)
      const list = transitionsByDay.get(dayKey) || []
      list.push({
        issueId: act.issueId,
        from: normalizeStatus(parsed.from),
        to: normalizeStatus(parsed.to),
      })
      transitionsByDay.set(dayKey, list)
    } catch {
      // Ignore malformed historical payloads instead of failing the report.
    }
  }

  const flowDesc: CumulativeFlowEntry[] = []
  const current = new Date(endDate)
  while (current >= startDate) {
    flowDesc.push({
      date: current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      ...counts,
    })

    const dayKey = toDayKey(current)

    // Roll back state changes that happened during this day to reach previous day snapshot.
    const transitions = transitionsByDay.get(dayKey) || []
    for (const transition of transitions) {
      const currentStatus = statusByIssue.get(transition.issueId)
      if (!currentStatus) continue
      if (currentStatus !== transition.to) continue

      counts[transition.to] = Math.max(0, counts[transition.to] - 1)
      counts[transition.from] = counts[transition.from] + 1
      statusByIssue.set(transition.issueId, transition.from)
    }

    // Issues created on this day did not exist on the previous day.
    const createdToday = createdByDay.get(dayKey) || []
    for (const issueId of createdToday) {
      const currentStatus = statusByIssue.get(issueId)
      if (!currentStatus) continue
      counts[currentStatus] = Math.max(0, counts[currentStatus] - 1)
      statusByIssue.delete(issueId)
    }

    current.setDate(current.getDate() - 1)
  }

  const flow = flowDesc.reverse()
  return flow.map((entry) => {
    const normalized: CumulativeFlowEntry = { date: entry.date }
    for (const status of statusCategories) {
      const val = entry[status]
      normalized[status] = typeof val === 'number' ? val : 0
    }
    return normalized
  })
}

export async function computeLeadCycleTime(projectId: string, range?: DateRange, teamId?: string) {
  const where: Record<string, unknown> = {
    projectId,
    status: FINAL_STATUS,
    completedDate: { not: null },
    ...issueTeamFilter(teamId),
  }
  if (range) {
    where.completedDate = { gte: range.from, lte: range.to }
  }

  const issues = await db.issue.findMany({
    where,
    select: {
      id: true,
      key: true,
      title: true,
      workItemType: true,
      createdAt: true,
      startDate: true,
      completedDate: true,
    },
  })

  const entries = issues.map((issue) => {
    const leadTimeHours = issue.completedDate
      ? differenceInHours(issue.completedDate, issue.createdAt)
      : null
    const cycleTimeHours =
      issue.completedDate && issue.startDate
        ? differenceInHours(issue.completedDate, issue.startDate)
        : null

    return {
      id: issue.id,
      key: issue.key,
      title: issue.title,
      workItemType: issue.workItemType,
      leadTimeHours,
      cycleTimeHours,
      leadTimeDays: leadTimeHours !== null ? Math.round(leadTimeHours / 24 * 10) / 10 : null,
      cycleTimeDays: cycleTimeHours !== null ? Math.round(cycleTimeHours / 24 * 10) / 10 : null,
    }
  })

  const leadTimes = entries.map((e) => e.leadTimeDays).filter((v): v is number => v !== null)
  const cycleTimes = entries.map((e) => e.cycleTimeDays).filter((v): v is number => v !== null)

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0)
  const median = (arr: number[]) => {
    if (!arr.length) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10
  }
  const p85 = (arr: number[]) => {
    if (!arr.length) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const idx = Math.ceil(sorted.length * 0.85) - 1
    return sorted[Math.max(0, idx)]
  }

  return {
    items: entries,
    summary: {
      count: entries.length,
      leadTime: { avg: avg(leadTimes), median: median(leadTimes), p85: p85(leadTimes) },
      cycleTime: { avg: avg(cycleTimes), median: median(cycleTimes), p85: p85(cycleTimes) },
    },
  }
}

// ---------------------------------------------------------------------------
// 2. Productivity Reports
// ---------------------------------------------------------------------------

export async function computeWorkloadDistribution(projectId: string, iterationId?: string, teamId?: string) {
  const where: Record<string, unknown> = { projectId, ...issueTeamFilter(teamId) }
  if (iterationId) where.iterationId = iterationId

  const byAssignee = await db.issue.groupBy({
    by: ['assigneeId'],
    where: { ...where, assigneeId: { not: null } },
    _count: { id: true },
    _sum: { storyPoints: true, estimatedHours: true, remainingHours: true, completedHours: true },
  })

  const userIds = byAssignee.map((r) => r.assigneeId).filter((id): id is string => id !== null)
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatar: true },
  })
  const userMap = new Map(users.map((u) => [u.id, u]))

  return byAssignee.map((row) => ({
    assigneeId: row.assigneeId,
    assignee: row.assigneeId ? userMap.get(row.assigneeId) || null : null,
    itemCount: row._count.id,
    totalPoints: row._sum.storyPoints || 0,
    estimatedHours: row._sum.estimatedHours || 0,
    remainingHours: row._sum.remainingHours || 0,
    completedHours: row._sum.completedHours || 0,
  }))
}

export async function computeCompletionRates(projectId: string, days = 30, teamId?: string) {
  days = clampInt(days, 30, 1, 365)

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const [created, completed] = await Promise.all([
    db.issue.count({ where: { projectId, createdAt: { gte: startDate }, ...issueTeamFilter(teamId) } }),
    db.issue.count({ where: { projectId, status: FINAL_STATUS, completedDate: { gte: startDate }, ...issueTeamFilter(teamId) } }),
  ])

  // Aggregate by day buckets
  const buckets = new Map<string, { created: number; completed: number }>()
  const bucketOrder: string[] = []
  const current = new Date(startDate)
  const now = new Date()
  while (current <= now) {
    const key = toDayKey(current)
    buckets.set(key, { created: 0, completed: 0 })
    bucketOrder.push(key)
    current.setDate(current.getDate() + 1)
  }

  const [createdByDay, completedByDay] = teamId
    ? await Promise.all([
        db.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT DATE("createdAt") AS day, COUNT(*) AS count
          FROM "Issue"
          WHERE "projectId" = ${projectId}
            AND "createdAt" >= ${startDate}
            AND (
              "iterationId" IN (
                SELECT "id" FROM "Iteration" WHERE "teamId" = ${teamId}
              )
              OR "assigneeId" IN (
                SELECT "userId" FROM "TeamMember" WHERE "teamId" = ${teamId}
              )
            )
          GROUP BY DATE("createdAt")
        `,
        db.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT DATE("completedDate") AS day, COUNT(*) AS count
          FROM "Issue"
          WHERE "projectId" = ${projectId}
            AND "status" = ${FINAL_STATUS}
            AND "completedDate" >= ${startDate}
            AND (
              "iterationId" IN (
                SELECT "id" FROM "Iteration" WHERE "teamId" = ${teamId}
              )
              OR "assigneeId" IN (
                SELECT "userId" FROM "TeamMember" WHERE "teamId" = ${teamId}
              )
            )
          GROUP BY DATE("completedDate")
        `,
      ])
    : await Promise.all([
        db.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT DATE("createdAt") AS day, COUNT(*) AS count
          FROM "Issue"
          WHERE "projectId" = ${projectId}
            AND "createdAt" >= ${startDate}
          GROUP BY DATE("createdAt")
        `,
        db.$queryRaw<Array<{ day: Date; count: bigint }>>`
          SELECT DATE("completedDate") AS day, COUNT(*) AS count
          FROM "Issue"
          WHERE "projectId" = ${projectId}
            AND "status" = ${FINAL_STATUS}
            AND "completedDate" >= ${startDate}
          GROUP BY DATE("completedDate")
        `,
      ])

  for (const row of createdByDay) {
    const key = toDayKey(new Date(row.day))
    const bucket = buckets.get(key)
    if (bucket) bucket.created = Number(row.count)
  }
  for (const row of completedByDay) {
    const key = toDayKey(new Date(row.day))
    const bucket = buckets.get(key)
    if (bucket) bucket.completed = Number(row.count)
  }

  const daily = bucketOrder.map((key) => {
    const counts = buckets.get(key) || { created: 0, completed: 0 }
    const date = new Date(`${key}T00:00:00.000Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    return { date, ...counts }
  })

  return {
    summary: { created, completed, rate: created > 0 ? Math.round((completed / created) * 100) : 0 },
    daily,
  }
}

export async function computeTimeVsEstimates(projectId: string, iterationId?: string, teamId?: string) {
  const where: Record<string, unknown> = {
    projectId,
    ...issueTeamFilter(teamId),
    OR: [
      { estimatedHours: { not: null } },
      { completedHours: { not: null } },
    ],
  }
  if (iterationId) where.iterationId = iterationId

  const issues = await db.issue.findMany({
    where,
    select: {
      id: true,
      key: true,
      title: true,
      workItemType: true,
      status: true,
      estimatedHours: true,
      completedHours: true,
      remainingHours: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true, avatar: true } },
    },
  })

  const totalEstimated = issues.reduce((s, i) => s + (i.estimatedHours || 0), 0)
  const totalCompleted = issues.reduce((s, i) => s + (i.completedHours || 0), 0)
  const totalRemaining = issues.reduce((s, i) => s + (i.remainingHours || 0), 0)

  return {
    items: issues,
    summary: {
      totalEstimated: Math.round(totalEstimated * 10) / 10,
      totalCompleted: Math.round(totalCompleted * 10) / 10,
      totalRemaining: Math.round(totalRemaining * 10) / 10,
      accuracy: totalEstimated > 0 ? Math.round((totalCompleted / totalEstimated) * 100) : 0,
      itemCount: issues.length,
    },
  }
}

// ---------------------------------------------------------------------------
// 3. Work Item Reports
// ---------------------------------------------------------------------------

export async function computeBacklogAging(projectId: string, teamId?: string) {
  const issues = await db.issue.findMany({
    where: {
      projectId,
      status: { notIn: ['done', 'cancelled'] },
      ...issueTeamFilter(teamId),
    },
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      priority: true,
      workItemType: true,
      createdAt: true,
      updatedAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true, avatar: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const aged = issues.map((issue) => {
    const ageDays = differenceInCalendarDays(now, issue.createdAt)
    const staleDays = differenceInCalendarDays(now, issue.updatedAt)
    return { ...issue, ageDays, staleDays }
  })

  // Age buckets
  const buckets = { '0-7d': 0, '8-14d': 0, '15-30d': 0, '31-60d': 0, '60+d': 0 }
  for (const item of aged) {
    if (item.ageDays <= 7) buckets['0-7d']++
    else if (item.ageDays <= 14) buckets['8-14d']++
    else if (item.ageDays <= 30) buckets['15-30d']++
    else if (item.ageDays <= 60) buckets['31-60d']++
    else buckets['60+d']++
  }

  return {
    items: aged,
    buckets: Object.entries(buckets).map(([range, count]) => ({ range, count })),
    summary: {
      totalOpen: aged.length,
      avgAgeDays: aged.length
        ? Math.round(aged.reduce((s, i) => s + i.ageDays, 0) / aged.length)
        : 0,
      oldestDays: aged.length ? Math.max(...aged.map((i) => i.ageDays)) : 0,
    },
  }
}

export async function computeStatusDistribution(projectId: string, teamId?: string) {
  const where = { projectId, ...issueTeamFilter(teamId) }
  const [byStatus, byPriority, byType] = await Promise.all([
    db.issue.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
      _sum: { storyPoints: true },
    }),
    db.issue.groupBy({
      by: ['priority'],
      where,
      _count: { id: true },
    }),
    db.issue.groupBy({
      by: ['workItemType'],
      where,
      _count: { id: true },
      _sum: { storyPoints: true },
    }),
  ])

  return {
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: r._count.id,
      points: r._sum.storyPoints || 0,
    })),
    byPriority: byPriority.map((r) => ({
      priority: r.priority,
      count: r._count.id,
    })),
    byType: byType.map((r) => ({
      type: r.workItemType,
      count: r._count.id,
      points: r._sum.storyPoints || 0,
    })),
  }
}

export async function computeBlockedItems(projectId: string, teamId?: string) {
  const sourceIssueWhere: Record<string, unknown> = {
    projectId,
    status: { notIn: ['done', 'cancelled'] },
    ...issueTeamFilter(teamId),
  }

  // Items that are blocked by other items via IssueRelation
  const blockedRelations = await db.issueRelation.findMany({
    where: {
      relationType: 'blocked_by',
      sourceIssue: sourceIssueWhere,
    },
    include: {
      sourceIssue: {
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
          priority: true,
          workItemType: true,
          assignee: { select: { id: true, name: true, avatar: true } },
          createdAt: true,
        },
      },
      targetIssue: {
        select: {
          id: true,
          key: true,
          title: true,
          status: true,
        },
      },
    },
  })

  return {
    blockedItems: blockedRelations.map((r) => ({
      issue: r.sourceIssue,
      blockedBy: r.targetIssue,
      createdAt: r.createdAt,
    })),
    count: blockedRelations.length,
  }
}

export async function computeReopenedItems(projectId: string, days = 30, teamId?: string) {
  days = clampInt(days, 30, 1, 365)

  const since = new Date()
  since.setDate(since.getDate() - days)

  // Find status changes from done back to non-done
  const activities = await db.activity.findMany({
    where: {
      projectId,
      action: 'status_changed',
      createdAt: { gte: since },
      ...(teamId ? { issue: issueTeamFilter(teamId) } : {}),
    },
    select: { id: true, issueId: true, details: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const reopened: Array<{ issueId: string; reopenedAt: Date }> = []
  for (const act of activities) {
    if (!act.details || !act.issueId) continue
    try {
      const parsed = JSON.parse(act.details)
      if (parsed.from === 'done' && parsed.to && parsed.to !== 'done' && parsed.to !== 'cancelled') {
        reopened.push({ issueId: act.issueId, reopenedAt: act.createdAt })
      }
    } catch { /* ignore */ }
  }

  const uniqueIssueIds = [...new Set(reopened.map((r) => r.issueId))]
  let issues: Array<{ id: string; key: string; title: string; status: string; workItemType: string }> = []
  if (uniqueIssueIds.length > 0) {
    issues = await db.issue.findMany({
      where: { id: { in: uniqueIssueIds }, ...issueTeamFilter(teamId) },
      select: { id: true, key: true, title: true, status: true, workItemType: true },
    })
  }

  const issueMap = new Map(issues.map((i) => [i.id, i]))
  return {
    items: reopened.map((r) => ({
      ...issueMap.get(r.issueId),
      reopenedAt: r.reopenedAt,
    })),
    count: uniqueIssueIds.length,
    totalReopens: reopened.length,
  }
}

// ---------------------------------------------------------------------------
// 4. Bug & Quality Reports
// ---------------------------------------------------------------------------

export async function computeBugMetrics(projectId: string, days = 30, teamId?: string) {
  days = clampInt(days, 30, 1, 365)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const bugs = await db.issue.findMany({
    where: { projectId, workItemType: 'bug', ...issueTeamFilter(teamId) },
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      priority: true,
      severity: true,
      createdAt: true,
      completedDate: true,
      startDate: true,
    },
  })

  const recentBugs = bugs.filter((b) => b.createdAt >= since)
  const resolvedBugs = bugs.filter((b) => b.status === FINAL_STATUS && b.completedDate)

  // Bug trend (daily created)
  const trendBuckets = new Map<string, number>()
  const current = new Date(since)
  const now = new Date()
  while (current <= now) {
    trendBuckets.set(current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 0)
    current.setDate(current.getDate() + 1)
  }
  for (const bug of recentBugs) {
    const key = bug.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (trendBuckets.has(key)) trendBuckets.set(key, (trendBuckets.get(key) || 0) + 1)
  }

  // Severity breakdown
  const severityMap: Record<string, number> = {}
  for (const bug of bugs) {
    const sev = bug.severity || 'unspecified'
    severityMap[sev] = (severityMap[sev] || 0) + 1
  }

  // Resolution time
  const resolutionTimes = resolvedBugs
    .filter((b) => b.completedDate && b.createdAt)
    .map((b) => differenceInHours(b.completedDate!, b.createdAt))

  const avgResolutionHours = resolutionTimes.length
    ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
    : 0

  // Priority breakdown
  const priorityMap: Record<string, number> = {}
  for (const bug of bugs) {
    priorityMap[bug.priority] = (priorityMap[bug.priority] || 0) + 1
  }

  return {
    summary: {
      totalBugs: bugs.length,
      openBugs: bugs.filter((b) => !DONE_STATUSES.has(b.status)).length,
      resolvedBugs: resolvedBugs.length,
      recentBugs: recentBugs.length,
      avgResolutionHours,
      avgResolutionDays: Math.round(avgResolutionHours / 24 * 10) / 10,
    },
    trend: Array.from(trendBuckets.entries()).map(([date, count]) => ({ date, count })),
    bySeverity: Object.entries(severityMap).map(([severity, count]) => ({ severity, count })),
    byPriority: Object.entries(priorityMap).map(([priority, count]) => ({ priority, count })),
  }
}

// ---------------------------------------------------------------------------
// 5. DORA Metrics (adapted for project management context)
// ---------------------------------------------------------------------------

export async function computeDoraMetrics(projectId: string, days = 90, teamId?: string) {
  days = clampInt(days, 90, 7, 365)

  const since = new Date()
  since.setDate(since.getDate() - days)

  // Deployment frequency: count of releases/milestones completed
  const deployments = await db.iteration.findMany({
    where: {
      projectId,
      iterationType: { in: ['release', 'milestone'] },
      status: 'Closed',
      endDate: { gte: since },
      ...(teamId ? { teamId } : {}),
    },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { endDate: 'asc' },
  })

  const deploymentFrequency = deployments.length
  const weeksInRange = Math.max(1, days / 7)
  const deploymentsPerWeek = Math.round((deploymentFrequency / weeksInRange) * 10) / 10

  // Lead time for changes: average time from work item creation to done for items in releases
  const releaseIds = deployments.map((d) => d.id)
  let avgLeadTimeDays = 0
  if (releaseIds.length > 0) {
    const releaseIssues = await db.issue.findMany({
      where: {
        iterationId: { in: releaseIds },
        status: FINAL_STATUS,
        completedDate: { not: null },
      },
      select: { createdAt: true, completedDate: true },
    })

    if (releaseIssues.length > 0) {
      const totalDays = releaseIssues.reduce(
        (sum, i) => sum + differenceInCalendarDays(i.completedDate!, i.createdAt),
        0
      )
      avgLeadTimeDays = Math.round((totalDays / releaseIssues.length) * 10) / 10
    }
  }

  // Change failure rate: reopened or bug items as % of total completed
  const totalCompleted = await db.issue.count({
    where: { projectId, status: FINAL_STATUS, completedDate: { gte: since }, ...issueTeamFilter(teamId) },
  })

  const bugCount = await db.issue.count({
    where: { projectId, workItemType: 'bug', createdAt: { gte: since }, ...issueTeamFilter(teamId) },
  })

  const changeFailureRate = totalCompleted > 0
    ? Math.min(100, Math.round((bugCount / totalCompleted) * 100))
    : 0

  // MTTR: average time to resolve bugs
  const resolvedBugs = await db.issue.findMany({
    where: {
      projectId,
      workItemType: 'bug',
      status: FINAL_STATUS,
      completedDate: { gte: since },
      ...issueTeamFilter(teamId),
    },
    select: { createdAt: true, completedDate: true },
  })

  let mttrHours = 0
  if (resolvedBugs.length > 0) {
    const totalHours = resolvedBugs.reduce(
      (sum, b) => sum + differenceInHours(b.completedDate!, b.createdAt),
      0
    )
    mttrHours = Math.round(totalHours / resolvedBugs.length)
  }

  return {
    deploymentFrequency: {
      total: deploymentFrequency,
      perWeek: deploymentsPerWeek,
      deployments: deployments.map((d) => ({
        name: d.name,
        date: d.endDate?.toISOString() ?? null,
      })),
    },
    leadTimeForChanges: {
      avgDays: avgLeadTimeDays,
    },
    changeFailureRate: {
      rate: changeFailureRate,
      bugsCreated: bugCount,
      totalCompleted,
    },
    mttr: {
      hours: mttrHours,
      days: Math.round(mttrHours / 24 * 10) / 10,
      resolvedCount: resolvedBugs.length,
    },
  }
}

// ---------------------------------------------------------------------------
// 6. Forecasting
// ---------------------------------------------------------------------------

export async function computeForecast(projectId: string, teamId?: string) {
  const velocity = await computeVelocity(projectId, 6, teamId)
  if (!velocity.length) {
    return { avgVelocity: 0, predictedSprints: null, confidence: 'low' as const }
  }

  const completedPoints = velocity.map((v) => v.completedPoints)
  const avgVelocity = Math.round(completedPoints.reduce((a, b) => a + b, 0) / completedPoints.length)

  // Remaining work in backlog
  const remainingPoints = await db.issue.aggregate({
    where: { projectId, status: { notIn: ['done', 'cancelled'] }, ...issueTeamFilter(teamId) },
    _sum: { storyPoints: true },
    _count: { id: true },
  })

  const totalRemaining = remainingPoints._sum.storyPoints || 0
  const predictedSprints = avgVelocity > 0 ? Math.ceil(totalRemaining / avgVelocity) : null

  // Confidence based on velocity variance
  const variance = completedPoints.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / completedPoints.length
  const stdDev = Math.sqrt(variance)
  const cv = avgVelocity > 0 ? stdDev / avgVelocity : 1

  const confidence = cv < 0.2 ? 'high' as const : cv < 0.5 ? 'medium' as const : 'low' as const

  // Sprint predictability (how often did they hit within 80-120% of avg)
  const predictable = completedPoints.filter(
    (p) => p >= avgVelocity * 0.8 && p <= avgVelocity * 1.2
  )
  const predictability = Math.round((predictable.length / completedPoints.length) * 100)

  return {
    avgVelocity,
    totalRemainingPoints: totalRemaining,
    totalRemainingItems: remainingPoints._count.id,
    predictedSprints,
    confidence,
    predictability,
    velocityHistory: velocity,
    stdDev: Math.round(stdDev * 10) / 10,
  }
}

// ---------------------------------------------------------------------------
// 7. Audit Reports
// ---------------------------------------------------------------------------

export async function computeAuditReport(
  projectId: string,
  options?: { userId?: string; action?: string; teamId?: string; days?: number; page?: number; pageSize?: number }
) {
  const days = clampInt(options?.days ?? 30, 30, 1, 365)
  const page = clampInt(options?.page ?? 1, 1, 1, 1000)
  const pageSize = clampInt(options?.pageSize ?? 50, 50, 1, 200)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const where: Record<string, unknown> = {
    projectId,
    createdAt: { gte: since },
    ...(options?.teamId ? { issue: issueTeamFilter(options.teamId) } : {}),
  }
  if (options?.userId) where.userId = options.userId
  if (options?.action) where.action = options.action

  const [activities, total] = await Promise.all([
    db.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        issue: { select: { id: true, key: true, title: true } },
      },
    }),
    db.activity.count({ where }),
  ])

  // Action summary (respect the same filters used for the activity feed)
  const actionSummary = await db.activity.groupBy({
    by: ['action'],
    where,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  // User activity summary (respect the same filters used for the activity feed)
  const userSummary = await db.activity.groupBy({
    by: ['userId'],
    where,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 20,
  })

  const topUserIds = userSummary.map((r) => r.userId)
  const topUsers = topUserIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, name: true, avatar: true },
      })
    : []
  const topUserMap = new Map(topUsers.map((u) => [u.id, u]))

  return {
    activities: activities.map((a) => ({
      ...a,
      details: (() => {
        if (!a.details) return null
        try {
          return JSON.parse(a.details)
        } catch {
          return null
        }
      })(),
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    actionSummary: actionSummary.map((r) => ({ action: r.action, count: r._count.id })),
    userSummary: userSummary.map((r) => ({
      userId: r.userId,
      user: topUserMap.get(r.userId) || null,
      count: r._count.id,
    })),
  }
}

// ---------------------------------------------------------------------------
// 8. Time Tracking & Cost
// ---------------------------------------------------------------------------

export async function computeTimeTracking(
  projectId: string,
  options?: { iterationId?: string; teamId?: string; costPerHour?: number }
) {
  const where: Record<string, unknown> = { projectId, ...issueTeamFilter(options?.teamId) }
  if (options?.iterationId) where.iterationId = options.iterationId

  const [summary, assigneeRows, typeRows] = await Promise.all([
    db.issue.aggregate({
      where,
      _sum: { estimatedHours: true, completedHours: true, remainingHours: true },
      _count: { id: true },
    }),
    db.issue.groupBy({
      by: ['assigneeId'],
      where: { ...where, assigneeId: { not: null } },
      _sum: { estimatedHours: true, completedHours: true, remainingHours: true },
    }),
    db.issue.groupBy({
      by: ['workItemType'],
      where,
      _sum: { estimatedHours: true, completedHours: true, remainingHours: true },
      _count: { id: true },
    }),
  ])

  const totalEstimated = summary._sum.estimatedHours || 0
  const totalCompleted = summary._sum.completedHours || 0
  const totalRemaining = summary._sum.remainingHours || 0

  const costPerHour = options?.costPerHour ?? 0
  const totalCost = Math.round(totalCompleted * costPerHour * 100) / 100
  const estimatedCost = Math.round(totalEstimated * costPerHour * 100) / 100
  const remainingCost = Math.round(totalRemaining * costPerHour * 100) / 100

  const userIds = assigneeRows
    .map((row) => row.assigneeId)
    .filter((id): id is string => id !== null)
  const users = userIds.length > 0
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, avatar: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  return {
    summary: {
      totalEstimated: Math.round(totalEstimated * 10) / 10,
      totalCompleted: Math.round(totalCompleted * 10) / 10,
      totalRemaining: Math.round(totalRemaining * 10) / 10,
      totalCost,
      estimatedCost,
      remainingCost,
      costPerHour,
      itemCount: summary._count.id,
    },
    byAssignee: assigneeRows
      .filter((row): row is typeof row & { assigneeId: string } => row.assigneeId !== null)
      .map((row) => {
        const user = userMap.get(row.assigneeId)
        const completed = row._sum.completedHours || 0
        return {
          assigneeId: row.assigneeId,
          estimated: row._sum.estimatedHours || 0,
          completed,
          remaining: row._sum.remainingHours || 0,
          name: user?.name || 'Unknown',
          avatar: user?.avatar || null,
          cost: Math.round(completed * costPerHour * 100) / 100,
        }
      }),
    byType: typeRows.map((row) => {
      const completed = row._sum.completedHours || 0
      return {
        type: row.workItemType,
        estimated: row._sum.estimatedHours || 0,
        completed,
        remaining: row._sum.remainingHours || 0,
        count: row._count.id,
        cost: Math.round(completed * costPerHour * 100) / 100,
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// 9. Executive Dashboard
// ---------------------------------------------------------------------------

export async function computeExecutiveDashboard(userProjectIds: string[]) {
  if (!userProjectIds.length) {
    return { projects: [], totals: { totalProjects: 0, totalIssues: 0, completedIssues: 0, overallProgress: 0, totalPoints: 0, completedPoints: 0, totalBugs: 0, openBugs: 0 } }
  }

  const projects = await db.project.findMany({
    where: { id: { in: userProjectIds }, isArchived: false },
    select: { id: true, key: true, name: true, color: true },
  })

  const [issueCounts, pointSums, completedPointSums, bugCounts] = await Promise.all([
    db.issue.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: userProjectIds } },
      _count: { id: true },
    }),
    db.issue.groupBy({
      by: ['projectId'],
      where: { projectId: { in: userProjectIds } },
      _sum: { storyPoints: true },
      _count: { id: true },
    }),
    db.issue.groupBy({
      by: ['projectId'],
      where: { projectId: { in: userProjectIds }, status: 'done' },
      _sum: { storyPoints: true },
    }),
    db.issue.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: userProjectIds }, workItemType: 'bug' },
      _count: { id: true },
    }),
  ])

  // Build per-project metrics
  const projectMetrics = projects.map((project) => {
    const counts = issueCounts.filter((c) => c.projectId === project.id)
    const total = counts.reduce((s, c) => s + c._count.id, 0)
    const done = counts.filter((c) => c.status === 'done').reduce((s, c) => s + c._count.id, 0)
    const inProgress = counts.filter((c) => ACTIVE_STATUSES.has(c.status)).reduce((s, c) => s + c._count.id, 0)

    const points = pointSums.find((p) => p.projectId === project.id)
    const completedPoints = completedPointSums.find((p) => p.projectId === project.id)?._sum.storyPoints || 0
    const bugs = bugCounts.filter((b) => b.projectId === project.id)
    const totalBugs = bugs.reduce((s, b) => s + b._count.id, 0)
    const openBugs = bugs.filter((b) => !DONE_STATUSES.has(b.status)).reduce((s, b) => s + b._count.id, 0)

    return {
      ...project,
      totalIssues: total,
      completedIssues: done,
      inProgressIssues: inProgress,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      totalPoints: points?._sum.storyPoints || 0,
      completedPoints,
      totalBugs,
      openBugs,
      health: getProjectHealth(total, done, inProgress, openBugs),
    }
  })

  const totals = {
    totalProjects: projects.length,
    totalIssues: projectMetrics.reduce((s, p) => s + p.totalIssues, 0),
    completedIssues: projectMetrics.reduce((s, p) => s + p.completedIssues, 0),
    overallProgress: 0,
    totalPoints: projectMetrics.reduce((s, p) => s + p.totalPoints, 0),
    completedPoints: projectMetrics.reduce((s, p) => s + p.completedPoints, 0),
    totalBugs: projectMetrics.reduce((s, p) => s + p.totalBugs, 0),
    openBugs: projectMetrics.reduce((s, p) => s + p.openBugs, 0),
  }
  totals.overallProgress = totals.totalIssues > 0
    ? Math.round((totals.completedIssues / totals.totalIssues) * 100)
    : 0

  return { projects: projectMetrics, totals }
}
