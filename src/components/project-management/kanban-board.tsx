'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { filterIssues } from '@/lib/domain/issue-filters'
import { IssueLoadMore } from '@/components/project-management/issue-load-more'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Inbox, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, Issue } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { IssueCard } from './issue-card'

const COLUMNS = [
  { id: 'backlog', name: 'Backlog', dotColor: 'bg-status-backlog-bar' },
  { id: 'todo', name: 'To Do', dotColor: 'bg-status-todo-bar' },
  { id: 'in_progress', name: 'In Progress', dotColor: 'bg-status-in-progress-bar' },
  { id: 'in_review', name: 'In Review', dotColor: 'bg-status-in-review-bar' },
  { id: 'done', name: 'Done', dotColor: 'bg-status-done-bar' },
] as const

function BoardColumn({
  canCreateItem,
  children,
  count,
  dotColor,
  id,
  name,
}: {
  canCreateItem: boolean
  children: ReactNode
  count: number
  dotColor: string
  id: string
  name: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={name}
      className={`flex w-64 min-w-[240px] max-w-xs flex-shrink-0 flex-col rounded-lg border border-border/50 bg-surface/50 ${
        isOver ? 'ring-2 ring-primary/20' : ''
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (canCreateItem) {
              useAppStore.getState().setCreateIssueOpen(true)
            }
          }}
          disabled={!canCreateItem}
          aria-label="Add item"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
    </div>
  )
}

export function KanbanBoard() {
  const {
    currentProject,
    currentProjectPermissions,
    filters,
    isLoading,
    issues,
    updateIssue,
    workItemTypeFilter,
  } = useAppStore()
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null)
  const canCreateWorkItems = currentProjectPermissions.includes('workitem:create')
  const canUpdateBoard = currentProjectPermissions.includes('board:update')

  // Columns beyond the viewport were previously unreachable-looking: the board
  // scrolled, but overlay scrollbars meant nothing indicated that Done and
  // Cancelled existed off-screen. Track whether content remains to the right so
  // the edge fade can say so.
  const boardScrollRef = useRef<HTMLDivElement | null>(null)
  const [hasHiddenColumns, setHasHiddenColumns] = useState(false)

  const updateOverflowState = useCallback(() => {
    const element = boardScrollRef.current
    if (!element) return

    const remaining = element.scrollWidth - element.clientWidth - element.scrollLeft
    setHasHiddenColumns(remaining > 8)
  }, [])

  useEffect(() => {
    updateOverflowState()

    const element = boardScrollRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(updateOverflowState)
    observer.observe(element)
    return () => observer.disconnect()
  }, [updateOverflowState, issues.length])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const filteredIssues = useMemo(
    () => filterIssues(issues, filters, { workItemTypeTab: workItemTypeFilter }),
    [filters, issues, workItemTypeFilter]
  )

  const issuesByStatus = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        issues: filteredIssues
          .filter((issue) => issue.status === column.id)
          .sort((left, right) => left.columnOrder - right.columnOrder),
      })),
    [filteredIssues]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const issue = issues.find((candidate) => candidate.id === event.active.id)
    if (issue) setActiveIssue(issue)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    const draggedIssue = issues.find((candidate) => candidate.id === active.id)
    setActiveIssue(null)

    if (!currentProject || !draggedIssue || !over) {
      return
    }

    if (!canUpdateBoard) {
      toast.error('You do not have permission to update the board')
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId === overId) {
      return
    }

    const overColumn = COLUMNS.find((column) => column.id === overId)
    const overIssue = issues.find((candidate) => candidate.id === overId)
    const targetStatus = (overColumn?.id ?? overIssue?.status) as Issue['status'] | undefined

    if (!targetStatus) {
      return
    }

    const beforeItemId = overIssue ? overIssue.id : null
    if (draggedIssue.status === targetStatus && beforeItemId === null) {
      return
    }

    try {
      const response = await fetch('/api/board', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          itemId: draggedIssue.id,
          toStatus: targetStatus,
          beforeItemId,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to move work item')
        return
      }

      const updated = await response.json()
      updateIssue(draggedIssue.id, updated)
    } catch (error) {
      console.error('Failed to move board card:', error)
      toast.error('Failed to move work item')
    }
  }

  if (!currentProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <Inbox className="mb-4 h-12 w-12 text-muted-foreground/30" />
        <h3 className="mb-1 text-lg font-semibold text-foreground">No project selected</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Select a project from the sidebar to view the board
        </p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col">
      <IssueLoadMore className="mx-4 mt-3 flex-shrink-0" />
      <div className="scroll-affordance-shell min-h-0 flex-1" data-overflowing={hasHiddenColumns}>
      <div
        ref={boardScrollRef}
        onScroll={updateOverflowState}
        className="scroll-affordance-x flex h-full gap-4 overflow-x-auto p-4"
        role="region"
        aria-label="Kanban board"
        tabIndex={0}
      >
        {issuesByStatus.map((column) => (
          <BoardColumn
            key={column.id}
            canCreateItem={canCreateWorkItems}
            id={column.id}
            name={column.name}
            dotColor={column.dotColor}
            count={column.issues.length}
          >
            <>
              {isLoading && column.issues.length === 0 ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              ) : (
                <SortableContext
                  items={column.issues.map((issue) => issue.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {column.issues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))}
                </SortableContext>
              )}

              {!isLoading && column.issues.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Inbox className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                  <p className="text-xs text-muted-foreground">No items</p>
                </div>
              ) : null}
            </>
          </BoardColumn>
        ))}
      </div>
      </div>
      </div>
      <DragOverlay>
        {activeIssue ? (
          <div className="shadow-2xl">
            <IssueCard issue={activeIssue} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
