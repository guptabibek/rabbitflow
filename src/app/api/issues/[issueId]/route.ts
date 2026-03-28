import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getProjectPermissionRules } from '@/lib/domain/access-control'
import { createAuditLog } from '@/lib/domain/audit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { sanitizeRichText } from '@/lib/domain/content'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'
import {
  prepareCustomFieldWrites,
} from '@/lib/domain/work-item-schema'
import {
  issueDetailInclude,
  serializeIssueRecord,
  validateSprintAssignmentTeamContext,
  validateIssueReferences,
} from '@/lib/domain/issues'
import { listPermissions, normalizeProjectRole } from '@/lib/domain/rbac'
import { withCache } from '@/lib/redis'
import {
  getStateTransitionConfig,
  isStateTransitionAllowed,
  resolveStateForStatus,
  statusFromStateCategory,
} from '@/lib/domain/state-machine'
import { sendWorkItemAssignmentEmail } from '@/lib/domain/notifications'
import { evaluateAutomationRules } from '@/lib/domain/automation-service'
import { handleSlaStatusChange } from '@/lib/domain/sla-engine'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'

function toAutomationIssueSnapshot(issue: {
  id: string
  key?: string
  title?: string
  status: string
  priority: string
  assigneeId: string | null
  workItemType: string
  storyPoints: number | null
  iterationId?: string | null
  areaId?: string | null
  stateId?: string | null
  labels?: Array<{ label?: { id: string; name: string } | null; labelId?: string }>
}) {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assigneeId: issue.assigneeId,
    workItemType: issue.workItemType,
    storyPoints: issue.storyPoints,
    iterationId: issue.iterationId ?? null,
    areaId: issue.areaId ?? null,
    stateId: issue.stateId ?? null,
    labels: (issue.labels ?? [])
      .map((entry) =>
        entry.label
          ? { id: entry.label.id, name: entry.label.name }
          : entry.labelId
            ? { id: entry.labelId, name: entry.labelId }
            : null
      )
      .filter((label): label is { id: string; name: string } => label !== null),
  }
}

const nonEmptyStringSchema = z.string().trim().min(1)
const nullableReferenceIdSchema = z.union([nonEmptyStringSchema, z.null()]).optional()
const nullableDateStringSchema = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .refine(
    (value) => value === undefined || value === null || !Number.isNaN(new Date(value).getTime()),
    { message: 'Invalid date value' }
  )

function validateIssueSchedule(startDate: string | Date | null | undefined, dueDate: string | Date | null | undefined) {
  if (!startDate || !dueDate) {
    return null
  }

  if (new Date(dueDate).getTime() < new Date(startDate).getTime()) {
    return 'Due date cannot be earlier than start date'
  }

  return null
}

const updateIssueSchema = z.object({
  title: nonEmptyStringSchema.optional(),
  description: z.string().nullable().optional(),
  workItemType: nonEmptyStringSchema.optional(),
  status: z
    .enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'])
    .optional(),
  priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  estimatedHours: z.number().min(0).max(10000).nullable().optional(),
  remainingHours: z.number().min(0).max(10000).nullable().optional(),
  completedHours: z.number().min(0).max(10000).nullable().optional(),
  dueDate: nullableDateStringSchema,
  startDate: nullableDateStringSchema,
  completedDate: nullableDateStringSchema,
  assigneeId: nullableReferenceIdSchema,
  iterationId: nullableReferenceIdSchema,
  iterationTeamId: nullableReferenceIdSchema,
  areaId: nullableReferenceIdSchema,
  stateId: nullableReferenceIdSchema,
  parentIssueId: nullableReferenceIdSchema,
  columnOrder: z.number().optional(),
  labelIds: z.array(nonEmptyStringSchema).optional(),
  customFields: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
    )
    .optional(),
  version: z.number().int().optional(),
})

class IssueVersionConflictError extends Error {}

