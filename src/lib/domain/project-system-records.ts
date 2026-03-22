import { Prisma } from '@prisma/client'
import {
  DEFAULT_PROJECT_STATES,
  DEFAULT_WORK_ITEM_TYPES,
  DEFAULT_WORK_ITEM_TYPE_KEYS,
} from './project-system-defaults.ts'
import { buildHierarchyPath, splitHierarchyPath } from './paths.ts'
import { toPrismaJsonValue } from './prisma-json.ts'

type HierarchyRecord = {
  id: string
  name: string
  parentId: string | null
  path: string | null
  pathSegments?: unknown
}

const STATUS_TO_STATE_NAME: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
}

const PLANNING_FIELD_KEYS = ['story_points', 'scope', 'desirability', 'defect_of_origin'] as const

const PLANNING_FIELD_DEFINITIONS = [
  {
    key: 'story_points',
    label: 'Story Points',
    dataType: 'number',
    required: false,
    placeholder: 'Estimate points',
    options: undefined,
    config: { min: 0, max: 100 },
  },
  {
    key: 'scope',
    label: 'Scope',
    dataType: 'single_select',
    required: true,
    placeholder: 'Select scope',
    options: ['In Scope', 'Out of Scope'],
    config: { allowCustomOptions: true },
  },
  {
    key: 'desirability',
    label: 'Desirability',
    dataType: 'single_select',
    required: false,
    placeholder: 'Select desirability',
    options: ['Critical', 'High', 'Medium', 'Low'],
    config: { allowCustomOptions: true },
  },
  {
    key: 'defect_of_origin',
    label: 'Defect of Origin',
    dataType: 'single_select',
    required: false,
    placeholder: 'Select origin',
    options: ['Requirement', 'Design', 'Development', 'Test', 'Deployment'],
    config: { allowCustomOptions: true },
  },
] as const

