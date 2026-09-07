import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import { createThrottledErrorLogger } from '@/lib/log-throttle'

/**
 * Durable execution for side effects that used to be fired and forgotten.
 *
 * Work-item mutations previously kicked off webhook delivery, SLA timer
 * attachment and automation-rule evaluation with bare `void someAsyncCall()`.
 * Those promises were not awaited, not retried, and not logged on failure — so
 * SLA timers could silently never attach and webhooks could silently never
 * fire, with nothing for an operator to see.
 *
 * Jobs are enqueued to Redis with retry and backoff. When Redis is unavailable
 * the work falls back to inline execution, which preserves today's behaviour
 * rather than dropping the effect entirely.
 */

export const JOB_QUEUE_NAME = 'side-effects'

// Module-scoped so the suppression window spans reconnects rather than
// resetting with each new queue or worker instance.
const logQueueError = createThrottledErrorLogger('Side effect queue connection error')
const logWorkerError = createThrottledErrorLogger('Side effect worker error')

export type SideEffectJob =
  | { kind: 'webhook'; projectId: string; event: string; data: Record<string, unknown> }
  | {
      kind: 'sla-attach'
      issueId: string
      projectId: string
      priority: string
      workItemType: string
    }
  | {
      kind: 'assignment-email'
      issueId: string
      assigneeUserId: string
      actorUserId: string
    }

/** True when Redis has been configured at all. */
export function isQueueConfigured(): boolean {
  return Boolean(
    process.env.REDIS_URL ||
      process.env.REDIS_TLS_URL ||
      (process.env.REDIS_HOST && process.env.REDIS_PORT)
  )
}

function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL

  // Fail fast rather than retrying forever. BullMQ's default reconnect strategy
  // retries indefinitely, which keeps the Node event loop alive and turns a
  // Redis outage into a hung process rather than a degraded one. Callers already
  // fall back to inline execution, so a quick failure is strictly better.
  const shared = {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 3000,
  }

  if (url) return { url, ...shared } as ConnectionOptions

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT, 10) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
    ...shared,
  } as ConnectionOptions
}

let queue: Queue<SideEffectJob> | null = null

function getQueue(): Queue<SideEffectJob> {
  if (!queue) {
    queue = new Queue<SideEffectJob>(JOB_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        // Failures are retained so a dead-letter view can surface them.
        removeOnFail: { count: 5000 },
      },
    })

    // Without a listener an ioredis connection error is an unhandled 'error'
    // event, which crashes the process.
    queue.on('error', logQueueError)
  }
  return queue
}

/** Release the queue connection. Used on shutdown and by tests. */
export async function closeQueue(): Promise<void> {
  if (!queue) return
  const current = queue
  queue = null
  await current.close().catch(() => {
    // Closing a connection that never established is not an error worth raising.
  })
}

/** Execute a job inline. Shared by the worker and the no-Redis fallback. */
export async function runSideEffect(job: SideEffectJob): Promise<void> {
  switch (job.kind) {
    case 'webhook': {
      const { dispatchWebhookEvent } = await import('@/lib/domain/webhook-service')
      await dispatchWebhookEvent(
        job.projectId,
        job.event as Parameters<typeof dispatchWebhookEvent>[1],
        job.data
      )
      return
    }
    case 'sla-attach': {
      const { attachSlaTimers } = await import('@/lib/domain/sla-engine')
      await attachSlaTimers(job.issueId, job.projectId, job.priority, job.workItemType)
      return
    }
    case 'assignment-email': {
      const { sendWorkItemAssignmentEmail } = await import('@/lib/domain/notifications')
      await sendWorkItemAssignmentEmail({
        issueId: job.issueId,
        assigneeUserId: job.assigneeUserId,
        actorUserId: job.actorUserId,
      })
      return
    }
  }
}

/**
 * Queue a side effect.
 *
 * Never throws: a failure to schedule a webhook must not fail the user's write.
 * It does, however, always log — the previous behaviour swallowed errors
 * entirely.
 */
export async function enqueueSideEffect(job: SideEffectJob): Promise<void> {
  // With no Redis configured there is nothing to enqueue to; run inline rather
  // than paying a connection timeout on every call.
  if (isQueueConfigured()) {
    try {
      await getQueue().add(job.kind, job)
      return
    } catch (error) {
      console.error(
        `Failed to enqueue side effect "${job.kind}", running inline instead:`,
        error instanceof Error ? error.message : error
      )
    }
  }

  try {
    await runSideEffect(job)
  } catch (error) {
    console.error(
      `Side effect "${job.kind}" failed during inline fallback:`,
      error instanceof Error ? error.message : error
    )
  }
}

// ---------------------------------------------------------------------------
// Signature-compatible wrappers.
//
// These mirror the domain functions they replace so call sites change only the
// function name, not their shape. Each returns void and never rejects: enqueuing
// is a fast Redis write, and a scheduling failure must not fail the user's
// request — but unlike the previous `void domainCall()` it is always logged and,
// failing that, still executed.
// ---------------------------------------------------------------------------

export function queueWebhookEvent(
  projectId: string,
  event: string,
  data: Record<string, unknown>
): void {
  void enqueueSideEffect({ kind: 'webhook', projectId, event, data })
}

export function queueSlaTimers(
  issueId: string,
  projectId: string,
  priority: string,
  workItemType: string
): void {
  void enqueueSideEffect({ kind: 'sla-attach', issueId, projectId, priority, workItemType })
}

export function queueAssignmentEmail(args: {
  issueId: string
  assigneeUserId: string
  actorUserId: string
}): void {
  void enqueueSideEffect({ kind: 'assignment-email', ...args })
}

let workerInstance: Worker<SideEffectJob> | null = null

export function startSideEffectWorker(): Worker<SideEffectJob> | null {
  if (workerInstance) return workerInstance
  if (!isQueueConfigured()) {
    console.warn('Redis is not configured; side effects will run inline rather than queued.')
    return null
  }

  workerInstance = new Worker<SideEffectJob>(
    JOB_QUEUE_NAME,
    async (job) => {
      await runSideEffect(job.data)
    },
    { connection: getConnection(), concurrency: 5 }
  )

  workerInstance.on('failed', (job, error) => {
    console.error(
      `Side effect job ${job?.id} (${job?.data?.kind}) failed on attempt ${job?.attemptsMade}:`,
      error.message
    )
  })

  workerInstance.on('error', logWorkerError)

  return workerInstance
}
