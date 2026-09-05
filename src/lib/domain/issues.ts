import { db } from '@/lib/db'
import {
  customFieldValuesToRecord,
  getProjectWorkItemTypeDefinition,
  UnknownWorkItemTypeError,
} from '@/lib/domain/work-item-schema'
import { isStateMappedToType } from '@/lib/domain/state-machine'

type IssueReferenceValidationInput = {
  projectId: string
  workItemType: string
  currentIssueId?: string | null
  parentIssueId?: string | null
  iterationId?: string | null
  areaId?: string | null
  stateId?: string | null
  assigneeId?: string | null
  labelIds?: string[]
  customFields?: Record<string, unknown>
}

type SprintAssignmentValidationInput = {
  projectId: string
  iterationId?: string | null
  iterationTeamId?: string | null
}

const issueCoreRelations = {
  project: { select: { id: true, key: true, name: true, color: true } },
  assignee: { select: { id: true, name: true, avatar: true } },
  reporter: { select: { id: true, name: true, avatar: true } },
  iteration: {
    select: { id: true, name: true, path: true, startDate: true, endDate: true, teamId: true },
  },
  area: { select: { id: true, name: true, path: true } },
  stateRecord: {
    select: { id: true, name: true, color: true, category: true, order: true },
  },
  parentIssue: {
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      workItemType: true,
    },
  },
  labels: {
    include: { label: { select: { id: true, name: true, color: true } } },
  },
  typeDefinition: {
    select: {
      key: true,
      name: true,
      icon: true,
      color: true,
      hierarchyLevel: true,
    },
  },
  _count: { select: { comments: true, subIssues: true, attachments: true } },
}

export const issueListInclude = {
  ...issueCoreRelations,
}

export const issueMutationInclude = {
  ...issueCoreRelations,
  fieldValues: {
    include: {
      fieldDefinition: {
        select: {
          id: true,
          key: true,
          label: true,
          dataType: true,
        },
      },
    },
  },
}

