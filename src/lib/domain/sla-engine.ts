import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// SLA Engine – production timer lifecycle
// ---------------------------------------------------------------------------

type PolicyFilter = string[] | null

function matchesFilter(value: string, filter: PolicyFilter): boolean {
  if (!filter || !Array.isArray(filter) || filter.length === 0) return true
  return filter.includes(value)
}

/**
 * Attach SLA timers to a newly created issue.
 * Finds all active policies for the project whose priority/type filters match,
 * and creates a "response" + "resolution" timer for each matching policy.
 */
export async function attachSlaTimers(
  issueId: string,
  projectId: string,
  _priority: string,
  _workItemType: string
) {
  // Jobs may run after the issue changes and may be delivered more than once.
  // Re-read the authoritative row and require it to belong to the queued
  // project instead of using stale queue payload attributes.
  const issue = await db.issue.findFirst({
    where: { id: issueId, projectId },
    select: { priority: true, workItemType: true, status: true },
  })
  if (!issue) return

  const policies = await db.slaPolicy.findMany({
    where: { projectId, isActive: true },
  })

  if (policies.length === 0) return

  const now = new Date()
  const timersToCreate: Array<{
    issueId: string
    policyId: string
    timerType: string
    startedAt: Date
    targetAt: Date
    status: string
    elapsedMinutes: number
  }> = []

  for (const policy of policies) {
    const pf = policy.priorityFilter as PolicyFilter
    const tf = policy.typeFilter as PolicyFilter

    if (!matchesFilter(issue.priority, pf)) continue
    if (!matchesFilter(issue.workItemType, tf)) continue

    // Response timer
    timersToCreate.push({
      issueId,
      policyId: policy.id,
      timerType: 'response',
      startedAt: now,
      targetAt: new Date(now.getTime() + policy.responseTimeMinutes * 60_000),
      status: 'running',
      elapsedMinutes: 0,
    })

    // Resolution timer
    timersToCreate.push({
      issueId,
      policyId: policy.id,
      timerType: 'resolution',
      startedAt: now,
      targetAt: new Date(now.getTime() + policy.resolutionTimeMinutes * 60_000),
      status: 'running',
      elapsedMinutes: 0,
    })
  }

  if (timersToCreate.length > 0) {
    await db.slaTimer.createMany({ data: timersToCreate, skipDuplicates: true })

    // A work item can be created or moved directly into an active/final state.
    // Bring newly attached timers to the lifecycle implied by its current
    // status; otherwise response timers remain running forever.
    if (issue.status !== 'backlog') {
      await handleSlaStatusChange(issueId, 'backlog', issue.status)
    }
  }
}

/**
 * Handle SLA timer state transitions when an issue's status changes.
 *
 * - backlog/todo → in_progress: response timer completed (first response)
 * - any → in_progress/in_review: resolution timer keeps running
 * - any → done/cancelled: all timers completed
 * - in_progress → backlog/todo: resolution timer paused
 */
export async function handleSlaStatusChange(
  issueId: string,
  oldStatus: string,
  newStatus: string,
  client: Prisma.TransactionClient | typeof db = db
) {
  if (oldStatus === newStatus) return

  const DONE_STATUSES = new Set(['done', 'cancelled'])
  const ACTIVE_STATUSES = new Set(['in_progress', 'in_review'])
  const WAITING_STATUSES = new Set(['backlog', 'todo'])

  const now = new Date()

  // `status` tracks whether a timer is running, paused, or completed.
  // `breachedAt` independently records whether its deadline was missed. Older
  // releases wrote "breached" into status, so lifecycle transitions continue
  // to accept that legacy value while existing deployments converge.
  const OPEN_TIMER_STATUSES = ['running', 'paused', 'breached']

  // Issue resolved or cancelled → complete ALL open timers
  if (DONE_STATUSES.has(newStatus)) {
    const runningTimers = await client.slaTimer.findMany({
      where: { issueId, status: { in: OPEN_TIMER_STATUSES } },
    })

    for (const timer of runningTimers) {
      const elapsed = computeElapsedMinutes(timer, now)
      await client.slaTimer.update({
        where: { id: timer.id },
        data: {
          status: 'completed',
          completedAt: now,
          elapsedMinutes: elapsed,
          breachedAt:
            !timer.breachedAt && now > timer.targetAt ? now : timer.breachedAt,
        },
      })
    }
    return
  }

  // Moving to active status → complete response timers (first response), resume paused resolution timers
  if (ACTIVE_STATUSES.has(newStatus) && !ACTIVE_STATUSES.has(oldStatus)) {
    // Complete response timers (counts as first response)
    const responseTimers = await client.slaTimer.findMany({
      where: { issueId, timerType: 'response', status: { in: OPEN_TIMER_STATUSES } },
    })

    for (const timer of responseTimers) {
      const elapsed = computeElapsedMinutes(timer, now)
      const isBreached = now > timer.targetAt
      await client.slaTimer.update({
        where: { id: timer.id },
        data: {
          status: 'completed',
          completedAt: now,
          elapsedMinutes: elapsed,
          breachedAt: isBreached && !timer.breachedAt ? now : timer.breachedAt,
        },
      })
    }

    // Resume paused resolution timers
    const pausedResolutionTimers = await client.slaTimer.findMany({
      where: { issueId, timerType: 'resolution', status: 'paused' },
    })

    for (const timer of pausedResolutionTimers) {
      const pausedDuration = timer.pausedAt
        ? now.getTime() - timer.pausedAt.getTime()
        : 0
      const newTarget = new Date(timer.targetAt.getTime() + pausedDuration)
      // elapsedMinutes stores completed whole minutes. Carry any fractional
      // minute from the previous active interval into the next one so repeated
      // pause/resume cycles do not silently lose time.
      const previousIntervalMs = timer.pausedAt
        ? Math.max(0, timer.pausedAt.getTime() - timer.startedAt.getTime())
        : 0
      const resumeStartedAt = new Date(now.getTime() - (previousIntervalMs % 60_000))

      await client.slaTimer.update({
        where: { id: timer.id },
        data: {
          status: 'running',
          startedAt: resumeStartedAt,
          pausedAt: null,
          targetAt: newTarget,
        },
      })
    }
    return
  }

  // Moving back to waiting status → pause resolution timers
  if (WAITING_STATUSES.has(newStatus) && ACTIVE_STATUSES.has(oldStatus)) {
    const runningResolutionTimers = await client.slaTimer.findMany({
      where: {
        issueId,
        timerType: 'resolution',
        status: { in: ['running', 'breached'] },
      },
    })

    for (const timer of runningResolutionTimers) {
      const elapsed = computeElapsedMinutes(timer, now)
      await client.slaTimer.update({
        where: { id: timer.id },
        data: {
          status: 'paused',
          pausedAt: now,
          elapsedMinutes: elapsed,
        },
      })
    }
  }
}

/**
 * Check all running timers for breaches. Called by cron.
 * Returns the number of timers whose breach timestamp was first recorded.
 */
export async function checkAndMarkBreachedTimers(): Promise<number> {
  const now = new Date()

  const result = await db.slaTimer.updateMany({
    where: {
      status: 'running',
      targetAt: { lt: now },
      breachedAt: null,
    },
    data: {
      breachedAt: now,
    },
  })

  return result.count
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeElapsedMinutes(
  timer: { startedAt: Date; elapsedMinutes: number; pausedAt: Date | null },
  now: Date
): number {
  if (timer.pausedAt) {
    return timer.elapsedMinutes
  }
  const runningMs = now.getTime() - timer.startedAt.getTime()
  return timer.elapsedMinutes + Math.floor(runningMs / 60_000)
}
