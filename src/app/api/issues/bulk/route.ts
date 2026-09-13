import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { checkActorPermission, requireProjectPermission } from '@/lib/domain/auth'
import { formatProjectIssueKey } from '@/lib/domain/issue-key-format'
import { getMaxProjectIssueNumber, lockProjectIssueSequence } from '@/lib/domain/issue-key-sequence'
import { createAuditLog } from '@/lib/domain/audit'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { handleSlaStatusChange } from '@/lib/domain/sla-engine'
import { queueSlaTimers } from '@/lib/job-queue'
import type { Permission } from '@/lib/domain/rbac'
import {
  customFieldValuesToRecord,
  getProjectWorkItemTypeDefinition,
  prepareCustomFieldWritesForDefinition,
  UnknownWorkItemTypeError,
  type PreparedFieldWrite,
  type WorkItemFieldInput,
} from '@/lib/domain/work-item-schema'
import {
  getStateTransitionConfig,
  isStateTransitionAllowed,
  resolveStateForStatus,
} from '@/lib/domain/state-machine'

const MAX_BULK_IDS = 200
const nullableDateSchema = z.union([
  z.string().trim().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid date value',
  }),
  z.null(),
])

const bulkUpdateSchema = z.object({
  projectId: z.string().trim().min(1),
  issueIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(MAX_BULK_IDS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'issueIds must not contain duplicates',
    }),
  action: z.enum(['update', 'delete', 'move']),
  updates: z
    .object({
      status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
      priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
      assigneeId: z.union([z.string().trim().min(1), z.null()]).optional(),
      iterationId: z.union([z.string().trim().min(1), z.null()]).optional(),
      areaId: z.union([z.string().trim().min(1), z.null()]).optional(),
      storyPoints: z.union([z.number().int().min(0).max(100), z.null()]).optional(),
      dueDate: nullableDateSchema.optional(),
      addLabelIds: z.array(z.string().trim().min(1)).max(MAX_BULK_IDS).optional(),
      removeLabelIds: z.array(z.string().trim().min(1)).max(MAX_BULK_IDS).optional(),
    })
    .strict()
    .refine((updates) => Object.keys(updates).length > 0, {
      message: 'At least one update is required',
    })
    .optional(),
  targetProjectId: z.string().trim().min(1).optional(), // for 'move' action
})
  .strict()
  .superRefine((data, context) => {
    if (data.action === 'update' && !data.updates) {
      context.addIssue({ code: 'custom', path: ['updates'], message: 'updates are required' })
    }
    if (data.action !== 'update' && data.updates !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['updates'],
        message: 'updates are only valid for the update action',
      })
    }
    if (data.action === 'move' && !data.targetProjectId) {
      context.addIssue({
        code: 'custom',
        path: ['targetProjectId'],
        message: 'targetProjectId is required',
      })
    }
    if (data.action !== 'move' && data.targetProjectId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['targetProjectId'],
        message: 'targetProjectId is only valid for the move action',
      })
    }
  })

class BulkIssueVersionConflictError extends Error {}

