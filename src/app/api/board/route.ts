import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { requireProjectPermission } from '@/lib/domain/auth'
import {
  isStateTransitionAllowed,
  resolveStateForStatus,
} from '@/lib/domain/state-machine'
import { withCache } from '@/lib/redis'

const WORKFLOW_COLUMNS = [
  { id: 'backlog', stateName: 'Backlog', name: 'Backlog', color: '#64748b', category: 'New' },
  { id: 'todo', stateName: 'To Do', name: 'To Do', color: '#6b7280', category: 'New' },
  {
    id: 'in_progress',
    stateName: 'In Progress',
    name: 'In Progress',
    color: '#3b82f6',
    category: 'In Progress',
  },
  {
    id: 'in_review',
    stateName: 'In Review',
    name: 'In Review',
    color: '#f59e0b',
    category: 'In Progress',
  },
  { id: 'done', stateName: 'Done', name: 'Done', color: '#10b981', category: 'Done' },
] as const

const moveCardSchema = z.object({
  projectId: z.string(),
  itemId: z.string(),
  toStatus: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']),
  beforeItemId: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const iterationId = searchParams.get('iterationId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const cacheKey = `board:${projectId}:${iterationId ?? 'all'}`
    const payload = await withCache(cacheKey, 30, async () => {
      const [states, issues] = await Promise.all([
        db.state.findMany({
          where: { projectId },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, color: true, category: true },
        }),
        db.issue.findMany({
          where: {
            projectId,
            ...(iterationId ? { iterationId } : {}),
          },
          orderBy: [{ status: 'asc' }, { columnOrder: 'asc' }],
          select: {
            id: true,
            key: true,
            title: true,
            workItemType: true,
            status: true,
            priority: true,
            storyPoints: true,
            columnOrder: true,
            assignee: { select: { id: true, name: true, avatar: true } },
            reporter: { select: { id: true, name: true, avatar: true } },
            iteration: { select: { id: true, name: true } },
            _count: { select: { comments: true, attachments: true } },
          },
        }),
      ])

      const statesByName = new Map(states.map((state) => [state.name, state]))
      const columns = WORKFLOW_COLUMNS.map((column) => {
        const state = statesByName.get(column.stateName)

        return {
          id: column.id,
          name: state?.name ?? column.name,
          color: state?.color ?? column.color,
          category: state?.category ?? column.category,
        }
      })

      const itemsByColumn = columns.map((column) => ({
        ...column,
        items: issues
          .filter((issue) => issue.status === column.id)
          .sort((a, b) => a.columnOrder - b.columnOrder),
      }))

      return {
        projectId,
        iterationId,
        columns: itemsByColumn,
        totalItems: issues.length,
      }
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching board:', error)
    return NextResponse.json({ error: 'Failed to fetch board' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const data = moveCardSchema.parse(body)

    const issue = await db.issue.findUnique({
      where: { id: data.itemId },
      select: {
        id: true,
        key: true,
        projectId: true,
        workItemType: true,
        status: true,
        stateId: true,
        columnOrder: true,
        reporterId: true,
        iterationId: true,
      },
    })

    if (!issue || issue.projectId !== data.projectId) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      data.projectId,
      'board:update'
    )
    if (!auth.ok) return auth.response

    const targetState = await resolveStateForStatus(
      data.projectId,
      issue.workItemType,
      data.toStatus,
      issue.stateId
    )

    if (!targetState) {
      return NextResponse.json(
        { error: 'No configured state matches the selected board column' },
        { status: 400 }
      )
    }

    if (
      issue.stateId &&
      targetState.id !== issue.stateId &&
      !(await isStateTransitionAllowed(
        data.projectId,
        issue.workItemType,
        issue.stateId,
        targetState.id
      ))
    ) {
      return NextResponse.json(
        {
          error: 'Invalid workflow transition',
          details: {
            from: { status: issue.status, stateId: issue.stateId },
            to: { status: data.toStatus, stateId: targetState.id },
          },
        },
        { status: 400 }
      )
    }

    if (data.beforeItemId) {
      const beforeItem = await db.issue.findUnique({
        where: { id: data.beforeItemId },
        select: {
          id: true,
          projectId: true,
          status: true,
        },
      })

      if (
        !beforeItem ||
        beforeItem.projectId !== data.projectId ||
        beforeItem.status !== data.toStatus
      ) {
        return NextResponse.json(
          { error: 'Target insertion point must be in the same board column' },
          { status: 400 }
        )
      }
    }

    const siblings = await db.issue.findMany({
      where: {
        projectId: data.projectId,
        status: data.toStatus,
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

    const updateData: Record<string, unknown> = {
      status: data.toStatus,
      stateId: targetState.id,
      columnOrder: newOrder,
      version: { increment: 1 },
    }

    if (data.toStatus === 'done' || targetState.isFinal) {
      updateData.completedDate = new Date()
    } else if (issue.status === 'done') {
      updateData.completedDate = null
    }

    const updated = await db.issue.update({
      where: { id: data.itemId },
      data: updateData,
      select: {
        id: true,
        key: true,
        status: true,
        columnOrder: true,
        completedDate: true,
        version: true,
      },
    })

    await createAuditLog({
      projectId: data.projectId,
      issueId: issue.id,
      userId: auth.actor.userId,
      action: 'board_card_moved',
      details: {
        itemKey: issue.key,
        from: { status: issue.status, columnOrder: issue.columnOrder },
        to: { status: updated.status, columnOrder: updated.columnOrder },
      },
    })

    await invalidateSprintCaches(data.projectId, issue.iterationId)

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Validation failed' }, { status: 400 })
    }

    console.error('Error moving board card:', error)
    return NextResponse.json({ error: 'Failed to move board card' }, { status: 500 })
  }
}
