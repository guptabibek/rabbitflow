import { db } from '@/lib/db'
import { DEFAULT_WORK_ITEM_TYPE_KEYS } from '@/lib/domain/project-system-defaults.ts'
import { ensureProjectSystemRecordsTx } from '@/lib/domain/project-system-records.ts'

/**
 * Provisioning of a project's system records — states, areas, teams, work-item
 * types, field definitions, state mappings and transitions.
 *
 * This used to run as a lazy self-heal on thirteen read paths. Every project,
 * every process, every five minutes, a user's GET paid for ten parallel COUNT
 * queries; on a cache miss where anything looked unprovisioned it also ran a
 * repair transaction with a sixty-second timeout, inside the request. The
 * dedupe cache was a module-level Map, so the cost multiplied by replica count
 * and replicas could contend on the same repair.
 *
 * Now the project carries a `systemRecordsVersion` stamp. The read path checks
 * one indexed column; provisioning happens explicitly at project creation, and
 * `scripts/backfill-system-records.mts` upgrades existing projects. The lazy
 * path remains only as a safety net for a project that somehow missed both.
 */

/**
 * Bump when `ensureProjectSystemRecordsTx` starts producing records that older
 * projects would not have. Projects below this are re-provisioned once.
 */
export const SYSTEM_RECORDS_VERSION = 1

// Short-lived negative cache: avoids hammering the provisioning path if a
// project genuinely cannot be provisioned (a bad state that would otherwise
// retry on every single request).
const RETRY_BACKOFF_MS = 30_000
const lastAttemptByProject = new Map<string, number>()
const inflight = new Map<string, Promise<void>>()

async function provision(projectId: string, userId?: string | null): Promise<void> {
  await db.$transaction(
    async (tx) => {
      await ensureProjectSystemRecordsTx(tx, projectId, userId)
      await tx.project.update({
        where: { id: projectId },
        data: { systemRecordsVersion: SYSTEM_RECORDS_VERSION },
      })
    },
    { maxWait: 10_000, timeout: 60_000 }
  )
}

/**
 * Provision a project's system records unconditionally.
 *
 * Call this at project creation and from the backfill script — anywhere the
 * work is expected, rather than incidental to serving a request.
 */
export async function provisionProjectSystemRecords(
  projectId: string,
  userId?: string | null
): Promise<void> {
  await provision(projectId, userId)
}

/**
 * Safety net for the read path.
 *
 * Costs one indexed column read when the project is already provisioned, which
 * is the overwhelmingly common case. Only a project whose stamp is behind pays
 * for the transaction, and only once.
 */
export async function ensureProjectSystemRecords(
  projectId: string,
  userId?: string | null
): Promise<void> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { systemRecordsVersion: true },
  })

  // A missing project is not this function's problem to report; the caller's
  // own lookup will produce the 404.
  if (!project) return
  if (project.systemRecordsVersion >= SYSTEM_RECORDS_VERSION) return

  // Coalesce concurrent requests for the same project within this process.
  const existing = inflight.get(projectId)
  if (existing) {
    await existing
    return
  }

  const lastAttempt = lastAttemptByProject.get(projectId) ?? 0
  if (Date.now() - lastAttempt < RETRY_BACKOFF_MS) {
    // A recent attempt failed. Serving slightly stale configuration beats
    // retrying a sixty-second transaction on every request.
    return
  }

  const promise = provision(projectId, userId)
    .catch((error) => {
      // Never fail the caller's read because provisioning could not run.
      console.error(`Failed to provision system records for project ${projectId}:`, error)
    })
    .finally(() => {
      lastAttemptByProject.set(projectId, Date.now())
      inflight.delete(projectId)
    })

  inflight.set(projectId, promise)
  await promise
}

export function getDefaultWorkItemTypeKeys() {
  return [...DEFAULT_WORK_ITEM_TYPE_KEYS]
}