// POST /api/issues/bulk - Perform bulk operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = bulkUpdateSchema.parse(body)

    // Require permission based on action
    const permission = data.action === 'delete' ? 'workitem:delete' as const : 'workitem:update' as const
    const auth = await requireProjectPermission(request, data.projectId, permission, undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    const permissionChecks = new Map<
      string,
      ReturnType<typeof checkActorPermission>
    >()
    const checkPermission = (requiredPermission: Permission, areaId: string | null) => {
      const key = `${requiredPermission}:${areaId ?? 'unassigned'}`
      const existing = permissionChecks.get(key)
      if (existing) return existing

      const pending = checkActorPermission(auth.actor, data.projectId, requiredPermission, { areaId })
      permissionChecks.set(key, pending)
      return pending
    }

    // Verify all issues exist and belong to the project
    const issues = await db.issue.findMany({
      where: { id: { in: data.issueIds }, projectId: data.projectId },
      select: {
        id: true,
        key: true,
        areaId: true,
        iterationId: true,
        assigneeId: true,
        workItemType: true,
        status: true,
        priority: true,
        stateId: true,
        startDate: true,
        completedDate: true,
        updatedAt: true,
        version: true,
        parentIssueId: true,
      },
    })

    if (issues.length !== data.issueIds.length) {
      const foundIds = new Set(issues.map((i) => i.id))
      const missing = data.issueIds.filter((id) => !foundIds.has(id))
      return NextResponse.json(
        { error: 'Some issues not found in project', missing },
        { status: 404 }
      )
    }

    for (const issue of issues) {
      const sourcePermission = await checkPermission(permission, issue.areaId)
      if (!sourcePermission.ok) return sourcePermission.response
    }

    let result: { affected: number; action: string }

    if (data.action === 'delete') {
      await db.$transaction(async (tx) => {
        // Delete related records first
        await tx.comment.deleteMany({ where: { issueId: { in: data.issueIds } } })
        await tx.activity.deleteMany({ where: { issueId: { in: data.issueIds } } })
        await tx.issue.deleteMany({
          where: { id: { in: data.issueIds }, projectId: data.projectId },
        })
      })

      result = { affected: data.issueIds.length, action: 'deleted' }

      await createAuditLog({
        projectId: data.projectId,
        userId: auth.actor.userId,
        action: 'bulk_delete',
        details: { count: data.issueIds.length },
      })
    } else if (data.action === 'move' && data.targetProjectId) {
      if (data.targetProjectId === data.projectId) {
        return NextResponse.json(
          { error: 'Source and target projects must be different' },
          { status: 400 }
        )
      }

      // Check permission on target project
      const targetAuth = await requireProjectPermission(request, data.targetProjectId, 'workitem:create')
      if (!targetAuth.ok) return targetAuth.response

      // Get target project key for re-keying
      const targetProject = await db.project.findUnique({
        where: { id: data.targetProjectId },
        select: { id: true, key: true, isArchived: true },
      })

      if (!targetProject) {
        return NextResponse.json({ error: 'Target project not found' }, { status: 404 })
      }

      if (targetProject.isArchived) {
        return NextResponse.json(
          { error: 'Work items cannot be moved to an archived project' },
          { status: 400 }
        )
      }

      const moveIssueDetails = await db.issue.findMany({
        where: { id: { in: data.issueIds }, projectId: data.projectId },
        select: {
          id: true,
          labels: {
            select: {
              label: { select: { id: true, name: true, projectId: true } },
            },
          },
          fieldValues: {
            include: {
              fieldDefinition: { select: { key: true, dataType: true, projectId: true } },
            },
          },
        },
      })
      if (moveIssueDetails.length !== data.issueIds.length) {
        throw new BulkIssueVersionConflictError()
      }
      const moveDetailsByIssueId = new Map(moveIssueDetails.map((issue) => [issue.id, issue]))
      const orderedIssues = data.issueIds.map((issueId) => ({
        ...issues.find((issue) => issue.id === issueId)!,
        ...moveDetailsByIssueId.get(issueId)!,
      }))
      const targetTypeDefinitions = new Map<
        string,
        Awaited<ReturnType<typeof getProjectWorkItemTypeDefinition>>
      >()
      for (const typeKey of new Set(orderedIssues.map((issue) => issue.workItemType))) {
        try {
          targetTypeDefinitions.set(
            typeKey,
            await getProjectWorkItemTypeDefinition(data.targetProjectId, typeKey)
          )
        } catch (error) {
          if (error instanceof UnknownWorkItemTypeError) {
            return NextResponse.json(
              { error: `Target project does not support work item type "${typeKey}"` },
              { status: 400 }
            )
          }
          throw error
        }
      }

      const assigneeIds = Array.from(
        new Set(
          orderedIssues
            .map((issue) => issue.assigneeId)
            .filter((assigneeId): assigneeId is string => Boolean(assigneeId))
        )
      )
      const targetAssignees = assigneeIds.length > 0
        ? await db.projectMember.findMany({
            where: { projectId: data.targetProjectId, userId: { in: assigneeIds } },
            select: { userId: true },
          })
        : []
      const targetAssigneeIds = new Set(targetAssignees.map((member) => member.userId))
      if (targetAssigneeIds.size > 0) {
        const targetAssignPermission = await checkActorPermission(
          targetAuth.actor,
          data.targetProjectId,
          'workitem:assign',
          { areaId: null }
        )
        if (!targetAssignPermission.ok) return targetAssignPermission.response
      }

      const sourceLabelNames = Array.from(
        new Set(
          orderedIssues.flatMap((issue) => issue.labels.map((entry) => entry.label.name))
        )
      )
      const targetLabels = sourceLabelNames.length > 0
        ? await db.label.findMany({
            where: { projectId: data.targetProjectId, name: { in: sourceLabelNames } },
            select: { id: true, name: true },
          })
        : []
      const targetLabelIdByName = new Map(targetLabels.map((label) => [label.name, label.id]))

      const targetStateByIssueId = new Map<
        string,
        NonNullable<Awaited<ReturnType<typeof resolveStateForStatus>>>
      >()
      const targetStateChecks = new Map<
        string,
        ReturnType<typeof resolveStateForStatus>
      >()
      const targetFieldWritesByIssueId = new Map<string, PreparedFieldWrite[]>()
      const targetLabelIdsByIssueId = new Map<string, string[]>()

      for (const issue of orderedIssues) {
        const stateKey = `${issue.workItemType}:${issue.status}`
        let targetStateCheck = targetStateChecks.get(stateKey)
        if (!targetStateCheck) {
          targetStateCheck = resolveStateForStatus(
            data.targetProjectId,
            issue.workItemType,
            issue.status,
            null
          )
          targetStateChecks.set(stateKey, targetStateCheck)
        }
        const targetState = await targetStateCheck
        if (!targetState) {
          return NextResponse.json(
            {
              error: `Target project has no workflow state mapped to status "${issue.status}" for ${issue.key}`,
            },
            { status: 400 }
          )
        }
        targetStateByIssueId.set(issue.id, targetState)

        const targetType = targetTypeDefinitions.get(issue.workItemType)!
        const targetFieldsByKey = new Map(targetType.fields.map((field) => [field.key, field]))
        const sourceValues = customFieldValuesToRecord(issue.fieldValues)
        const compatibleValues: Record<string, WorkItemFieldInput> = {}
        for (const sourceValue of issue.fieldValues) {
          const targetField = targetFieldsByKey.get(sourceValue.fieldDefinition.key)
          if (!targetField || targetField.dataType !== sourceValue.fieldDefinition.dataType) continue
          compatibleValues[sourceValue.fieldDefinition.key] = sourceValues[
            sourceValue.fieldDefinition.key
          ] as WorkItemFieldInput
        }
        const preparedFields = prepareCustomFieldWritesForDefinition(
          targetType,
          compatibleValues,
          'create'
        )
        if (!preparedFields.ok) {
          return NextResponse.json(
            { error: `Cannot move ${issue.key}: ${preparedFields.error}` },
            { status: 400 }
          )
        }
        const compatibleTargetFieldIds = new Set(
          Object.keys(compatibleValues)
            .map((key) => targetFieldsByKey.get(key)?.id)
            .filter((fieldId): fieldId is string => Boolean(fieldId))
        )
        targetFieldWritesByIssueId.set(
          issue.id,
          preparedFields.writes.filter((write) => compatibleTargetFieldIds.has(write.fieldDefinitionId))
        )
        targetLabelIdsByIssueId.set(
          issue.id,
          Array.from(
            new Set(
              issue.labels
                .map((entry) => targetLabelIdByName.get(entry.label.name))
                .filter((labelId): labelId is string => Boolean(labelId))
            )
          )
        )
      }

      const unselectedChildren = await db.issue.findMany({
        where: {
          projectId: data.projectId,
          parentIssueId: { in: data.issueIds },
          id: { notIn: data.issueIds },
        },
        select: { id: true, areaId: true, version: true },
      })
      for (const child of unselectedChildren) {
        const childPermission = await checkPermission('workitem:update', child.areaId)
        if (!childPermission.ok) return childPermission.response
      }

      const boundaryRelations = await db.issueRelation.findMany({
        where: {
          OR: [
            { sourceIssueId: { in: data.issueIds }, targetIssueId: { notIn: data.issueIds } },
            { targetIssueId: { in: data.issueIds }, sourceIssueId: { notIn: data.issueIds } },
          ],
        },
        include: {
          sourceIssue: { select: { id: true, projectId: true, areaId: true } },
          targetIssue: { select: { id: true, projectId: true, areaId: true } },
        },
      })
      const relationsToDelete = boundaryRelations.filter((relation) => {
        const counterpart = data.issueIds.includes(relation.sourceIssueId)
          ? relation.targetIssue
          : relation.sourceIssue
        return counterpart.projectId !== data.targetProjectId
      })
      for (const relation of relationsToDelete) {
        const selected = data.issueIds.includes(relation.sourceIssueId)
          ? relation.sourceIssue
          : relation.targetIssue
        const linkPermission = await checkPermission('workitem:link', selected.areaId)
        if (!linkPermission.ok) return linkPermission.response
      }

      const preservedRelationCount = await db.issueRelation.count({
        where: {
          OR: [
            { sourceIssueId: { in: data.issueIds }, targetIssueId: { in: data.issueIds } },
            {
              sourceIssueId: { in: data.issueIds },
              targetIssue: { projectId: data.targetProjectId },
            },
            {
              targetIssueId: { in: data.issueIds },
              sourceIssue: { projectId: data.targetProjectId },
            },
          ],
        },
      })
      if (preservedRelationCount > 0) {
        const targetLinkPermission = await checkActorPermission(
          targetAuth.actor,
          data.targetProjectId,
          'workitem:link',
          { areaId: null }
        )
        if (!targetLinkPermission.ok) return targetLinkPermission.response
      }

      await db.$transaction(async (tx) => {
        await lockProjectIssueSequence(tx, data.targetProjectId!)
        let keyCounter = await getMaxProjectIssueNumber(
          tx,
          data.targetProjectId!,
          targetProject.key
        )

        for (const child of unselectedChildren) {
          const detached = await tx.issue.updateMany({
            where: { id: child.id, projectId: data.projectId, version: child.version },
            data: { parentIssueId: null, version: { increment: 1 } },
          })
          if (detached.count !== 1) throw new BulkIssueVersionConflictError()
        }

        if (relationsToDelete.length > 0) {
          await tx.issueRelation.deleteMany({
            where: { id: { in: relationsToDelete.map((relation) => relation.id) } },
          })
        }
        await tx.issueLabel.deleteMany({ where: { issueId: { in: data.issueIds } } })
        await tx.workItemFieldValue.deleteMany({ where: { issueId: { in: data.issueIds } } })
        await tx.approvalRequest.deleteMany({ where: { issueId: { in: data.issueIds } } })
        await tx.slaTimer.deleteMany({ where: { issueId: { in: data.issueIds } } })
        await tx.activity.updateMany({
          where: { issueId: { in: data.issueIds } },
          data: { projectId: data.targetProjectId! },
        })
        await tx.notification.updateMany({
          where: { issueId: { in: data.issueIds } },
          data: { projectId: data.targetProjectId! },
        })
        await tx.automationLog.updateMany({
          where: { issueId: { in: data.issueIds } },
          data: { issueId: null },
        })
        await tx.keyResult.updateMany({
          where: { issueId: { in: data.issueIds } },
          data: { issueId: null },
        })
        await tx.retroItem.updateMany({
          where: { actionItemIssueId: { in: data.issueIds } },
          data: { actionItemIssueId: null },
        })
        await tx.testCase.updateMany({
          where: { linkedIssueId: { in: data.issueIds } },
          data: { linkedIssueId: null },
        })
        await tx.testRun.updateMany({
          where: { linkedIssueId: { in: data.issueIds } },
          data: { linkedIssueId: null },
        })

        for (const issue of orderedIssues) {
          keyCounter++
          const targetState = targetStateByIssueId.get(issue.id)!
          const moved = await tx.issue.updateMany({
            where: { id: issue.id, projectId: data.projectId, version: issue.version },
            data: {
              projectId: data.targetProjectId!,
              key: formatProjectIssueKey(targetProject.key, keyCounter),
              iterationId: null,
              areaId: null,
              stateId: targetState.id,
              assigneeId:
                issue.assigneeId && targetAssigneeIds.has(issue.assigneeId)
                  ? issue.assigneeId
                  : null,
              parentIssueId:
                issue.parentIssueId && data.issueIds.includes(issue.parentIssueId)
                  ? issue.parentIssueId
                  : null,
              completedDate:
                issue.status === 'done' || targetState.isFinal
                  ? issue.completedDate ?? new Date()
                  : null,
              version: { increment: 1 },
            },
          })
          if (moved.count !== 1) throw new BulkIssueVersionConflictError()

          const targetLabelIds = targetLabelIdsByIssueId.get(issue.id) ?? []
          if (targetLabelIds.length > 0) {
            await tx.issueLabel.createMany({
              data: targetLabelIds.map((labelId) => ({ issueId: issue.id, labelId })),
            })
          }

          const targetFieldWrites = targetFieldWritesByIssueId.get(issue.id) ?? []
          if (targetFieldWrites.length > 0) {
            await tx.workItemFieldValue.createMany({
              data: targetFieldWrites.map((write) => ({
                issueId: issue.id,
                fieldDefinitionId: write.fieldDefinitionId,
                projectId: write.projectId,
                stringValue: write.stringValue,
                numberValue: write.numberValue,
                booleanValue: write.booleanValue,
                dateValue: write.dateValue,
                jsonValue: write.jsonValue,
              })),
            })
          }
        }
      })

      for (const issue of orderedIssues) {
        queueSlaTimers(issue.id, data.targetProjectId, issue.priority, issue.workItemType)
      }

      result = { affected: data.issueIds.length, action: 'moved' }

      await createAuditLog({
        projectId: data.projectId,
        userId: auth.actor.userId,
        action: 'bulk_move',
        details: { count: data.issueIds.length, targetProjectId: data.targetProjectId },
      })
      await createAuditLog({
        projectId: data.targetProjectId,
        userId: targetAuth.actor.userId,
        action: 'bulk_move_received',
        details: { count: data.issueIds.length, sourceProjectId: data.projectId },
      })
      await Promise.all([
        invalidateSprintCaches(data.targetProjectId),
        ...Array.from(new Set(orderedIssues.map((issue) => issue.iterationId))).map((iterationId) =>
          invalidateSprintCaches(data.projectId, iterationId)
        ),
      ])
    } else if (data.action === 'update' && data.updates) {
      const updates = data.updates
      const addLabelIds = Array.from(new Set(updates.addLabelIds ?? []))
      const removeLabelIds = Array.from(new Set(updates.removeLabelIds ?? []))
      const overlappingLabelIds = addLabelIds.filter((labelId) => removeLabelIds.includes(labelId))
      if (overlappingLabelIds.length > 0) {
        return NextResponse.json(
          { error: 'The same label cannot be added and removed in one bulk update' },
          { status: 400 }
        )
      }

      if (updates.assigneeId) {
        const assignee = await db.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId: data.projectId,
              userId: updates.assigneeId,
            },
          },
          select: { userId: true },
        })
        if (!assignee) {
          return NextResponse.json(
            { error: 'Assignee must be a member of the selected project' },
            { status: 400 }
          )
        }
      }

      if (updates.areaId) {
        const area = await db.area.findFirst({
          where: { id: updates.areaId, projectId: data.projectId },
          select: { id: true },
        })
        if (!area) {
          return NextResponse.json(
            { error: 'Area path must belong to the same project' },
            { status: 400 }
          )
        }
      }

      if (updates.iterationId) {
        const iteration = await db.iteration.findFirst({
          where: { id: updates.iterationId, projectId: data.projectId },
          select: { id: true },
        })
        if (!iteration) {
          return NextResponse.json(
            { error: 'Iteration path must belong to the same project' },
            { status: 400 }
          )
        }
      }

      const referencedLabelIds = Array.from(new Set([...addLabelIds, ...removeLabelIds]))
      if (referencedLabelIds.length > 0) {
        const labels = await db.label.findMany({
          where: { projectId: data.projectId, id: { in: referencedLabelIds } },
          select: { id: true },
        })
        if (labels.length !== referencedLabelIds.length) {
          return NextResponse.json(
            { error: 'Labels must belong to the same project' },
            { status: 400 }
          )
        }
      }

      const parsedDueDate =
        updates.dueDate === undefined
          ? undefined
          : updates.dueDate === null
            ? null
            : new Date(updates.dueDate)
      if (parsedDueDate) {
        const invalidSchedule = issues.find(
          (issue) => issue.startDate && parsedDueDate.getTime() < issue.startDate.getTime()
        )
        if (invalidSchedule) {
          return NextResponse.json(
            { error: `Due date cannot be earlier than start date for ${invalidSchedule.key}` },
            { status: 400 }
          )
        }
      }

      const commonUpdateData: Record<string, unknown> = {}
      if (updates.priority !== undefined) commonUpdateData.priority = updates.priority
      if (updates.assigneeId !== undefined) commonUpdateData.assigneeId = updates.assigneeId
      if (updates.iterationId !== undefined) commonUpdateData.iterationId = updates.iterationId
      if (updates.areaId !== undefined) commonUpdateData.areaId = updates.areaId
      if (updates.storyPoints !== undefined) commonUpdateData.storyPoints = updates.storyPoints
      if (parsedDueDate !== undefined) commonUpdateData.dueDate = parsedDueDate

      const perIssueUpdateData = new Map<string, Record<string, unknown>>()
      const statusChanges: Array<{ issueId: string; from: string; to: string }> = []
      const stateResolutionChecks = new Map<
        string,
        ReturnType<typeof resolveStateForStatus>
      >()
      const transitionAllowedChecks = new Map<
        string,
        ReturnType<typeof isStateTransitionAllowed>
      >()
      const transitionConfigChecks = new Map<
        string,
        ReturnType<typeof getStateTransitionConfig>
      >()
      const approvalRequirements: Array<{
        issueId: string
        issueKey: string
        issueUpdatedAt: Date
        transitionId: string
        fromStateId: string
        toStateId: string
        minApprovals: number
      }> = []

      for (const issue of issues) {
        const targetAreaId = updates.areaId !== undefined ? updates.areaId : issue.areaId

        if (updates.areaId !== undefined && updates.areaId !== issue.areaId) {
          const targetPermission = await checkPermission('workitem:update', targetAreaId)
          if (!targetPermission.ok) return targetPermission.response
        }

        if (updates.assigneeId !== undefined && updates.assigneeId !== issue.assigneeId) {
          const assignPermission = await checkPermission('workitem:assign', targetAreaId)
          if (!assignPermission.ok) return assignPermission.response
        }

        const issueUpdateData: Record<string, unknown> = {}
        if (updates.status !== undefined && updates.status !== issue.status) {
          const transitionPermission = await checkPermission('workitem:transition', targetAreaId)
          if (!transitionPermission.ok) return transitionPermission.response

          const stateResolutionKey = [issue.workItemType, updates.status, issue.stateId ?? 'none'].join(':')
          let targetStateCheck = stateResolutionChecks.get(stateResolutionKey)
          if (!targetStateCheck) {
            targetStateCheck = resolveStateForStatus(
              data.projectId,
              issue.workItemType,
              updates.status,
              issue.stateId
            )
            stateResolutionChecks.set(stateResolutionKey, targetStateCheck)
          }
          const targetState = await targetStateCheck
          if (!targetState) {
            return NextResponse.json(
              {
                error: `No configured state is mapped to status "${updates.status}" for ${issue.key}`,
              },
              { status: 400 }
            )
          }

          if (issue.stateId && targetState.id !== issue.stateId) {
            const transitionKey = [issue.workItemType, issue.stateId, targetState.id].join(':')
            let transitionAllowedCheck = transitionAllowedChecks.get(transitionKey)
            if (!transitionAllowedCheck) {
              transitionAllowedCheck = isStateTransitionAllowed(
                data.projectId,
                issue.workItemType,
                issue.stateId,
                targetState.id
              )
              transitionAllowedChecks.set(transitionKey, transitionAllowedCheck)
            }
            let transitionConfigCheck = transitionConfigChecks.get(transitionKey)
            if (!transitionConfigCheck) {
              transitionConfigCheck = getStateTransitionConfig(
                data.projectId,
                issue.workItemType,
                issue.stateId,
                targetState.id
              )
              transitionConfigChecks.set(transitionKey, transitionConfigCheck)
            }
            const [transitionAllowed, transitionConfig] = await Promise.all([
              transitionAllowedCheck,
              transitionConfigCheck,
            ])
            if (!transitionAllowed) {
              return NextResponse.json(
                {
                  error: `Invalid workflow transition for ${issue.key}`,
                  details: {
                    fromStateId: issue.stateId,
                    toStateId: targetState.id,
                    userMessage: `${issue.key} cannot move directly to that status. Open it and choose one of the available State options first.`,
                  },
                },
                { status: 400 }
              )
            }

            if (transitionConfig?.isEnabled && transitionConfig.requiresApproval) {
              approvalRequirements.push({
                issueId: issue.id,
                issueKey: issue.key,
                issueUpdatedAt: issue.updatedAt,
                transitionId: transitionConfig.id,
                fromStateId: issue.stateId,
                toStateId: targetState.id,
                minApprovals: transitionConfig.minApprovals,
              })
            }
          }

          issueUpdateData.status = updates.status
          issueUpdateData.stateId = targetState.id
          if ((updates.status === 'done' || targetState.isFinal) && issue.status !== 'done') {
            issueUpdateData.completedDate = new Date()
          } else if (updates.status !== 'done' && !targetState.isFinal && issue.status === 'done') {
            issueUpdateData.completedDate = null
          }
          statusChanges.push({ issueId: issue.id, from: issue.status, to: updates.status })
        }

        perIssueUpdateData.set(issue.id, issueUpdateData)
      }

      if (approvalRequirements.length > 0) {
        const approvals = await db.approvalRequest.findMany({
          where: {
            issueId: { in: approvalRequirements.map((requirement) => requirement.issueId) },
            transitionId: {
              in: approvalRequirements.map((requirement) => requirement.transitionId),
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            issueId: true,
            transitionId: true,
            fromStateId: true,
            toStateId: true,
            status: true,
            createdAt: true,
          },
        })
        const latestApprovals = new Map<string, (typeof approvals)[number]>()
        for (const approval of approvals) {
          const key = [
            approval.issueId,
            approval.transitionId,
            approval.fromStateId,
            approval.toStateId,
          ].join(':')
          if (!latestApprovals.has(key)) latestApprovals.set(key, approval)
        }

        for (const requirement of approvalRequirements) {
          const key = [
            requirement.issueId,
            requirement.transitionId,
            requirement.fromStateId,
            requirement.toStateId,
          ].join(':')
          const approval = latestApprovals.get(key)
          if (!approval || approval.createdAt.getTime() < requirement.issueUpdatedAt.getTime()) {
            return NextResponse.json(
              {
                error: `Workflow transition for ${requirement.issueKey} requires approval`,
                details: {
                  code: 'approval_required',
                  transitionId: requirement.transitionId,
                  fromStateId: requirement.fromStateId,
                  toStateId: requirement.toStateId,
                  minApprovals: requirement.minApprovals,
                },
              },
              { status: 409 }
            )
          }
          if (approval.status !== 'approved') {
            return NextResponse.json(
              {
                error: `Approval for ${requirement.issueKey} is ${approval.status}`,
                details: {
                  code: approval.status === 'pending' ? 'approval_pending' : 'approval_rejected',
                  approvalId: approval.id,
                  transitionId: requirement.transitionId,
                },
              },
              { status: 409 }
            )
          }
        }
      }

      await db.$transaction(async (tx) => {
        for (const issue of issues) {
          const updateResult = await tx.issue.updateMany({
            where: {
              id: issue.id,
              projectId: data.projectId,
              version: issue.version,
            },
            data: {
              ...commonUpdateData,
              ...(perIssueUpdateData.get(issue.id) ?? {}),
              version: { increment: 1 },
            },
          })
          if (updateResult.count !== 1) {
            throw new BulkIssueVersionConflictError()
          }

          if (addLabelIds.length > 0) {
            await tx.issueLabel.createMany({
              data: addLabelIds.map((labelId) => ({ issueId: issue.id, labelId })),
              skipDuplicates: true,
            })
          }
          if (removeLabelIds.length > 0) {
            await tx.issueLabel.deleteMany({
              where: { issueId: issue.id, labelId: { in: removeLabelIds } },
            })
          }
        }

        for (const change of statusChanges) {
          await handleSlaStatusChange(change.issueId, change.from, change.to, tx)
        }
      })

      result = { affected: data.issueIds.length, action: 'updated' }

      await createAuditLog({
        projectId: data.projectId,
        userId: auth.actor.userId,
        action: 'bulk_update',
        details: {
          count: data.issueIds.length,
          fields: Object.keys(updates),
        },
      })
    } else {
      return NextResponse.json({ error: 'Invalid action or missing data' }, { status: 400 })
    }

    await invalidateSprintCaches(data.projectId).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof BulkIssueVersionConflictError) {
      return NextResponse.json(
        {
          error: 'Conflict: one or more work items changed during the bulk update. Refresh and retry.',
        },
        { status: 409 }
      )
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Bulk operation error:', error)
    return NextResponse.json({ error: 'Bulk operation failed' }, { status: 500 })
  }
}