function hasText(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function humanizeWorkItemTypeKey(key: string) {
  return key
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getUniquePath(basePath: string, usedPaths: Set<string>) {
  let candidate = basePath
  let suffix = 2

  while (usedPaths.has(candidate)) {
    candidate = `${basePath} (${suffix})`
    suffix += 1
  }

  usedPaths.add(candidate)
  return candidate
}

async function backfillHierarchyPaths(
  records: HierarchyRecord[],
  updateRecord: (recordId: string, path: string) => Promise<unknown>
) {
  if (records.length === 0) {
    return
  }

  const recordsById = new Map(records.map((record) => [record.id, record]))
  const resolvedPaths = new Map<string, string>()
  const usedPaths = new Set(
    records
      .map((record) => record.path?.trim())
      .filter((path): path is string => Boolean(path))
  )
  const inProgress = new Set<string>()

  const resolvePath = (recordId: string): string => {
    const cached = resolvedPaths.get(recordId)
    if (cached) {
      return cached
    }

    const record = recordsById.get(recordId)
    if (!record) {
      throw new Error(`Hierarchy record ${recordId} not found`)
    }

    if (hasText(record.path)) {
      const path = record.path!.trim()
      resolvedPaths.set(recordId, path)
      usedPaths.add(path)
      return path
    }

    if (inProgress.has(recordId)) {
      const fallbackPath = getUniquePath(record.name.trim() || record.id, usedPaths)
      resolvedPaths.set(recordId, fallbackPath)
      return fallbackPath
    }

    inProgress.add(recordId)

    const parentPath = record.parentId ? resolvePath(record.parentId) : null
    const basePath = buildHierarchyPath(record.name.trim() || record.id, parentPath)
    const resolvedPath = getUniquePath(basePath, usedPaths)

    inProgress.delete(recordId)
    resolvedPaths.set(recordId, resolvedPath)
    return resolvedPath
  }

  for (const record of records) {
    if (hasText(record.path)) {
      continue
    }

    const nextPath = resolvePath(record.id)
    await updateRecord(record.id, nextPath)
  }
}

async function backfillStateAssignments(tx: Prisma.TransactionClient, projectId: string) {
  const states = await tx.state.findMany({
    where: { projectId },
    select: { id: true, name: true },
  })

  if (states.length === 0) {
    return
  }

  const stateIdByName = new Map(states.map((state) => [state.name, state.id]))

  for (const [status, stateName] of Object.entries(STATUS_TO_STATE_NAME)) {
    const stateId = stateIdByName.get(stateName)
    if (!stateId) {
      continue
    }

    await tx.issue.updateMany({
      where: {
        projectId,
        status,
        stateId: null,
      },
      data: { stateId },
    })
  }
}

async function ensureDefaultStates(tx: Prisma.TransactionClient, projectId: string) {
  const existingStateNames = new Set(
    (
      await tx.state.findMany({
        where: { projectId },
        select: { name: true },
      })
    ).map((state) => state.name)
  )

  const missingStates = DEFAULT_PROJECT_STATES.filter((state) => !existingStateNames.has(state.name))

  if (missingStates.length > 0) {
    await tx.state.createMany({
      data: missingStates.map((state) => ({
        projectId,
        name: state.name,
        color: state.color,
        category: state.category,
        order: state.order,
        isFinal: state.isFinal,
      })),
    })
  }

  for (const state of DEFAULT_PROJECT_STATES) {
    await tx.state.updateMany({
      where: {
        projectId,
        name: state.name,
      },
      data: {
        category: state.category,
        isFinal: state.isFinal,
      },
    })
  }
}

async function ensureDefaultArea(tx: Prisma.TransactionClient, projectId: string) {
  const areaCount = await tx.area.count({ where: { projectId } })

  if (areaCount === 0) {
    const path = buildHierarchyPath('General')
    await tx.area.create({
      data: {
        projectId,
        name: 'General',
        path,
        pathSegments: ['General'],
      },
    })
  }
}

async function ensurePlanningConfigurationForType(
  tx: Prisma.TransactionClient,
  projectId: string,
  workItemTypeId: string
) {
  const planningSection = await tx.workItemSectionDefinition.upsert({
    where: {
      workItemTypeId_key: {
        workItemTypeId,
        key: 'planning',
      },
    },
    update: {
      title: 'Planning',
      description: '',
      sectionType: 'fields',
      isSystem: true,
      order: 900,
      isCollapsible: false,
    },
    create: {
      projectId,
      workItemTypeId,
      key: 'planning',
      title: 'Planning',
      description: '',
      sectionType: 'fields',
      isSystem: true,
      order: 900,
      isCollapsible: false,
    },
  })

  for (const [index, field] of PLANNING_FIELD_DEFINITIONS.entries()) {
    const existing = await tx.workItemFieldDefinition.findUnique({
      where: {
        workItemTypeId_key: {
          workItemTypeId,
          key: field.key,
        },
      },
      select: {
        id: true,
        options: true,
      },
    })

    const mergedOptions = (() => {
      if (field.key !== 'scope') {
        return field.options
      }

      const existingOptions = Array.isArray(existing?.options)
        ? existing?.options.filter((value): value is string => typeof value === 'string')
        : []

      return Array.from(new Set([...(field.options ?? []), ...existingOptions]))
    })()

    await tx.workItemFieldDefinition.upsert({
      where: {
        workItemTypeId_key: {
          workItemTypeId,
          key: field.key,
        },
      },
      update: {
        sectionId: planningSection.id,
        label: field.label,
        dataType: field.dataType,
        required: field.required,
        isSystem: true,
        isQueryable: true,
        placeholder: field.placeholder,
        options: toPrismaJsonValue(mergedOptions),
        config: toPrismaJsonValue(field.config),
        order: index * 10,
      },
      create: {
        projectId,
        workItemTypeId,
        sectionId: planningSection.id,
        key: field.key,
        label: field.label,
        description: null,
        dataType: field.dataType,
        required: field.required,
        isSystem: true,
        isQueryable: true,
        placeholder: field.placeholder,
        options: toPrismaJsonValue(mergedOptions),
        config: toPrismaJsonValue(field.config),
        order: index * 10,
      },
    })
  }
}

async function ensureWorkItemTypeStateMappings(
  tx: Prisma.TransactionClient,
  projectId: string
) {
  const [types, states] = await Promise.all([
    tx.workItemTypeDefinition.findMany({
      where: { projectId },
      select: { id: true },
    }),
    tx.state.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true },
    }),
  ])

  if (types.length === 0 || states.length === 0) {
    return
  }

  for (const type of types) {
    const existingMappings = await tx.workItemTypeStateMapping.findMany({
      where: { workItemTypeId: type.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, stateId: true, isInitial: true, order: true },
    })

    if (existingMappings.length === 0) {
      await tx.workItemTypeStateMapping.createMany({
        data: states.map((state, index) => ({
          projectId,
          workItemTypeId: type.id,
          stateId: state.id,
          order: index * 10,
          isInitial: index === 0,
        })),
      })
      continue
    }

    const mappedStateIds = new Set(existingMappings.map((mapping) => mapping.stateId))
    const maxOrder = existingMappings[existingMappings.length - 1]?.order ?? 0

    let createdCount = 0
    for (const state of states) {
      if (mappedStateIds.has(state.id)) {
        continue
      }

      createdCount += 1
      await tx.workItemTypeStateMapping.create({
        data: {
          projectId,
          workItemTypeId: type.id,
          stateId: state.id,
          order: maxOrder + createdCount * 10,
          isInitial: false,
        },
      })
    }

    const hasInitial = existingMappings.some((mapping) => mapping.isInitial)
    if (!hasInitial) {
      await tx.workItemTypeStateMapping.update({
        where: { id: existingMappings[0].id },
        data: { isInitial: true },
      })
    }
  }
}