function hasPersistedFieldValue(write: {
  stringValue: string | null
  numberValue: number | null
  booleanValue: boolean | null
  dateValue: Date | null
  jsonValue: Prisma.InputJsonValue | typeof Prisma.JsonNull
}) {
  return (
    write.stringValue !== null ||
    write.numberValue !== null ||
    write.booleanValue !== null ||
    write.dateValue !== null ||
    (write.jsonValue !== Prisma.JsonNull && write.jsonValue !== null)
  )
}

const workItemPageIssueInclude = {
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
    select: { key: true, name: true, icon: true, color: true, hierarchyLevel: true },
  },
  _count: { select: { comments: true, subIssues: true, attachments: true } },
  fieldValues: {
    include: {
      fieldDefinition: {
        select: { key: true, dataType: true },
      },
    },
  },
  subIssues: {
    orderBy: [{ columnOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    take: 100,
    select: {
      id: true,
      key: true,
      title: true,
      status: true,
      workItemType: true,
    },
  },
} satisfies Prisma.IssueInclude

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId: id } = await params
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') ?? 'summary'

    const issueScope = await db.issue.findUnique({
      where: { id },
      select: { id: true, projectId: true, workItemType: true, areaId: true },
    })

    if (!issueScope) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      issueScope.projectId,
      'workitem:read',
      undefined,
      { areaId: issueScope.areaId ?? null }
    )
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(issueScope.projectId, auth.actor.userId)

    if (mode === 'bootstrap') {
      const cacheKey = `work-item-detail:${issueScope.projectId}:${id}:bootstrap:${auth.actor.userId}`
      const permissionRules = await getProjectPermissionRules(issueScope.projectId)
      const payload = await withCache(cacheKey, 20, async () => {
        const [
          issue,
          members,
          iterations,
          states,
          areas,
          teams,
          workItemTypes,
          typeStateMappings,
          stateTransitions,
          currentUser,
        ] = await Promise.all([
          db.issue.findUnique({
            where: { id },
            include: workItemPageIssueInclude,
          }),
          db.projectMember.findMany({
            where: { projectId: issueScope.projectId },
            orderBy: { user: { name: 'asc' } },
            select: {
              role: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                  avatar: true,
                  globalRole: true,
                },
              },
            },
          }),
          db.iteration.findMany({
            where: { projectId: issueScope.projectId },
            orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              path: true,
              iterationType: true,
              teamId: true,
              startDate: true,
              endDate: true,
            },
          }),
          db.state.findMany({
            where: { projectId: issueScope.projectId },
            orderBy: { order: 'asc' },
            select: {
              id: true,
              name: true,
              color: true,
              category: true,
              order: true,
            },
          }),
          db.area.findMany({
            where: { projectId: issueScope.projectId },
            orderBy: [{ path: 'asc' }, { name: 'asc' }],
            select: { id: true, name: true, path: true, parentId: true },
          }),
          db.team.findMany({
            where: { projectId: issueScope.projectId },
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              color: true,
              members: { select: { id: true, role: true, userId: true, user: { select: { id: true, name: true, email: true, avatar: true } } } },
            },
          }),
          db.workItemTypeDefinition.findMany({
            where: {
              projectId: issueScope.projectId,
              OR: [{ isEnabled: true }, { key: issueScope.workItemType }],
            },
            orderBy: [{ order: 'asc' }, { name: 'asc' }],
            include: {
              sections: {
                orderBy: { order: 'asc' },
                include: {
                  fields: {
                    orderBy: { order: 'asc' },
                  },
                },
              },
              fields: {
                orderBy: { order: 'asc' },
              },
            },
          }),
          db.workItemTypeStateMapping.findMany({
            where: { projectId: issueScope.projectId },
            orderBy: [{ workItemType: { order: 'asc' } }, { order: 'asc' }],
            select: {
              workItemTypeId: true,
              stateId: true,
              order: true,
              isInitial: true,
            },
          }),
          db.stateTransition.findMany({
            where: {
              projectId: issueScope.projectId,
              isEnabled: true,
            },
            orderBy: [{ workItemType: { order: 'asc' } }, { order: 'asc' }],
            select: {
              id: true,
              workItemTypeId: true,
              fromStateId: true,
              toStateId: true,
              order: true,
              isEnabled: true,
              requiresApproval: true,
              approverRoles: true,
              minApprovals: true,
            },
          }),
          db.user.findUnique({
            where: { id: auth.actor.userId },
            select: {
              id: true,
              email: true,
              name: true,
              avatar: true,
              globalRole: true,
            },
          }),
        ])

        if (!issue) {
          return null
        }

        return {
          issue: serializeIssueRecord(issue),
          context: {
            users: members.map((member) => ({
              ...member.user,
              projectRole: member.role,
            })),
            iterations,
            states,
            areas,
            teams,
            workItemTypes,
            typeStateMappings,
            stateTransitions,
          },
          access: {
            role: normalizeProjectRole(auth.actor.projectRole),
            permissions: listPermissions(auth.actor.projectRole, {
              rules: permissionRules.map((rule) => ({
                role: rule.role,
                permission: rule.permission,
                effect: rule.effect,
                areaId: rule.areaId,
              })),
              areaId: issueScope.areaId ?? null,
              extraPermissions: auth.actor.extraPermissions,
            }),
          },
          viewer: currentUser,
        }
      })

      if (!payload) {
        return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
      }

      return NextResponse.json(payload)
    }

    const issue = await db.issue.findUnique({
      where: { id },
      include: issueDetailInclude,
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    return NextResponse.json(serializeIssueRecord(issue))
  } catch (error) {
    console.error('Error fetching issue:', error)
    return NextResponse.json({ error: 'Failed to fetch issue' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId: id } = await params
    const body = await request.json()
    const data = updateIssueSchema.parse(body)

    const currentIssue = await db.issue.findUnique({
      where: { id },
      include: {
        labels: { select: { labelId: true } },
        fieldValues: {
          include: {
            fieldDefinition: {
              select: { key: true, dataType: true },
            },
          },
        },
      },
    })

    if (!currentIssue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const scheduleValidationError = validateIssueSchedule(
      data.startDate !== undefined ? data.startDate : currentIssue.startDate,
      data.dueDate !== undefined ? data.dueDate : currentIssue.dueDate
    )
    if (scheduleValidationError) {
      return NextResponse.json({ error: scheduleValidationError }, { status: 400 })
    }

    if (data.version !== undefined && data.version !== currentIssue.version) {
      return NextResponse.json(
        {
          error:
            'Conflict: this work item was modified by another user. Refresh the page and try again.',
        },
        { status: 409 }
      )
    }

    const updatePermission = await requireProjectPermission(
      request,
      currentIssue.projectId,
      'workitem:update',
      undefined,
      { areaId: data.areaId ?? currentIssue.areaId ?? null }
    )
    if (!updatePermission.ok) return updatePermission.response

    if (
      data.workItemType !== undefined &&
      data.workItemType !== currentIssue.workItemType
    ) {
      return NextResponse.json(
        { error: 'Work item type cannot be changed after creation' },
        { status: 400 }
      )
    }

    const nextWorkItemType = currentIssue.workItemType
    const typeChanged = false

    if (data.assigneeId !== undefined && data.assigneeId !== currentIssue.assigneeId) {
      const assignPermission = await requireProjectPermission(
        request,
        currentIssue.projectId,
        'workitem:assign',
        undefined,
        { areaId: data.areaId ?? currentIssue.areaId ?? null }
      )
      if (!assignPermission.ok) return assignPermission.response
    }

    const stateChangeRequested =
      data.stateId !== undefined && data.stateId !== currentIssue.stateId
    const statusChangeRequested = data.status !== undefined && data.status !== currentIssue.status

    if (stateChangeRequested || statusChangeRequested) {
      const transitionPermission = await requireProjectPermission(
        request,
        currentIssue.projectId,
        'workitem:transition',
        undefined,
        { areaId: data.areaId ?? currentIssue.areaId ?? null }
      )
      if (!transitionPermission.ok) return transitionPermission.response
    }

    await ensureProjectSystemRecords(currentIssue.projectId, updatePermission.actor.userId)

    if (data.iterationId !== undefined && data.iterationId !== null) {
      const sprintContextError = await validateSprintAssignmentTeamContext({
        projectId: currentIssue.projectId,
        iterationId: data.iterationId,
        iterationTeamId: data.iterationTeamId,
      })

      if (sprintContextError) {
        return NextResponse.json({ error: sprintContextError }, { status: 400 })
      }
    }

    const requestedState =
      data.stateId === undefined
        ? null
        : data.stateId === null
          ? null
          : await db.state.findUnique({
              where: { id: data.stateId },
              select: { id: true, category: true, isFinal: true },
            })

    if (data.stateId !== undefined && data.stateId !== null && !requestedState) {
      return NextResponse.json({ error: 'Selected state does not exist' }, { status: 400 })
    }

    const resolvedStateFromStatus =
      data.status !== undefined && data.status !== currentIssue.status
        ? await resolveStateForStatus(
            currentIssue.projectId,
            nextWorkItemType,
            data.status,
            currentIssue.stateId
          )
        : null

    if (
      data.status !== undefined &&
      data.status !== currentIssue.status &&
      !resolvedStateFromStatus &&
      data.stateId === undefined
    ) {
      return NextResponse.json(
        {
          error: 'No configured state is mapped to the requested workflow status for this type',
        },
        { status: 400 }
      )
    }

    const targetState =
      data.stateId === undefined ? resolvedStateFromStatus : data.stateId === null ? null : requestedState

    if (
      targetState &&
      currentIssue.stateId &&
      targetState.id !== currentIssue.stateId
    ) {
      const transitionAllowed = await isStateTransitionAllowed(
        currentIssue.projectId,
        nextWorkItemType,
        currentIssue.stateId,
        targetState.id
      )

      if (!transitionAllowed) {
        return NextResponse.json(
          {
            error: 'Invalid workflow transition',
            details: { fromStateId: currentIssue.stateId, toStateId: targetState.id },
          },
          { status: 400 }
        )
      }

      const transitionConfig = await getStateTransitionConfig(
        currentIssue.projectId,
        nextWorkItemType,
        currentIssue.stateId,
        targetState.id
      )

      if (transitionConfig?.isEnabled && transitionConfig.requiresApproval) {
        const approval = await db.approvalRequest.findFirst({
          where: {
            issueId: currentIssue.id,
            transitionId: transitionConfig.id,
            fromStateId: currentIssue.stateId,
            toStateId: targetState.id,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        })

        const approvalIsFresh =
          approval !== null && approval.createdAt.getTime() >= currentIssue.updatedAt.getTime()

        if (!approval || !approvalIsFresh) {
          return NextResponse.json(
            {
              error: 'This workflow transition requires approval before it can be completed.',
              details: {
                code: 'approval_required',
                transitionId: transitionConfig.id,
                fromStateId: currentIssue.stateId,
                toStateId: targetState.id,
                minApprovals: transitionConfig.minApprovals,
              },
            },
            { status: 409 }
          )
        }

        if (approval.status === 'pending') {
          return NextResponse.json(
            {
              error: 'Approval is still pending for this workflow transition.',
              details: {
                code: 'approval_pending',
                approvalId: approval.id,
                transitionId: transitionConfig.id,
              },
            },
            { status: 409 }
          )
        }

        if (approval.status === 'rejected') {
          return NextResponse.json(
            {
              error: 'The most recent approval request for this transition was rejected. Request a new approval to continue.',
              details: {
                code: 'approval_rejected',
                approvalId: approval.id,
                transitionId: transitionConfig.id,
              },
            },
            { status: 409 }
          )
        }
      }
    }

    const validationError = await validateIssueReferences({
      projectId: currentIssue.projectId,
      workItemType: nextWorkItemType,
      currentIssueId: currentIssue.id,
      parentIssueId:
        data.parentIssueId !== undefined ? data.parentIssueId : currentIssue.parentIssueId,
      iterationId:
        data.iterationId !== undefined ? data.iterationId : currentIssue.iterationId,
      areaId: data.areaId !== undefined ? data.areaId : currentIssue.areaId,
      stateId:
        targetState !== null
          ? targetState.id
          : data.stateId === null
            ? null
            : currentIssue.stateId,
      assigneeId:
        data.assigneeId !== undefined ? data.assigneeId : currentIssue.assigneeId,
      labelIds: data.labelIds,
      customFields: data.customFields,
    })

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const preparedFields =
      data.customFields || typeChanged
        ? await prepareCustomFieldWrites(
            currentIssue.projectId,
            nextWorkItemType,
            data.customFields,
            typeChanged ? 'create' : 'update'
          )
        : null

    if (preparedFields && !preparedFields.ok) {
      return NextResponse.json({ error: preparedFields.error }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      version: { increment: 1 },
    }

    if (data.title !== undefined) updateData.title = data.title.trim()
    if (data.description !== undefined) {
      updateData.description = sanitizeRichText(data.description)
    }
    if (targetState) {
      updateData.stateId = targetState.id
      updateData.status =
        data.status ?? statusFromStateCategory(targetState.category)
    } else if (data.stateId === null) {
      updateData.stateId = null
      if (data.status !== undefined) {
        updateData.status = data.status
      }
    } else if (data.status !== undefined) {
      updateData.status = data.status
    }

    if (data.priority !== undefined) updateData.priority = data.priority
    if (data.severity !== undefined) updateData.severity = data.severity
    if (data.storyPoints !== undefined) updateData.storyPoints = data.storyPoints
    if (data.estimatedHours !== undefined) updateData.estimatedHours = data.estimatedHours
    if (data.remainingHours !== undefined) updateData.remainingHours = data.remainingHours
    if (data.completedHours !== undefined) updateData.completedHours = data.completedHours
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null
    }
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate ? new Date(data.startDate) : null
    }
    if (data.completedDate !== undefined) {
      updateData.completedDate = data.completedDate ? new Date(data.completedDate) : null
    }
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId
    if (data.iterationId !== undefined) updateData.iterationId = data.iterationId
    if (data.areaId !== undefined) updateData.areaId = data.areaId
    if (data.parentIssueId !== undefined) updateData.parentIssueId = data.parentIssueId
    if (data.columnOrder !== undefined) updateData.columnOrder = data.columnOrder

    const resolvedStatus =
      typeof updateData.status === 'string' ? updateData.status : currentIssue.status

    if ((resolvedStatus === 'done' || targetState?.isFinal) && currentIssue.status !== 'done') {
      updateData.completedDate = new Date()
    }
    if (
      resolvedStatus !== 'done' &&
      !targetState?.isFinal &&
      currentIssue.status === 'done' &&
      data.completedDate === undefined
    ) {
      updateData.completedDate = null
    }

    let normalizedNextLabels: string[] | null = null
    let labelsChanged = false

    if (data.labelIds !== undefined) {
      normalizedNextLabels = Array.from(new Set(data.labelIds))
      const currentLabels = new Set(currentIssue.labels.map((label) => label.labelId))
      labelsChanged =
        normalizedNextLabels.length !== currentLabels.size ||
        normalizedNextLabels.some((labelId) => !currentLabels.has(labelId))
    }

    const issue = await db.$transaction(async (tx) => {
      const updateResult = await tx.issue.updateMany({
        where: { id, version: currentIssue.version },
        data: updateData,
      })

      if (updateResult.count !== 1) {
        throw new IssueVersionConflictError()
      }

      if (labelsChanged) {
        await tx.issueLabel.deleteMany({ where: { issueId: id } })

        if (normalizedNextLabels && normalizedNextLabels.length > 0) {
          await tx.issueLabel.createMany({
            data: normalizedNextLabels.map((labelId) => ({ issueId: id, labelId })),
          })
        }
      }

      if (typeChanged) {
        await tx.workItemFieldValue.deleteMany({ where: { issueId: id } })
      }

      if (preparedFields?.ok) {
        const writes = preparedFields.writes
        const targetDefinitionIds = Array.from(new Set(writes.map((write) => write.fieldDefinitionId)))

        if (!typeChanged && targetDefinitionIds.length > 0) {
          await tx.workItemFieldValue.deleteMany({
            where: {
              issueId: id,
              fieldDefinitionId: { in: targetDefinitionIds },
            },
          })
        }

        const persistedWrites = writes.filter((write) => hasPersistedFieldValue(write))
        if (persistedWrites.length > 0) {
          await tx.workItemFieldValue.createMany({
            data: persistedWrites.map((write) => ({
              issueId: id,
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

      const updatedIssue = await tx.issue.findUnique({
        where: { id },
        include: workItemPageIssueInclude,
      })

      if (!updatedIssue) {
        throw new Error('Updated issue could not be reloaded')
      }

      return updatedIssue
    })

    const details: Record<string, unknown> = {}
    if (data.title !== undefined && data.title !== currentIssue.title) {
      details.title = { from: currentIssue.title, to: data.title }
    }
    if (data.status !== undefined && data.status !== currentIssue.status) {
      details.status = { from: currentIssue.status, to: data.status }
    }
    if (data.priority !== undefined && data.priority !== currentIssue.priority) {
      details.priority = { from: currentIssue.priority, to: data.priority }
    }
    if (data.estimatedHours !== undefined && data.estimatedHours !== currentIssue.estimatedHours) {
      details.estimatedHours = { from: currentIssue.estimatedHours, to: data.estimatedHours }
    }
    if (data.remainingHours !== undefined && data.remainingHours !== currentIssue.remainingHours) {
      details.remainingHours = { from: currentIssue.remainingHours, to: data.remainingHours }
    }
    if (data.completedHours !== undefined && data.completedHours !== currentIssue.completedHours) {
      details.completedHours = { from: currentIssue.completedHours, to: data.completedHours }
    }
    if (data.assigneeId !== undefined && data.assigneeId !== currentIssue.assigneeId) {
      details.assigneeId = { from: currentIssue.assigneeId, to: data.assigneeId }
    }
    if (data.iterationId !== undefined && data.iterationId !== currentIssue.iterationId) {
      details.iterationId = { from: currentIssue.iterationId, to: data.iterationId }
    }
    if (data.areaId !== undefined && data.areaId !== currentIssue.areaId) {
      details.areaId = { from: currentIssue.areaId, to: data.areaId }
    }
    if (data.stateId !== undefined && data.stateId !== currentIssue.stateId) {
      details.stateId = { from: currentIssue.stateId, to: data.stateId }
    }
    if (data.customFields !== undefined) {
      details.customFields = Object.keys(data.customFields)
    }

    if (Object.keys(details).length > 0) {
      await createAuditLog({
        projectId: currentIssue.projectId,
        issueId: id,
        userId: updatePermission.actor.userId,
        action: 'work_item_updated',
        details: { key: currentIssue.key, ...details },
      })
    }

    // SLA timer state transitions on status change
    if (issue.status !== currentIssue.status) {
      void handleSlaStatusChange(id, currentIssue.status, issue.status)
    }

    if (
      data.assigneeId !== undefined &&
      data.assigneeId !== currentIssue.assigneeId &&
      issue.assignee?.id
    ) {
      void sendWorkItemAssignmentEmail({
        issueId: issue.id,
        assigneeUserId: issue.assignee.id,
        actorUserId: updatePermission.actor.userId,
      })
    }

    const automationChanges = Object.fromEntries(
      Object.entries(details).filter((entry): entry is [string, { from: unknown; to: unknown }] => {
        const value = entry[1]
        return (
          typeof value === 'object' &&
          value !== null &&
          'from' in value &&
          'to' in value
        )
      })
    ) as Record<string, { from: unknown; to: unknown }>

    if (!('status' in automationChanges) && issue.status !== currentIssue.status) {
      automationChanges.status = { from: currentIssue.status, to: issue.status }
    }
    if (!('assigneeId' in automationChanges) && issue.assigneeId !== currentIssue.assigneeId) {
      automationChanges.assigneeId = {
        from: currentIssue.assigneeId,
        to: issue.assigneeId,
      }
    }
    if (labelsChanged && normalizedNextLabels) {
      automationChanges.labelIds = {
        from: currentIssue.labels.map((label) => label.labelId),
        to: normalizedNextLabels,
      }
    }

    const automationEventBase = {
      projectId: currentIssue.projectId,
      issueId: issue.id,
      userId: updatePermission.actor.userId,
      changes: Object.keys(automationChanges).length > 0 ? automationChanges : undefined,
      issue: toAutomationIssueSnapshot(issue),
    }

    await evaluateAutomationRules({
      ...automationEventBase,
      type: 'issue:updated',
    })

    if (issue.status !== currentIssue.status) {
      await evaluateAutomationRules({
        ...automationEventBase,
        type: 'issue:status_changed',
      })
    }

    if (issue.assigneeId !== currentIssue.assigneeId) {
      await evaluateAutomationRules({
        ...automationEventBase,
        type: 'issue:assigned',
      })
    }

    if (labelsChanged) {
      await evaluateAutomationRules({
        ...automationEventBase,
        type: 'issue:label_changed',
      })
    }

    const finalIssue =
      (await db.issue.findUnique({
        where: { id },
        include: workItemPageIssueInclude,
      })) ?? issue

    void dispatchWebhookEvent(currentIssue.projectId, 'issue.updated', {
      issue: {
        id: finalIssue.id,
        key: finalIssue.key,
        title: finalIssue.title,
        status: finalIssue.status,
        priority: finalIssue.priority,
        workItemType: finalIssue.workItemType,
        assigneeId: finalIssue.assigneeId,
        iterationId: finalIssue.iterationId,
      },
      changes: Object.keys(automationChanges).length > 0 ? automationChanges : undefined,
      actorUserId: updatePermission.actor.userId,
    })

    if (finalIssue.status !== currentIssue.status) {
      void dispatchWebhookEvent(currentIssue.projectId, 'issue.status_changed', {
        issue: {
          id: finalIssue.id,
          key: finalIssue.key,
          title: finalIssue.title,
          status: finalIssue.status,
        },
        from: currentIssue.status,
        to: finalIssue.status,
        actorUserId: updatePermission.actor.userId,
      })
    }

    if (finalIssue.assigneeId !== currentIssue.assigneeId) {
      void dispatchWebhookEvent(currentIssue.projectId, 'issue.assigned', {
        issue: {
          id: finalIssue.id,
          key: finalIssue.key,
          title: finalIssue.title,
          assigneeId: finalIssue.assigneeId,
        },
        from: currentIssue.assigneeId,
        to: finalIssue.assigneeId,
        actorUserId: updatePermission.actor.userId,
      })
    }

    await invalidateSprintCaches(currentIssue.projectId, currentIssue.iterationId)
    if (finalIssue.iteration?.id && finalIssue.iteration.id !== currentIssue.iterationId) {
      await invalidateSprintCaches(currentIssue.projectId, finalIssue.iteration.id)
    }

    return NextResponse.json(serializeIssueRecord(finalIssue))
  } catch (error) {
    if (error instanceof IssueVersionConflictError) {
      return NextResponse.json(
        {
          error:
            'Conflict: this work item was modified by another user. Refresh the page and try again.',
        },
        { status: 409 }
      )
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating issue:', error)
    return NextResponse.json({ error: 'Failed to update issue' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId: id } = await params

    const issue = await db.issue.findUnique({
      where: { id },
      select: {
        projectId: true,
        key: true,
        title: true,
        iterationId: true,
      },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, issue.projectId, 'workitem:delete')
    if (!auth.ok) return auth.response

    await db.issue.delete({ where: { id } })

    await createAuditLog({
      projectId: issue.projectId,
      issueId: id,
      userId: auth.actor.userId,
      action: 'work_item_deleted',
      details: { key: issue.key, title: issue.title },
    })

    void dispatchWebhookEvent(issue.projectId, 'issue.deleted', {
      issue: {
        id,
        key: issue.key,
        title: issue.title,
      },
      actorUserId: auth.actor.userId,
    })

    await invalidateSprintCaches(issue.projectId, issue.iterationId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting issue:', error)
    return NextResponse.json({ error: 'Failed to delete issue' }, { status: 500 })
  }
}