export const issueDetailInclude = {
  ...issueMutationInclude,
  subIssues: {
    orderBy: [{ columnOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    take: 100,
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      labels: {
        include: { label: { select: { id: true, name: true, color: true } } },
      },
      typeDefinition: {
        select: {
          key: true,
          name: true,
          icon: true,
          color: true,
          hierarchyLevel: true,
        },
      },
      _count: { select: { comments: true, attachments: true, subIssues: true } },
    },
  },
  typeDefinition: {
    include: {
      sections: {
        orderBy: { order: 'asc' as const },
        include: {
          fields: {
            orderBy: { order: 'asc' as const },
          },
        },
      },
      fields: {
        orderBy: { order: 'asc' as const },
      },
    },
  },
}

type ReferenceField = { label: string; id: string }

async function validateReferenceGroup(
  values: ReferenceField[],
  loadValidIds: (ids: string[]) => Promise<Set<string>>,
  message: (label: string) => string
) {
  if (values.length === 0) {
    return null
  }

  const validIds = await loadValidIds(Array.from(new Set(values.map((value) => value.id))))
  for (const value of values) {
    if (!validIds.has(value.id)) {
      return message(value.label)
    }
  }

  return null
}

export async function validateIssueReferences(input: IssueReferenceValidationInput) {
  const {
    projectId,
    workItemType,
    currentIssueId,
    parentIssueId,
    iterationId,
    areaId,
    stateId,
    assigneeId,
    labelIds,
    customFields,
  } = input

  // The type key comes straight from the request body, so an unknown value is a
  // client error. Returned as a validation message rather than thrown, since
  // route handlers here only catch ZodError and everything else became a 500.
  let typeDefinition: Awaited<ReturnType<typeof getProjectWorkItemTypeDefinition>>
  try {
    typeDefinition = await getProjectWorkItemTypeDefinition(projectId, workItemType)
  } catch (error) {
    if (error instanceof UnknownWorkItemTypeError) {
      return error.message
    }
    throw error
  }

  if (parentIssueId) {
    if (currentIssueId && currentIssueId === parentIssueId) {
      return 'Work item cannot be its own parent'
    }

    const parent = await db.issue.findUnique({
      where: { id: parentIssueId },
      select: { projectId: true, workItemType: true, parentIssueId: true },
    })

    if (!parent || parent.projectId !== projectId) {
      return 'Parent work item must belong to the same project'
    }

    const parentType = await getProjectWorkItemTypeDefinition(projectId, parent.workItemType)
    if (parentType.hierarchyLevel >= typeDefinition.hierarchyLevel) {
      return 'Parent work item must be higher in the hierarchy than its child'
    }

    if (currentIssueId) {
      const visited = new Set<string>()
      let cursor: string | null = parentIssueId

      while (cursor) {
        if (cursor === currentIssueId || visited.has(cursor)) {
          return 'Work item hierarchy cannot contain cycles'
        }

        visited.add(cursor)
        const ancestor = await db.issue.findUnique({
          where: { id: cursor },
          select: { parentIssueId: true, projectId: true },
        })

        if (!ancestor || ancestor.projectId !== projectId) {
          break
        }

        cursor = ancestor.parentIssueId
      }
    }
  }

  if (iterationId) {
    const iteration = await db.iteration.findUnique({
      where: { id: iterationId },
      select: { projectId: true },
    })

    if (!iteration || iteration.projectId !== projectId) {
      return 'Iteration path must belong to the same project'
    }
  }

  if (areaId) {
    const area = await db.area.findUnique({
      where: { id: areaId },
      select: { projectId: true },
    })

    if (!area || area.projectId !== projectId) {
      return 'Area path must belong to the same project'
    }
  }

  if (stateId) {
    const state = await db.state.findUnique({
      where: { id: stateId },
      select: { projectId: true },
    })

    if (!state || state.projectId !== projectId) {
      return 'State must belong to the same project'
    }

    const stateMappedToType = await isStateMappedToType(projectId, workItemType, stateId)
    if (!stateMappedToType) {
      return 'State is not enabled for the selected work item type'
    }
  }

  if (assigneeId) {
    const membership = await db.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: assigneeId,
        },
      },
      select: { userId: true },
    })

    if (!membership) {
      return 'Assignee must be a member of the selected project'
    }
  }

  if (labelIds?.length) {
    const labels = await db.label.findMany({
      where: {
        projectId,
        id: { in: labelIds },
      },
      select: { id: true },
    })

    if (labels.length !== new Set(labelIds).size) {
      return 'Labels must belong to the same project'
    }
  }

  if (customFields) {
    const userFields: ReferenceField[] = []
    const teamFields: ReferenceField[] = []
    const iterationFields: ReferenceField[] = []
    const areaFields: ReferenceField[] = []

    for (const fieldDefinition of typeDefinition.fields) {
      const rawValue = customFields[fieldDefinition.key]
      if (rawValue == null || rawValue === '') {
        continue
      }

      if (fieldDefinition.dataType === 'user' && typeof rawValue === 'string') {
        userFields.push({ label: fieldDefinition.label, id: rawValue })
      }

      if (fieldDefinition.dataType === 'team' && typeof rawValue === 'string') {
        teamFields.push({ label: fieldDefinition.label, id: rawValue })
      }

      if (fieldDefinition.dataType === 'iteration' && typeof rawValue === 'string') {
        iterationFields.push({ label: fieldDefinition.label, id: rawValue })
      }

      if (fieldDefinition.dataType === 'area' && typeof rawValue === 'string') {
        areaFields.push({ label: fieldDefinition.label, id: rawValue })
      }
    }

    const [userError, teamError, iterationError, areaError] = await Promise.all([
      validateReferenceGroup(
        userFields,
        async (ids) => {
          const members = await db.projectMember.findMany({
            where: { projectId, userId: { in: ids } },
            select: { userId: true },
          })
          return new Set(members.map((member) => member.userId))
        },
        (label) => `${label} must reference a project member`
      ),
      validateReferenceGroup(
        teamFields,
        async (ids) => {
          const teams = await db.team.findMany({
            where: { projectId, id: { in: ids } },
            select: { id: true },
          })
          return new Set(teams.map((team) => team.id))
        },
        (label) => `${label} must reference a team in the same project`
      ),
      validateReferenceGroup(
        iterationFields,
        async (ids) => {
          const iterations = await db.iteration.findMany({
            where: { projectId, id: { in: ids } },
            select: { id: true },
          })
          return new Set(iterations.map((iteration) => iteration.id))
        },
        (label) => `${label} must reference an iteration in the same project`
      ),
      validateReferenceGroup(
        areaFields,
        async (ids) => {
          const areas = await db.area.findMany({
            where: { projectId, id: { in: ids } },
            select: { id: true },
          })
          return new Set(areas.map((area) => area.id))
        },
        (label) => `${label} must reference an area in the same project`
      ),
    ])

    return userError ?? teamError ?? iterationError ?? areaError ?? null
  }

  return null
}

export function serializeIssueRecord<
  T extends {
    fieldValues?: Array<{
      fieldDefinition: { key: string; dataType: string }
      stringValue: string | null
      numberValue: number | null
      booleanValue: boolean | null
      dateValue: Date | null
      jsonValue: unknown
    }>
  },
>(issue: T) {
  return {
    ...issue,
    customFields: customFieldValuesToRecord(issue.fieldValues ?? []),
  }
}

export async function validateSprintAssignmentTeamContext(
  input: SprintAssignmentValidationInput
) {
  const { projectId, iterationId, iterationTeamId } = input

  if (!iterationId) {
    return null
  }

  const iteration = await db.iteration.findUnique({
    where: { id: iterationId },
    select: {
      id: true,
      projectId: true,
      iterationType: true,
      teamId: true,
    },
  })

  if (!iteration || iteration.projectId !== projectId) {
    return 'Iteration path must belong to the same project'
  }

  if (iteration.iterationType !== 'sprint') {
    return null
  }

  if (!iteration.teamId) {
    return null
  }

  if (!iterationTeamId) {
    return 'Sprint assignment requires team context. Select a sprint team and retry.'
  }

  if (iterationTeamId !== iteration.teamId) {
    return 'Selected sprint does not belong to the provided sprint team context.'
  }

  return null
}
