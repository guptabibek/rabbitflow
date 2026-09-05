import { copyFile, mkdir } from 'node:fs/promises'
import { queueAssignmentEmail, queueSlaTimers, queueWebhookEvent } from '@/lib/job-queue'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { formatProjectIssueKey } from '@/lib/domain/issue-key-format'
import { getMaxProjectIssueNumber, lockProjectIssueSequence } from '@/lib/domain/issue-key-sequence'
import { issueMutationInclude, serializeIssueRecord } from '@/lib/domain/issues'
import { createNotification } from '@/lib/domain/notification-service'
import { sendWorkItemAssignmentEmail } from '@/lib/domain/notifications'
import { attachSlaTimers } from '@/lib/domain/sla-engine'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const { issueId } = await params
    const source = await db.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        projectId: true,
        key: true,
        title: true,
        description: true,
        workItemType: true,
        status: true,
        priority: true,
        severity: true,
        storyPoints: true,
        estimatedHours: true,
        remainingHours: true,
        completedHours: true,
        dueDate: true,
        startDate: true,
        completedDate: true,
        assigneeId: true,
        iterationId: true,
        areaId: true,
        stateId: true,
        parentIssueId: true,
        iteration: { select: { id: true } },
        project: { select: { key: true } },
        labels: {
          select: { labelId: true },
        },
        fieldValues: {
          select: {
            fieldDefinitionId: true,
            projectId: true,
            stringValue: true,
            numberValue: true,
            booleanValue: true,
            dateValue: true,
            jsonValue: true,
          },
        },
        sourceRelations: {
          select: {
            targetIssueId: true,
            relationType: true,
          },
        },
        targetRelations: {
          select: {
            sourceIssueId: true,
            relationType: true,
          },
        },
        gitLinks: {
          select: {
            provider: true,
            linkType: true,
            externalId: true,
            externalUrl: true,
            title: true,
            author: true,
            branch: true,
            status: true,
            metadata: true,
          },
        },
        attachments: {
          select: {
            fileName: true,
            filePath: true,
            fileSize: true,
            mimeType: true,
          },
        },
        _count: {
          select: {
            subIssues: true,
          },
        },
      },
    })

    if (!source) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const readAuth = await requireProjectPermission(request, source.projectId, 'workitem:read')
    if (!readAuth.ok) return readAuth.response

    const createAuth = await requireProjectPermission(
      request,
      source.projectId,
      'workitem:create',
      undefined,
      { areaId: source.areaId ?? null }
    )
    if (!createAuth.ok) return createAuth.response

    const warnings: string[] = []

    let copiedAssigneeId = source.assigneeId
    if (copiedAssigneeId) {
      const assignAuth = await requireProjectPermission(
        request,
        source.projectId,
        'workitem:assign',
        undefined,
        { areaId: source.areaId ?? null }
      )

      if (!assignAuth.ok) {
        copiedAssigneeId = null
        warnings.push('Assignee was not copied because you do not have permission to assign work items.')
      }
    }

    const hasCopyableLinks =
      Boolean(source.parentIssueId) ||
      source.sourceRelations.length > 0 ||
      source.targetRelations.length > 0 ||
      source.gitLinks.length > 0

    let shouldCopyLinks = true
    if (hasCopyableLinks) {
      const linkAuth = await requireProjectPermission(request, source.projectId, 'workitem:link')
      if (!linkAuth.ok) {
        shouldCopyLinks = false
        warnings.push('Links were not copied because you do not have permission to manage work item links.')
      }
    }

    if (source._count.subIssues > 0) {
      warnings.push('Child hierarchy links were not copied to avoid reparenting existing work items.')
    }

    const createdIssue = await db.$transaction(async (tx) => {
      await lockProjectIssueSequence(tx, source.projectId)

      const issueNumber =
        (await getMaxProjectIssueNumber(tx, source.projectId, source.project.key)) + 1

      const lastIssueInStatus = await tx.issue.findFirst({
        where: { projectId: source.projectId, status: source.status },
        orderBy: { columnOrder: 'desc' },
        select: { columnOrder: true },
      })

      const issue = await tx.issue.create({
        data: {
          key: formatProjectIssueKey(source.project.key, issueNumber),
          title: `Copy of ${source.title}`,
          description: source.description,
          workItemType: source.workItemType,
          status: source.status,
          priority: source.priority,
          severity: source.severity,
          storyPoints: source.storyPoints,
          estimatedHours: source.estimatedHours,
          remainingHours: source.remainingHours,
          completedHours: source.completedHours,
          dueDate: source.dueDate,
          startDate: source.startDate,
          completedDate: source.completedDate,
          assigneeId: copiedAssigneeId,
          reporterId: createAuth.actor.userId,
          iterationId: source.iterationId,
          areaId: source.areaId,
          stateId: source.stateId,
          parentIssueId: shouldCopyLinks ? source.parentIssueId : null,
          projectId: source.projectId,
          columnOrder: (lastIssueInStatus?.columnOrder || 0) + 1000,
          labels: source.labels.length
            ? { create: source.labels.map((label) => ({ labelId: label.labelId })) }
            : undefined,
        },
        include: issueMutationInclude,
      })

      if (source.fieldValues.length > 0) {
        await tx.workItemFieldValue.createMany({
          data: source.fieldValues.map((fieldValue) => ({
            issueId: issue.id,
            fieldDefinitionId: fieldValue.fieldDefinitionId,
            projectId: fieldValue.projectId,
            stringValue: fieldValue.stringValue,
            numberValue: fieldValue.numberValue,
            booleanValue: fieldValue.booleanValue,
            dateValue: fieldValue.dateValue,
            jsonValue: fieldValue.jsonValue ?? undefined,
          })),
        })
      }

      if (shouldCopyLinks) {
        const relationCopies = [
          ...source.sourceRelations.map((relation) => ({
            sourceIssueId: issue.id,
            targetIssueId: relation.targetIssueId,
            relationType: relation.relationType,
          })),
          ...source.targetRelations.map((relation) => ({
            sourceIssueId: relation.sourceIssueId,
            targetIssueId: issue.id,
            relationType: relation.relationType,
          })),
        ]

        if (relationCopies.length > 0) {
          await tx.issueRelation.createMany({ data: relationCopies })
        }

        if (source.gitLinks.length > 0) {
          await tx.gitLink.createMany({
            data: source.gitLinks.map((gitLink) => ({
              issueId: issue.id,
              provider: gitLink.provider,
              linkType: gitLink.linkType,
              externalId: gitLink.externalId,
              externalUrl: gitLink.externalUrl,
              title: gitLink.title,
              author: gitLink.author,
              branch: gitLink.branch,
              status: gitLink.status,
              metadata: gitLink.metadata ?? undefined,
            })),
          })
        }
      }

      await createAuditLog(
        {
          projectId: source.projectId,
          issueId: issue.id,
          userId: createAuth.actor.userId,
          action: 'work_item_copied',
          details: {
            key: issue.key,
            title: issue.title,
            copiedFromIssueId: source.id,
            copiedFromKey: source.key,
          },
        },
        tx
      )

      return issue
    })

    if (source.attachments.length > 0) {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'attachments')
      await mkdir(uploadDir, { recursive: true })

      for (const [index, attachment] of source.attachments.entries()) {
        const extension = path.extname(attachment.fileName) || path.extname(attachment.filePath)
        const safeName = `${createdIssue.id}-${Date.now()}-${index}${extension}`
        const sourceFilePath = path.join(process.cwd(), 'public', attachment.filePath)
        const destinationFilePath = path.join(uploadDir, safeName)

        try {
          await copyFile(sourceFilePath, destinationFilePath)
          await db.attachment.create({
            data: {
              issueId: createdIssue.id,
              fileName: attachment.fileName,
              filePath: `/uploads/attachments/${safeName}`,
              fileSize: attachment.fileSize,
              mimeType: attachment.mimeType,
              uploadedBy: createAuth.actor.userId,
            },
          })
        } catch {
          warnings.push(`Attachment \"${attachment.fileName}\" could not be copied.`)
        }
      }
    }

    if (createdIssue.assignee?.id) {
      await createNotification({
        userId: createdIssue.assignee.id,
        projectId: source.projectId,
        issueId: createdIssue.id,
        actorId: createAuth.actor.userId,
        type: 'assignment',
        title: `Assigned to ${createdIssue.key}`,
        body: createdIssue.title,
        entityType: 'issue',
        entityId: createdIssue.id,
        actionUrl: `/work-items/${createdIssue.id}`,
        metadata: {
          issueKey: createdIssue.key,
          issueTitle: createdIssue.title,
          copiedFromIssueId: source.id,
          copiedFromKey: source.key,
        },
      })

      void queueAssignmentEmail({
        issueId: createdIssue.id,
        assigneeUserId: createdIssue.assignee.id,
        actorUserId: createAuth.actor.userId,
      })
    }

    void queueSlaTimers(
      createdIssue.id,
      source.projectId,
      createdIssue.priority,
      createdIssue.workItemType
    )

    const finalIssue =
      (await db.issue.findUnique({
        where: { id: createdIssue.id },
        include: issueMutationInclude,
      })) ?? createdIssue

    void queueWebhookEvent(source.projectId, 'issue.created', {
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
      actorUserId: createAuth.actor.userId,
      copiedFrom: {
        id: source.id,
        key: source.key,
      },
    })

    await invalidateSprintCaches(source.projectId, source.iteration?.id ?? source.iterationId)

    return NextResponse.json(
      {
        issue: serializeIssueRecord(finalIssue),
        warnings,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error copying issue:', error)
    return NextResponse.json({ error: 'Failed to copy issue' }, { status: 500 })
  }
}
