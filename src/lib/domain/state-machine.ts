import { db } from '@/lib/db'
import { normalizeStateCategory, statusFromStateCategory } from '@/lib/domain/state-categories'
import type { WorkItemStateCategory } from '@/lib/domain/state-categories'

export { normalizeStateCategory, statusFromStateCategory }
export type { WorkItemStateCategory }

const STATUS_CATEGORY_MAP: Record<string, WorkItemStateCategory[]> = {
  backlog: ['Proposed'],
  todo: ['Proposed'],
  in_progress: ['In Progress'],
  in_review: ['In Progress'],
  done: ['Completed'],
  cancelled: ['Completed'],
}

function categoriesForStatus(status: string): WorkItemStateCategory[] {
  return STATUS_CATEGORY_MAP[status] ?? ['Proposed']
}

async function getWorkItemTypeId(projectId: string, typeKey: string) {
  const typeDefinition = await db.workItemTypeDefinition.findUnique({
    where: {
      projectId_key: {
        projectId,
        key: typeKey,
      },
    },
    select: { id: true },
  })

  return typeDefinition?.id ?? null
}

export async function getStateTransitionConfig(
  projectId: string,
  typeKey: string,
  fromStateId: string,
  toStateId: string
) {
  if (fromStateId === toStateId) {
    return null
  }

  const typeId = await getWorkItemTypeId(projectId, typeKey)
  if (!typeId) {
    return null
  }

  return db.stateTransition.findUnique({
    where: {
      workItemTypeId_fromStateId_toStateId: {
        workItemTypeId: typeId,
        fromStateId,
        toStateId,
      },
    },
    select: {
      id: true,
      isEnabled: true,
      requiresApproval: true,
      approverRoles: true,
      minApprovals: true,
    },
  })
}

export async function getMappedStatesForType(projectId: string, typeKey: string) {
  const typeId = await getWorkItemTypeId(projectId, typeKey)
  if (!typeId) {
    return []
  }

  return db.workItemTypeStateMapping.findMany({
    where: {
      projectId,
      workItemTypeId: typeId,
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      state: {
        select: {
          id: true,
          name: true,
          color: true,
          category: true,
          isFinal: true,
          order: true,
        },
      },
    },
  })
}

export async function isStateMappedToType(
  projectId: string,
  typeKey: string,
  stateId: string
): Promise<boolean> {
  const typeId = await getWorkItemTypeId(projectId, typeKey)
  if (!typeId) {
    return false
  }

  const mapping = await db.workItemTypeStateMapping.findUnique({
    where: {
      workItemTypeId_stateId: {
        workItemTypeId: typeId,
        stateId,
      },
    },
    select: { workItemTypeId: true },
  })

  return Boolean(mapping)
}

export async function getInitialStateForType(projectId: string, typeKey: string) {
  const typeId = await getWorkItemTypeId(projectId, typeKey)
  if (!typeId) {
    return null
  }

  const preferred = await db.workItemTypeStateMapping.findFirst({
    where: {
      projectId,
      workItemTypeId: typeId,
      isInitial: true,
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      state: {
        select: {
          id: true,
          category: true,
          isFinal: true,
        },
      },
    },
  })

  if (preferred) {
    return preferred.state
  }

  const fallback = await db.workItemTypeStateMapping.findFirst({
    where: {
      projectId,
      workItemTypeId: typeId,
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      state: {
        select: {
          id: true,
          category: true,
          isFinal: true,
        },
      },
    },
  })

  return fallback?.state ?? null
}

export async function resolveStateForStatus(
  projectId: string,
  typeKey: string,
  status: string,
  currentStateId?: string | null
) {
  const mappedStates = await getMappedStatesForType(projectId, typeKey)
  if (mappedStates.length === 0) {
    return null
  }

  const allowedCategories = new Set(categoriesForStatus(status))

  if (currentStateId) {
    const currentState = mappedStates.find((mapping) => mapping.stateId === currentStateId)?.state
    if (currentState && allowedCategories.has(normalizeStateCategory(currentState.category))) {
      return currentState
    }
  }

  const matchingStates = mappedStates
    .map((mapping) => mapping.state)
    .filter((state) => allowedCategories.has(normalizeStateCategory(state.category)))

  if (matchingStates.length === 0) {
    return null
  }

  if (status === 'done' || status === 'cancelled') {
    return (
      matchingStates.find((state) => state.isFinal) ??
      matchingStates[matchingStates.length - 1]
    )
  }

  return matchingStates[0]
}

export async function isStateTransitionAllowed(
  projectId: string,
  typeKey: string,
  fromStateId: string,
  toStateId: string
): Promise<boolean> {
  if (fromStateId === toStateId) {
    return true
  }

  const typeId = await getWorkItemTypeId(projectId, typeKey)
  if (!typeId) {
    return false
  }

  const transitionCount = await db.stateTransition.count({
    where: {
      projectId,
      workItemTypeId: typeId,
      isEnabled: true,
    },
  })

  if (transitionCount === 0) {
    const [fromMapped, toMapped] = await Promise.all([
      db.workItemTypeStateMapping.findUnique({
        where: {
          workItemTypeId_stateId: {
            workItemTypeId: typeId,
            stateId: fromStateId,
          },
        },
        select: { stateId: true },
      }),
      db.workItemTypeStateMapping.findUnique({
        where: {
          workItemTypeId_stateId: {
            workItemTypeId: typeId,
            stateId: toStateId,
          },
        },
        select: { stateId: true },
      }),
    ])

    return Boolean(fromMapped && toMapped)
  }

  const allowed = await db.stateTransition.findUnique({
    where: {
      workItemTypeId_fromStateId_toStateId: {
        workItemTypeId: typeId,
        fromStateId,
        toStateId,
      },
    },
    select: { isEnabled: true },
  })

  return Boolean(allowed?.isEnabled)
}
