import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { formatProjectIssueKey } from '@/lib/domain/issue-key-format'
import { getMaxProjectIssueNumber, lockProjectIssueSequence } from '@/lib/domain/issue-key-sequence'
import { createAuditLog } from '@/lib/domain/audit'
import { invalidateSprintCaches } from '@/lib/domain/cache'

const MAX_BULK_IDS = 200

const bulkUpdateSchema = z.object({
  projectId: z.string().trim().min(1),
  issueIds: z.array(z.string().trim().min(1)).min(1).max(MAX_BULK_IDS),
  action: z.enum(['update', 'delete', 'move']),
  updates: z
    .object({
      status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
      priority: z.enum(['lowest', 'low', 'medium', 'high', 'highest']).optional(),
      assigneeId: z.union([z.string().trim().min(1), z.null()]).optional(),
      iterationId: z.union([z.string().trim().min(1), z.null()]).optional(),
      areaId: z.union([z.string().trim().min(1), z.null()]).optional(),
      storyPoints: z.union([z.number().int().min(0).max(100), z.null()]).optional(),
      dueDate: z.union([z.string().trim().min(1), z.null()]).optional(),
      addLabelIds: z.array(z.string().trim().min(1)).optional(),
      removeLabelIds: z.array(z.string().trim().min(1)).optional(),
    })
    .optional(),
  targetProjectId: z.string().trim().min(1).optional(), // for 'move' action
})

// POST /api/issues/bulk - Perform bulk operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = bulkUpdateSchema.parse(body)

    // Require permission based on action
    const permission = data.action === 'delete' ? 'workitem:delete' as const : 'workitem:update' as const
    const auth = await requireProjectPermission(request, data.projectId, permission)
    if (!auth.ok) return auth.response

    // Verify all issues exist and belong to the project
    const issues = await db.issue.findMany({
      where: { id: { in: data.issueIds }, projectId: data.projectId },
      select: { id: true },
    })

    if (issues.length !== data.issueIds.length) {
      const foundIds = new Set(issues.map((i) => i.id))
      const missing = data.issueIds.filter((id) => !foundIds.has(id))
      return NextResponse.json(
        { error: 'Some issues not found in project', missing },
        { status: 404 }
      )
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
      // Check permission on target project
      const targetAuth = await requireProjectPermission(request, data.targetProjectId, 'workitem:create')
      if (!targetAuth.ok) return targetAuth.response

      // Get target project key for re-keying
      const targetProject = await db.project.findUnique({
        where: { id: data.targetProjectId },
        select: { id: true, key: true },
      })

      if (!targetProject) {
        return NextResponse.json({ error: 'Target project not found' }, { status: 404 })
      }

      await db.$transaction(async (tx) => {
        await lockProjectIssueSequence(tx, data.targetProjectId!)
        let keyCounter = await getMaxProjectIssueNumber(
          tx,
          data.targetProjectId!,
          targetProject.key
        )

        for (const issueId of data.issueIds) {
          keyCounter++
          await tx.issue.update({
            where: { id: issueId },
            data: {
              projectId: data.targetProjectId!,
              key: formatProjectIssueKey(targetProject.key, keyCounter),
              iterationId: null,
              areaId: null,
            },
          })
        }
      })

      result = { affected: data.issueIds.length, action: 'moved' }

      await createAuditLog({
        projectId: data.projectId,
        userId: auth.actor.userId,
        action: 'bulk_move',
        details: { count: data.issueIds.length, targetProjectId: data.targetProjectId },
      })
    } else if (data.action === 'update' && data.updates) {
      const updates = data.updates
      const updateData: Record<string, unknown> = {}

      if (updates.status !== undefined) updateData.status = updates.status
      if (updates.priority !== undefined) updateData.priority = updates.priority
      if (updates.assigneeId !== undefined) updateData.assigneeId = updates.assigneeId
      if (updates.iterationId !== undefined) updateData.iterationId = updates.iterationId
      if (updates.areaId !== undefined) updateData.areaId = updates.areaId
      if (updates.storyPoints !== undefined) updateData.storyPoints = updates.storyPoints
      if (updates.dueDate !== undefined) {
        updateData.dueDate = updates.dueDate ? new Date(updates.dueDate) : null
      }

      // Handle label changes separately
      const hasLabelChanges = (updates.addLabelIds?.length ?? 0) > 0 || (updates.removeLabelIds?.length ?? 0) > 0

      await db.$transaction(async (tx) => {
        // Apply field updates
        if (Object.keys(updateData).length > 0) {
          await tx.issue.updateMany({
            where: { id: { in: data.issueIds }, projectId: data.projectId },
            data: updateData,
          })
        }

        // Apply label changes per-issue
        if (hasLabelChanges) {
          for (const issueId of data.issueIds) {
            if (updates.addLabelIds && updates.addLabelIds.length > 0) {
              await tx.issueLabel.createMany({
                data: updates.addLabelIds.map((labelId) => ({ issueId, labelId })),
                skipDuplicates: true,
              })
            }
            if (updates.removeLabelIds && updates.removeLabelIds.length > 0) {
              await tx.issueLabel.deleteMany({
                where: { issueId, labelId: { in: updates.removeLabelIds } },
              })
            }
          }
        }
      })

      result = { affected: data.issueIds.length, action: 'updated' }

      await createAuditLog({
        projectId: data.projectId,
        userId: auth.actor.userId,
        action: 'bulk_update',
        details: {
          count: data.issueIds.length,
          fields: Object.keys(updateData),
        },
      })
    } else {
      return NextResponse.json({ error: 'Invalid action or missing data' }, { status: 400 })
    }

    await invalidateSprintCaches(data.projectId).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Bulk operation error:', error)
    return NextResponse.json({ error: 'Bulk operation failed' }, { status: 500 })
  }
}