async function ensureStateTransitions(tx: Prisma.TransactionClient, projectId: string) {
  const types = await tx.workItemTypeDefinition.findMany({
    where: { projectId },
    select: { id: true },
  })

  for (const type of types) {
    const transitionCount = await tx.stateTransition.count({
      where: { workItemTypeId: type.id },
    })

    if (transitionCount > 0) {
      continue
    }

    const mappings = await tx.workItemTypeStateMapping.findMany({
      where: { workItemTypeId: type.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { stateId: true },
    })

    if (mappings.length === 0) {
      continue
    }

    const transitions: Array<{
      projectId: string
      workItemTypeId: string
      fromStateId: string
      toStateId: string
      order: number
      isEnabled: boolean
    }> = []

    for (let index = 0; index < mappings.length; index += 1) {
      const current = mappings[index]
      const previous = mappings[index - 1]
      const next = mappings[index + 1]

      transitions.push({
        projectId,
        workItemTypeId: type.id,
        fromStateId: current.stateId,
        toStateId: current.stateId,
        order: index * 30,
        isEnabled: true,
      })

      if (previous) {
        transitions.push({
          projectId,
          workItemTypeId: type.id,
          fromStateId: current.stateId,
          toStateId: previous.stateId,
          order: index * 30 + 10,
          isEnabled: true,
        })
      }

      if (next) {
        transitions.push({
          projectId,
          workItemTypeId: type.id,
          fromStateId: current.stateId,
          toStateId: next.stateId,
          order: index * 30 + 20,
          isEnabled: true,
        })
      }
    }

    await tx.stateTransition.createMany({
      data: transitions,
      skipDuplicates: true,
    })
  }
}

async function ensureWorkItemTypeFieldMappings(
  tx: Prisma.TransactionClient,
  projectId: string
) {
  const types = await tx.workItemTypeDefinition.findMany({
    where: { projectId },
    select: { id: true },
  })

  for (const type of types) {
    const [fields, existingMappings] = await Promise.all([
      tx.workItemFieldDefinition.findMany({
        where: { workItemTypeId: type.id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          key: true,
          required: true,
          order: true,
          sectionId: true,
          section: { select: { key: true } },
        },
      }),
      tx.workItemTypeFieldMapping.findMany({
        where: { workItemTypeId: type.id },
        select: { fieldDefinitionId: true },
      }),
    ])

    const existingFieldIds = new Set(
      existingMappings.map((mapping) => mapping.fieldDefinitionId)
    )

    const missingFieldMappings = fields.filter((field) => !existingFieldIds.has(field.id))

    if (missingFieldMappings.length === 0) {
      continue
    }

    await tx.workItemTypeFieldMapping.createMany({
      data: missingFieldMappings.map((field) => ({
        projectId,
        workItemTypeId: type.id,
        fieldDefinitionId: field.id,
        sectionId: field.sectionId,
        groupKey: PLANNING_FIELD_KEYS.includes(field.key as (typeof PLANNING_FIELD_KEYS)[number])
          ? 'planning'
          : field.section?.key ?? 'details',
        order: field.order,
        requiredOverride: field.required,
        isVisible: true,
      })),
      skipDuplicates: true,
    })
  }
}

async function ensureDefaultTeam(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId?: string | null
) {
  const existingTeamCount = await tx.team.count({ where: { projectId } })

  if (existingTeamCount > 0) {
    return
  }

  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  const projectMembers = await tx.projectMember.findMany({
    where: { projectId },
    orderBy: { joinedAt: 'asc' },
    select: { userId: true, role: true },
  })

  const leadUserId =
    userId ??
    projectMembers.find((member) => member.role === 'Admin' || member.role === 'PM')?.userId ??
    projectMembers[0]?.userId ??
    null

  if (!leadUserId) {
    return
  }

  await tx.team.create({
    data: {
      projectId,
      key: 'CORE',
      name: 'Core Team',
      description: `Default delivery team for ${project.name}.`,
      color: '#0f766e',
      leadId: leadUserId,
      createdById: leadUserId,
      members: {
        create: projectMembers.map((member) => ({
          userId: member.userId,
          role:
            member.userId === leadUserId ? 'lead' : member.role === 'QA' ? 'qa' : 'member',
        })),
      },
    },
  })
}

async function ensureWorkItemTypes(tx: Prisma.TransactionClient, projectId: string) {
  for (const workItemType of DEFAULT_WORK_ITEM_TYPES) {
    const typeRecord = await tx.workItemTypeDefinition.upsert({
      where: {
        projectId_key: {
          projectId,
          key: workItemType.key,
        },
      },
      update: {
        name: workItemType.name,
        description: workItemType.description,
        icon: workItemType.icon,
        color: workItemType.color,
        hierarchyLevel: workItemType.hierarchyLevel,
        isSystem: true,
        isEnabled: true,
        order: workItemType.order,
      },
      create: {
        projectId,
        key: workItemType.key,
        name: workItemType.name,
        description: workItemType.description,
        icon: workItemType.icon,
        color: workItemType.color,
        hierarchyLevel: workItemType.hierarchyLevel,
        isSystem: true,
        isEnabled: true,
        order: workItemType.order,
      },
    })

    for (const [sectionIndex, section] of workItemType.sections.entries()) {
      const sectionRecord = await tx.workItemSectionDefinition.upsert({
        where: {
          workItemTypeId_key: {
            workItemTypeId: typeRecord.id,
            key: section.key,
          },
        },
        update: {
          projectId,
          title: section.title,
          description: section.description,
          sectionType: section.sectionType ?? 'fields',
          order: sectionIndex * 10,
          isSystem: true,
          isCollapsible: section.isCollapsible ?? false,
        },
        create: {
          projectId,
          workItemTypeId: typeRecord.id,
          key: section.key,
          title: section.title,
          description: section.description,
          sectionType: section.sectionType ?? 'fields',
          order: sectionIndex * 10,
          isSystem: true,
          isCollapsible: section.isCollapsible ?? false,
        },
      })

      for (const [fieldIndex, field] of section.fields.entries()) {
        await tx.workItemFieldDefinition.upsert({
          where: {
            workItemTypeId_key: {
              workItemTypeId: typeRecord.id,
              key: field.key,
            },
          },
          update: {
            projectId,
            sectionId: sectionRecord.id,
            label: field.label,
            description: field.description,
            dataType: field.dataType,
            required: field.required ?? false,
            isSystem: true,
            isQueryable: true,
            placeholder: field.placeholder,
            options: toPrismaJsonValue(field.options),
            config: toPrismaJsonValue(field.config),
            order: fieldIndex * 10,
          },
          create: {
            projectId,
            workItemTypeId: typeRecord.id,
            sectionId: sectionRecord.id,
            key: field.key,
            label: field.label,
            description: field.description,
            dataType: field.dataType,
            required: field.required ?? false,
            isSystem: true,
            isQueryable: true,
            placeholder: field.placeholder,
            options: toPrismaJsonValue(field.options),
            config: toPrismaJsonValue(field.config),
            order: fieldIndex * 10,
          },
        })
      }
    }

    await ensurePlanningConfigurationForType(tx, projectId, typeRecord.id)
  }

  const distinctLegacyIssueTypes = (
    await tx.issue.findMany({
      where: { projectId },
      distinct: ['workItemType'],
      select: { workItemType: true },
    })
  )
    .map((issue) => issue.workItemType.trim())
    .filter((key) => key.length > 0 && !DEFAULT_WORK_ITEM_TYPE_KEYS.includes(key))

  if (distinctLegacyIssueTypes.length === 0) {
    return
  }

  const existingTypeKeys = new Set(
    (
      await tx.workItemTypeDefinition.findMany({
        where: {
          projectId,
          key: { in: distinctLegacyIssueTypes },
        },
        select: { key: true },
      })
    ).map((type) => type.key)
  )

  const missingTypeKeys = distinctLegacyIssueTypes.filter((key) => !existingTypeKeys.has(key))

  for (const [index, key] of missingTypeKeys.entries()) {
    const createdType = await tx.workItemTypeDefinition.create({
      data: {
        projectId,
        key,
        name: humanizeWorkItemTypeKey(key),
        description: 'Migrated from existing work items.',
        icon: 'SquareStack',
        color: '#64748b',
        hierarchyLevel: 4,
        isSystem: false,
        isEnabled: true,
        order: 1000 + index * 10,
      },
    })

    await ensurePlanningConfigurationForType(tx, projectId, createdType.id)
  }

  const allTypes = await tx.workItemTypeDefinition.findMany({
    where: { projectId },
    select: { id: true },
  })

  for (const type of allTypes) {
    await ensurePlanningConfigurationForType(tx, projectId, type.id)
  }
}

async function normalizeHierarchyRelations(tx: Prisma.TransactionClient, projectId: string) {
  const hierarchyRelations = await tx.issueRelation.findMany({
    where: {
      relationType: { in: ['parent', 'child'] },
      sourceIssue: { projectId },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      relationType: true,
      sourceIssueId: true,
      targetIssueId: true,
    },
  })

  if (hierarchyRelations.length === 0) {
    return
  }

  const existingIssues = await tx.issue.findMany({
    where: { projectId },
    select: { id: true, parentIssueId: true },
  })

  const existingParentByIssueId = new Map(
    existingIssues.map((issue) => [issue.id, issue.parentIssueId ?? null] as const)
  )
  const derivedParentByIssueId = new Map<string, string>()

  for (const relation of hierarchyRelations) {
    const childIssueId =
      relation.relationType === 'parent' ? relation.sourceIssueId : relation.targetIssueId
    const parentIssueId =
      relation.relationType === 'parent' ? relation.targetIssueId : relation.sourceIssueId

    if (
      childIssueId === parentIssueId ||
      existingParentByIssueId.get(childIssueId) ||
      derivedParentByIssueId.has(childIssueId)
    ) {
      continue
    }

    derivedParentByIssueId.set(childIssueId, parentIssueId)
  }

  for (const [childIssueId, parentIssueId] of derivedParentByIssueId.entries()) {
    await tx.issue.update({
      where: { id: childIssueId },
      data: { parentIssueId },
    })
  }

  await tx.issueRelation.deleteMany({
    where: {
      id: { in: hierarchyRelations.map((relation) => relation.id) },
    },
  })
}

async function backfillAreaPaths(tx: Prisma.TransactionClient, projectId: string) {
  const areasMissingPaths = await tx.area.count({
    where: {
      projectId,
      OR: [{ path: null }, { path: '' }, { pathSegments: { equals: Prisma.AnyNull } }],
    },
  })

  if (areasMissingPaths === 0) {
    return
  }

  const areas = await tx.area.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      parentId: true,
      path: true,
      pathSegments: true,
    },
  })

  await backfillHierarchyPaths(areas, async (areaId, path) => {
    await tx.area.update({
      where: { id: areaId },
      data: {
        path,
        pathSegments: splitHierarchyPath(path),
      },
    })
  })

  const areasMissingSegments = await tx.area.findMany({
    where: {
      projectId,
      pathSegments: { equals: Prisma.AnyNull },
      path: { not: null },
    },
    select: { id: true, path: true, name: true },
  })

  for (const area of areasMissingSegments) {
    const sourcePath = area.path?.trim() || area.name
    await tx.area.update({
      where: { id: area.id },
      data: {
        pathSegments: splitHierarchyPath(sourcePath),
      },
    })
  }
}

