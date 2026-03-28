import { db } from '@/lib/db'

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
  priority: string,
  workItemType: string
) {
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

    if (!matchesFilter(priority, pf)) continue
    if (!matchesFilter(workItemType, tf)) continue

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
    await db.slaTimer.createMany({ data: timersToCreate })
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
  newStatus: string
) {
  if (oldStatus === newStatus) return

  const DONE_STATUSES = new Set(['done', 'cancelled'])
  const ACTIVE_STATUSES = new Set(['in_progress', 'in_review'])
  const WAITING_STATUSES = new Set(['backlog', 'todo'])

  const now = new Date()

  // Issue resolved or cancelled → complete ALL running/paused timers
  if (DONE_STATUSES.has(newStatus)) {
    const runningTimers = await db.slaTimer.findMany({
      where: { issueId, status: { in: ['running', 'paused'] } },
    })

    for (const timer of runningTimers) {
      const elapsed = computeElapsedMinutes(timer, now)
      await db.slaTimer.update({
        where: { id: timer.id },
        data: {
          status: 'completed',
          completedAt: now,
          elapsedMinutes: elapsed,
        },
      })
    }
    return
  }

  // Moving to active status → complete response timers (first response), resume paused resolution timers
  if (ACTIVE_STATUSES.has(newStatus) && !ACTIVE_STATUSES.has(oldStatus)) {
    // Complete response timers (counts as first response)
    const responseTimers = await db.slaTimer.findMany({
      where: { issueId, timerType: 'response', status: { in: ['running', 'paused'] } },
    })

    for (const timer of responseTimers) {
      const elapsed = computeElapsedMinutes(timer, now)
      const isBreached = now > timer.targetAt
      await db.slaTimer.update({
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
    const pausedResolutionTimers = await db.slaTimer.findMany({
      where: { issueId, timerType: 'resolution', status: 'paused' },
    })

    for (const timer of pausedResolutionTimers) {
      const pausedDuration = timer.pausedAt
        ? now.getTime() - timer.pausedAt.getTime()
        : 0
      const newTarget = new Date(timer.targetAt.getTime() + pausedDuration)

      await db.slaTimer.update({
        where: { id: timer.id },
        data: {
          status: 'running',
          pausedAt: null,
          targetAt: newTarget,
        },
      })
    }
    return
  }

  // Moving back to waiting status → pause resolution timers
  if (WAITING_STATUSES.has(newStatus) && ACTIVE_STATUSES.has(oldStatus)) {
    const runningResolutionTimers = await db.slaTimer.findMany({
      where: { issueId, timerType: 'resolution', status: 'running' },
    })

    for (const timer of runningResolutionTimers) {
      const elapsed = computeElapsedMinutes(timer, now)
      await db.slaTimer.update({
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
 * Returns the number of timers marked as breached.
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
      status: 'breached',
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
