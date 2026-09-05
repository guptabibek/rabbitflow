import { NextRequest, NextResponse } from 'next/server'
import { internalError, readRequestId, validationError } from '@/lib/api-error'
import { queueAssignmentEmail, queueSlaTimers, queueWebhookEvent } from '@/lib/job-queue'
import { z } from 'zod'
import { db } from '@/lib/db'
import { applyAreaScopeFilter, getAreaAccessScope } from '@/lib/domain/access-control'
import { createAuditLog } from '@/lib/domain/audit'
import { checkActorPermission, requireProjectPermission } from '@/lib/domain/auth'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { sanitizeRichText } from '@/lib/domain/content'
import { formatProjectIssueKey } from '@/lib/domain/issue-key-format'
import { getMaxProjectIssueNumber, lockProjectIssueSequence } from '@/lib/domain/issue-key-sequence'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'
import {
  prepareCustomFieldWrites,
} from '@/lib/domain/work-item-schema'
import {
  getInitialStateForType,
  statusFromStateCategory,
} from '@/lib/domain/state-machine'
import { sendWorkItemAssignmentEmail } from '@/lib/domain/notifications'
import { createNotification } from '@/lib/domain/notification-service'
import { evaluateAutomationRules } from '@/lib/domain/automation-service'
import { attachSlaTimers } from '@/lib/domain/sla-engine'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'
import {
  issueMutationInclude,
  serializeIssueRecord,
  validateSprintAssignmentTeamContext,
  validateIssueReferences,
} from '@/lib/domain/issues'
import { findIssueIdsMatchingSearch } from '@/lib/domain/search-service'

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

