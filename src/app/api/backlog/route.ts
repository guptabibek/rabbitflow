import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { requireProjectPermission } from '@/lib/domain/auth'
import { validateIssueReferences } from '@/lib/domain/issues'
import { buildWorkItemHierarchy } from '@/lib/domain/work-item-hierarchy'
import { isStateTransitionAllowed, resolveStateForStatus } from '@/lib/domain/state-machine'
import { withCache } from '@/lib/redis'

type BacklogNode = {
  id: string
  key: string
  title: string
  description: string | null
  workItemType: string
  status: string
  priority: string
  storyPoints: number | null
  parentIssueId: string | null
  columnOrder: number
  assignee: { id: string; name: string; avatar: string | null } | null
  iteration: { id: string; name: string } | null
  children: BacklogNode[]
}

const reorderSchema = z.object({
  projectId: z.string(),
  itemId: z.string(),
  targetParentId: z.string().nullable().optional(),
  targetStatus: z
    .enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'])
    .optional(),
  beforeItemId: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const workItemType = searchParams.get('workItemType')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const cacheKey = `backlog:${projectId}:${workItemType ?? 'all'}`
    const payload = await withCache(cacheKey, 30, async () => {
      const issues = await db.issue.findMany({
        where: {
          projectId,
          ...(workItemType ? { workItemType } : {}),
        },
        orderBy: [{ columnOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          key: true,
          title: true,
          description: true,
          workItemType: true,
          status: true,
          priority: true,
          storyPoints: true,
          parentIssueId: true,
          columnOrder: true,
          assignee: { select: { id: true, name: true, avatar: true } },
          iteration: { select: { id: true, name: true } },
        },
      })

      const tree = buildWorkItemHierarchy(issues)

      return {
        projectId,
        total: issues.length,
        tree,
      }
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching backlog:', error)
    return NextResponse.json({ error: 'Failed to fetch backlog' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const data = reorderSchema.parse(body)

    const item = await db.issue.findUnique({
      where: { id: data.itemId },
      select: {
        id: true,
        key: true,
        projectId: true,
        workItemType: true,
        parentIssueId: true,
        status: true,
        stateId: true,
        columnOrder: true,
        reporterId: true,
        iterationId: true,
      },
    })

    if (!item || item.projectId !== data.projectId) {
      return NextResponse.json({ error: 'Backlog item not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      data.projectId,
      'backlog:reorder'
    )
    if (!auth.ok) return auth.response

    const targetStatus = data.targetStatus ?? item.status
    const targetParentId = data.targetParentId ?? null

    const targetState = await resolveStateForStatus(
      data.projectId,
      item.workItemType,
      targetStatus,
      item.stateId
    )

    if (!targetState) {
      return NextResponse.json(
        { error: 'No configured state matches the selected backlog status' },
        { status: 400 }
      )
    }

    if (
      targetStatus !== item.status &&
      item.stateId &&
      targetState.id !== item.stateId &&
      !(await isStateTransitionAllowed(
        data.projectId,
        item.workItemType,
        item.stateId,
        targetState.id
      ))
    ) {
      return NextResponse.json(
        {
          error: 'Invalid workflow transition',
          details: {
            from: { status: item.status, stateId: item.stateId },
            to: { status: targetStatus, stateId: targetState.id },
          },
        },
        { status: 400 }
      )
    }

    if (targetParentId) {
      const referenceError = await validateIssueReferences({
        projectId: data.projectId,
        workItemType: item.workItemType,
        currentIssueId: item.id,
        parentIssueId: targetParentId,
      })

      if (referenceError) {
        return NextResponse.json({ error: referenceError }, { status: 400 })
      }
    }

    if (data.beforeItemId) {
      const beforeItem = await db.issue.findUnique({
        where: { id: data.beforeItemId },
        select: {
          id: true,
          projectId: true,
          status: true,
          parentIssueId: true,
        },
      })

      if (
        !beforeItem ||
        beforeItem.projectId !== data.projectId ||
        beforeItem.status !== targetStatus ||
        (beforeItem.parentIssueId ?? null) !== targetParentId
      ) {
        return NextResponse.json(
          { error: 'Target insertion point must be in the same backlog group' },
          { status: 400 }
        )
      }
    }

    const siblings = await db.issue.findMany({
      where: {
        projectId: data.projectId,
        status: targetStatus,
        parentIssueId: targetParentId,
        id: { not: data.itemId },
      },
      orderBy: { columnOrder: 'asc' },
      select: { id: true, columnOrder: true },
    })

    let newOrder = (siblings[siblings.length - 1]?.columnOrder ?? 0) + 1000

    if (data.beforeItemId) {
      const insertAt = siblings.findIndex((sibling) => sibling.id === data.beforeItemId)
      if (insertAt >= 0) {
        const previous = siblings[insertAt - 1]?.columnOrder ?? 0
        const next = siblings[insertAt]?.columnOrder ?? previous + 2000
        newOrder = (previous + next) / 2
      }
    }

    const updated = await db.issue.update({
      where: { id: data.itemId },
      data: {
        parentIssueId: targetParentId,
        status: targetStatus,
        stateId: targetState.id,
        columnOrder: newOrder,
        completedDate: targetStatus === 'done' || targetState.isFinal ? new Date() : null,
        version: { increment: 1 },
      },
      select: {
        id: true,
        key: true,
        status: true,
        parentIssueId: true,
        columnOrder: true,
      },
    })

    await createAuditLog({
      projectId: data.projectId,
      issueId: data.itemId,
      userId: auth.actor.userId,
      action: 'backlog_item_reordered',
      details: {
        itemKey: item.key,
        from: {
          parentIssueId: item.parentIssueId,
          status: item.status,
          columnOrder: item.columnOrder,
        },
        to: {
          parentIssueId: updated.parentIssueId,
          status: updated.status,
          columnOrder: updated.columnOrder,
        },
      },
    })

    await invalidateSprintCaches(data.projectId, item.iterationId)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }

    console.error('Error reordering backlog:', error)
    return NextResponse.json({ error: 'Failed to reorder backlog item' }, { status: 500 })
  }
}