async function backfillIterationPaths(tx: Prisma.TransactionClient, projectId: string) {
  const iterationsMissingPaths = await tx.iteration.count({
    where: {
      projectId,
      OR: [{ path: null }, { path: '' }, { pathSegments: { equals: Prisma.AnyNull } }],
    },
  })

  if (iterationsMissingPaths === 0) {
    return
  }

  const iterations = await tx.iteration.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      parentId: true,
      path: true,
      pathSegments: true,
    },
  })

  await backfillHierarchyPaths(iterations, async (iterationId, path) => {
    await tx.iteration.update({
      where: { id: iterationId },
      data: {
        path,
        pathSegments: splitHierarchyPath(path),
      },
    })
  })

  const iterationsMissingSegments = await tx.iteration.findMany({
    where: {
      projectId,
      pathSegments: { equals: Prisma.AnyNull },
      path: { not: null },
    },
    select: { id: true, path: true, name: true },
  })

  for (const iteration of iterationsMissingSegments) {
    const sourcePath = iteration.path?.trim() || iteration.name
    await tx.iteration.update({
      where: { id: iteration.id },
      data: {
        pathSegments: splitHierarchyPath(sourcePath),
      },
    })
  }
}

export async function ensureProjectSystemRecordsTx(
  tx: Prisma.TransactionClient,
  projectId: string,
  userId?: string | null
) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })

  if (!project) {
    throw new Error(`Project ${projectId} not found`)
  }

  await ensureDefaultStates(tx, projectId)
  await ensureDefaultArea(tx, projectId)
  await ensureDefaultTeam(tx, projectId, userId)
  await ensureWorkItemTypes(tx, projectId)
  await ensureWorkItemTypeStateMappings(tx, projectId)
  await ensureStateTransitions(tx, projectId)
  await ensureWorkItemTypeFieldMappings(tx, projectId)
  await normalizeHierarchyRelations(tx, projectId)
  await backfillAreaPaths(tx, projectId)
  await backfillIterationPaths(tx, projectId)
  await backfillStateAssignments(tx, projectId)
}