const createIssueSchema = z.object({
  projectId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  description: z.string().nullable().optional(),
  workItemType: nonEmptyStringSchema,
  status: z
    .enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'])
    .optional(),
  priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  estimatedHours: z.number().min(0).max(10000).nullable().optional(),
  remainingHours: z.number().min(0).max(10000).nullable().optional(),
  completedHours: z.number().min(0).max(10000).nullable().optional(),
  startDate: nullableDateStringSchema,
  dueDate: nullableDateStringSchema,
  assigneeId: nullableReferenceIdSchema,
  iterationId: nullableReferenceIdSchema,
  iterationTeamId: nullableReferenceIdSchema,
  areaId: nullableReferenceIdSchema,
  stateId: nullableReferenceIdSchema,
  parentIssueId: nullableReferenceIdSchema,
  labelIds: z.array(nonEmptyStringSchema).optional(),
  customFields: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
    )
    .optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const status = searchParams.get('status')
    const assigneeId = searchParams.get('assigneeId')
    const priority = searchParams.get('priority')
    const workItemType = searchParams.get('workItemType')
    const iterationId = searchParams.get('iterationId')
    const search = searchParams.get('search')
    const areaId = searchParams.get('areaId')
    const excludeIssueId = searchParams.get('excludeIssueId')
    const minimal = searchParams.get('minimal') === 'true'
    const includeTotal = searchParams.get('includeTotal') === 'true'
    const labelIds =
      searchParams
        .get('labelIds')
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? []
    const pageRaw = Number.parseInt(searchParams.get('page') || '1', 10)
    const pageSizeRaw = Number.parseInt(searchParams.get('pageSize') || '100', 10)
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw
    const pageSize = Number.isNaN(pageSizeRaw) || pageSizeRaw < 1 ? 100 : Math.min(pageSizeRaw, 200)

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:read', undefined, {
      allowScoped: true,
    })
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(projectId, auth.actor.userId)
    const areaScope = await getAreaAccessScope(projectId, auth.actor.projectRole, 'workitem:read', auth.actor.extraPermissions)

    let where: Record<string, unknown> = { projectId }
    if (status) where.status = status
    if (assigneeId) where.assigneeId = assigneeId
    if (priority) where.priority = priority
    if (workItemType) where.workItemType = workItemType
    if (iterationId) where.iterationId = iterationId
    if (areaId) where.areaId = areaId
    if (excludeIssueId) {
      where.id = { not: excludeIssueId }
    }
    if (labelIds.length > 0) {
      where.labels = {
        some: {
          labelId: {
            in: labelIds,
          },
        },
      }
    }
    if (search) {
      // Use the tsvector index that Issue.searchVector already maintains via a
      // database trigger. Leading-wildcard ILIKE cannot use an index, so the
      // previous `contains` filters sequentially scanned the project's issues on
      // every keystroke-driven request.
      //
      // Issue keys are matched separately: they are short identifiers like
      // "RABBIT-42", not free text, and users expect prefix matching on them.
      const matchingIds = await findIssueIdsMatchingSearch(projectId, search)

      if (matchingIds.length === 0) {
        return NextResponse.json([], {
          headers: {
            'x-page': String(page),
            'x-page-size': String(pageSize),
            ...(includeTotal ? { 'x-total-count': '0' } : {}),
          },
        })
      }

      where.id = where.id
        ? { ...(where.id as Record<string, unknown>), in: matchingIds }
        : { in: matchingIds }
    }

    where = applyAreaScopeFilter(where, areaScope)

    if (minimal) {
      const [issues, total] = await Promise.all([
        db.issue.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            key: true,
            title: true,
            status: true,
            workItemType: true,
            parentIssueId: true,
            updatedAt: true,
            typeDefinition: {
              select: { key: true, name: true, color: true, icon: true, hierarchyLevel: true },
            },
          },
        }),
        includeTotal ? db.issue.count({ where }) : Promise.resolve<number | null>(null),
      ])

      const headers: Record<string, string> = {
        'x-page': String(page),
        'x-page-size': String(pageSize),
      }
      if (total !== null) {
        headers['x-total-count'] = String(total)
      }

      return NextResponse.json(issues, {
        headers,
      })
    }

    const [issues, total] = await Promise.all([
      db.issue.findMany({
        where,
        orderBy: [
          { parentIssueId: 'asc' },
          { columnOrder: 'asc' },
          { createdAt: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: issueMutationInclude,
      }),
      includeTotal ? db.issue.count({ where }) : Promise.resolve<number | null>(null),
    ])

    const headers: Record<string, string> = {
      'x-page': String(page),
      'x-page-size': String(pageSize),
    }
    if (total !== null) {
      headers['x-total-count'] = String(total)
    }

    return NextResponse.json(
      issues.map((issue) => serializeIssueRecord(issue)),
      {
      headers,
      }
    )
  } catch (error) {
    return internalError('Error fetching issues:', error, readRequestId(request))
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createIssueSchema.parse(body)

    const scheduleValidationError = validateIssueSchedule(data.startDate, data.dueDate)
    if (scheduleValidationError) {
      return NextResponse.json({ error: scheduleValidationError }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, data.projectId, 'workitem:create', undefined, {
      areaId: data.areaId ?? null,
    })
    if (!auth.ok) return auth.response

    // Reuse the actor resolved above rather than re-running the full auth chain
    // for each additional permission.
    if (data.assigneeId) {
      const assignPermission = await checkActorPermission(
        auth.actor,
        data.projectId,
        'workitem:assign',
        { areaId: data.areaId ?? null }
      )
      if (!assignPermission.ok) return assignPermission.response
    }

    if (data.status && data.status !== 'backlog') {
      const transitionPermission = await checkActorPermission(
        auth.actor,
        data.projectId,
        'workitem:transition',
        { areaId: data.areaId ?? null }
      )
      if (!transitionPermission.ok) return transitionPermission.response
    }

    await ensureProjectSystemRecords(data.projectId, auth.actor.userId)

    const sprintContextError = await validateSprintAssignmentTeamContext({
      projectId: data.projectId,
      iterationId: data.iterationId,
      iterationTeamId: data.iterationTeamId,
    })

    if (sprintContextError) {
      return NextResponse.json({ error: sprintContextError }, { status: 400 })
    }

    const validationError = await validateIssueReferences({
      projectId: data.projectId,
      workItemType: data.workItemType,
      parentIssueId: data.parentIssueId,
      iterationId: data.iterationId,
      areaId: data.areaId,
      stateId: data.stateId,
      assigneeId: data.assigneeId,
      labelIds: data.labelIds,
      customFields: data.customFields,
    })

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const preparedFields = await prepareCustomFieldWrites(
      data.projectId,
      data.workItemType,
      data.customFields,
      'create'
    )

    if (!preparedFields.ok) {
      return NextResponse.json({ error: preparedFields.error }, { status: 400 })
    }

    const project = await db.project.findUnique({
      where: { id: data.projectId },
      select: { key: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const selectedState = data.stateId
      ? await db.state.findUnique({
          where: { id: data.stateId },
          select: { id: true, category: true, isFinal: true },
        })
      : await getInitialStateForType(data.projectId, preparedFields.typeDefinition.key)

    const effectiveStatus = data.status
      ? data.status
      : selectedState
        ? statusFromStateCategory(selectedState.category)
        : 'backlog'

    const issue = await db.$transaction(async (tx) => {
      await lockProjectIssueSequence(tx, data.projectId)

      const issueNumber =
        (await getMaxProjectIssueNumber(tx, data.projectId, project.key)) + 1

      const lastIssueInStatus = await tx.issue.findFirst({
        where: { projectId: data.projectId, status: effectiveStatus },
        orderBy: { columnOrder: 'desc' },
        select: { columnOrder: true },
      })

      return tx.issue.create({
        data: {
          key: formatProjectIssueKey(project.key, issueNumber),
          title: data.title.trim(),
          description: sanitizeRichText(data.description),
          workItemType: preparedFields.typeDefinition.key,
          status: effectiveStatus,
          priority: data.priority || 'medium',
          severity: data.severity ?? null,
          storyPoints: data.storyPoints ?? null,
          estimatedHours: data.estimatedHours ?? null,
          remainingHours: data.remainingHours ?? null,
          completedHours: data.completedHours ?? null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          assigneeId: data.assigneeId ?? null,
          reporterId: auth.actor.userId,
          iterationId: data.iterationId ?? null,
          areaId: data.areaId ?? null,
          stateId: selectedState?.id ?? null,
          parentIssueId: data.parentIssueId ?? null,
          projectId: data.projectId,
          completedDate:
            effectiveStatus === 'done' || selectedState?.isFinal ? new Date() : null,
          columnOrder: (lastIssueInStatus?.columnOrder || 0) + 1000,
          labels: data.labelIds?.length
            ? { create: data.labelIds.map((labelId) => ({ labelId })) }
            : undefined,
          fieldValues: preparedFields.writes.length
            ? {
                create: preparedFields.writes.map((write) => ({
                  fieldDefinitionId: write.fieldDefinitionId,
                  projectId: write.projectId,
                  stringValue: write.stringValue,
                  numberValue: write.numberValue,
                  booleanValue: write.booleanValue,
                  dateValue: write.dateValue,
                  jsonValue: write.jsonValue,
                })),
              }
            : undefined,
        },
        include: issueMutationInclude,
      })
    })

    await createAuditLog({
      projectId: data.projectId,
      issueId: issue.id,
      userId: auth.actor.userId,
      action: 'work_item_created',
      details: {
        key: issue.key,
        title: issue.title,
        workItemType: issue.workItemType,
      },
    })

    // Attach SLA timers based on matching policies
    void queueSlaTimers(
      issue.id,
      data.projectId,
      issue.priority,
      issue.workItemType
    )

    if (issue.assignee?.id) {
      await createNotification({
        userId: issue.assignee.id,
        projectId: data.projectId,
        issueId: issue.id,
        actorId: auth.actor.userId,
        type: 'assignment',
        title: `Assigned to ${issue.key}`,
        body: issue.title,
        entityType: 'issue',
        entityId: issue.id,
        actionUrl: `/work-items/${issue.id}`,
        metadata: {
          issueKey: issue.key,
          issueTitle: issue.title,
        },
      })

      void queueAssignmentEmail({
        issueId: issue.id,
        assigneeUserId: issue.assignee.id,
        actorUserId: auth.actor.userId,
      })
    }

    await evaluateAutomationRules({
      type: 'issue:created',
      projectId: data.projectId,
      issueId: issue.id,
      userId: auth.actor.userId,
      issue: toAutomationIssueSnapshot(issue),
    })

    const finalIssue =
      (await db.issue.findUnique({
        where: { id: issue.id },
        include: issueMutationInclude,
      })) ?? issue

    void queueWebhookEvent(data.projectId, 'issue.created', {
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
      actorUserId: auth.actor.userId,
    })

    await invalidateSprintCaches(data.projectId, data.iterationId)

    return NextResponse.json(serializeIssueRecord(finalIssue), { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationError(error, readRequestId(request))
    }

    return internalError('Error creating issue:', error, readRequestId(request))
  }
}
