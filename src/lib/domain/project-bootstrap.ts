import { db } from '@/lib/db'
import { DEFAULT_PROJECT_STATES } from '@/lib/domain/project-system-defaults.ts'
import { DEFAULT_WORK_ITEM_TYPE_KEYS } from '@/lib/domain/project-system-defaults.ts'
import { ensureProjectSystemRecordsTx } from '@/lib/domain/project-system-records.ts'

const ENSURE_TTL_MS = 5 * 60 * 1000
const ensuredAtByProject = new Map<string, number>()
const inflightEnsures = new Map<string, Promise<void>>()
const DEFAULT_STATE_NAMES = DEFAULT_PROJECT_STATES.map((state) => state.name)

async function projectSystemLooksReady(projectId: string) {
  const [
    stateCount,
    areaCount,
    teamCount,
    defaultTypeCount,
    areasMissingPaths,
    iterationsMissingPaths,
    typeStateMappingCount,
    stateTransitionCount,
    typeFieldMappingCount,
    legacyHierarchyRelations,
  ] = await Promise.all([
    db.state.count({
      where: {
        projectId,
        name: { in: DEFAULT_STATE_NAMES },
      },
    }),
    db.area.count({ where: { projectId } }),
    db.team.count({ where: { projectId } }),
    db.workItemTypeDefinition.count({
      where: {
        projectId,
        key: { in: DEFAULT_WORK_ITEM_TYPE_KEYS },
      },
    }),
    db.area.count({
      where: {
        projectId,
        OR: [{ path: null }, { path: '' }],
      },
    }),
    db.iteration.count({
      where: {
        projectId,
        OR: [{ path: null }, { path: '' }],
      },
    }),
    db.workItemTypeStateMapping.count({
      where: { projectId },
    }),
    db.stateTransition.count({
      where: { projectId },
    }),
    db.workItemTypeFieldMapping.count({
      where: { projectId },
    }),
    db.issueRelation.count({
      where: {
        relationType: { in: ['parent', 'child'] },
        sourceIssue: { projectId },
      },
    }),
  ])

  return (
    stateCount >= DEFAULT_STATE_NAMES.length &&
    areaCount > 0 &&
    teamCount > 0 &&
    defaultTypeCount >= DEFAULT_WORK_ITEM_TYPE_KEYS.length &&
    areasMissingPaths === 0 &&
    iterationsMissingPaths === 0 &&
    typeStateMappingCount > 0 &&
    stateTransitionCount > 0 &&
    typeFieldMappingCount > 0 &&
    legacyHierarchyRelations === 0
  )
}

export async function ensureProjectSystemRecords(projectId: string, userId?: string | null) {
  const now = Date.now()
  const lastEnsuredAt = ensuredAtByProject.get(projectId) ?? 0
  if (now - lastEnsuredAt < ENSURE_TTL_MS) {
    return
  }

  const inflight = inflightEnsures.get(projectId)
  if (inflight) {
    await inflight
    return
  }

  const ensurePromise = (async () => {
    if (await projectSystemLooksReady(projectId)) {
      ensuredAtByProject.set(projectId, Date.now())
      return
    }

    await db.$transaction((tx) => ensureProjectSystemRecordsTx(tx, projectId, userId), {
      maxWait: 10_000,
      timeout: 60_000,
    })

    ensuredAtByProject.set(projectId, Date.now())
  })()
    .finally(() => {
      inflightEnsures.delete(projectId)
    })

  inflightEnsures.set(projectId, ensurePromise)
  await ensurePromise
}

export function getDefaultWorkItemTypeKeys() {
  return [...DEFAULT_WORK_ITEM_TYPE_KEYS]
}
