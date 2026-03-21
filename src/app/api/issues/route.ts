import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { sanitizeRichText } from '@/lib/domain/content'
import { ensureProjectSystemRecords } from '@/lib/domain/project-bootstrap'
import {
  prepareCustomFieldWrites,
} from '@/lib/domain/work-item-schema'
import {
  getInitialStateForType,
  statusFromStateCategory,
} from '@/lib/domain/state-machine'
import { sendWorkItemAssignmentEmail } from '@/lib/domain/notifications'
import {
  issueMutationInclude,
  serializeIssueRecord,
  validateSprintAssignmentTeamContext,
  validateIssueReferences,
} from '@/lib/domain/issues'

const nonEmptyStringSchema = z.string().trim().min(1)
const nullableReferenceIdSchema = z.union([nonEmptyStringSchema, z.null()]).optional()
const nullableDateStringSchema = z
  .union([z.string().trim().min(1), z.null()])
  .optional()
  .refine(
    (value) => value === undefined || value === null || !Number.isNaN(new Date(value).getTime()),
    { message: 'Invalid date value' }
  )

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

    const auth = await requireProjectPermission(request, projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    await ensureProjectSystemRecords(projectId, auth.actor.userId)

    const where: Record<string, unknown> = { projectId }
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
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { key: { contains: search, mode: 'insensitive' } },
        ...(minimal ? [] : [{ description: { contains: search, mode: 'insensitive' } }]),
      ]
    }

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
    console.error('Error fetching issues:', error)
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createIssueSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'workitem:create')
    if (!auth.ok) return auth.response

    if (data.assigneeId) {
      const assignPermission = await requireProjectPermission(request, data.projectId, 'workitem:assign')
      if (!assignPermission.ok) return assignPermission.response
    }

    if (data.status && data.status !== 'backlog') {
      const transitionPermission = await requireProjectPermission(
        request,
        data.projectId,
        'workitem:transition'
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

    const lastIssue = await db.issue.findFirst({
      where: { projectId: data.projectId },
      orderBy: { createdAt: 'desc' },
      select: { key: true },
    })

    let issueNumber = 1
    if (lastIssue) {
      issueNumber = parseInt(lastIssue.key.split('-')[1] || '0', 10) + 1
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

    const lastIssueInStatus = await db.issue.findFirst({
      where: { projectId: data.projectId, status: effectiveStatus },
      orderBy: { columnOrder: 'desc' },
      select: { columnOrder: true },
    })

    const issue = await db.issue.create({
      data: {
        key: `${project.key}-${issueNumber}`,
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

    if (issue.assignee?.id) {
      void sendWorkItemAssignmentEmail({
        issueId: issue.id,
        assigneeUserId: issue.assignee.id,
        actorUserId: auth.actor.userId,
        origin: request.nextUrl.origin,
      })
    }

    await invalidateSprintCaches(data.projectId, data.iterationId)

    return NextResponse.json(serializeIssueRecord(issue), { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error creating issue:', error)
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 })
  }
}
