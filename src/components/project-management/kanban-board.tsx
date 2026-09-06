'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { filterIssues, hasActiveFilters } from '@/lib/domain/issue-filters'
import { IssueLoadMore } from '@/components/project-management/issue-load-more'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronLeft, ChevronRight, FolderOpen, ListFilter, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, Issue } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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
  points,
  dotColor,
  id,
  name,
}: {
  canCreateItem: boolean
  children: ReactNode
  count: number
  points: number
  dotColor: string
  id: string
  name: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id })

  return (
    <section
      ref={setNodeRef}
      aria-label={`${name}, ${count} items`}
      className={cn(
        'flex h-full w-[17.5rem] shrink-0 flex-col rounded-lg border bg-surface-sunken transition-colors duration-150',
        isOver ? 'border-primary bg-primary-muted' : 'border-border'
      )}
    >
      {/* Sticky so the column you are dropping into names itself even when the
          list under it has been scrolled a long way down. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border-b border-border bg-surface-sunken px-2.5 py-2">
        <span className={cn('size-1.5 shrink-0 rounded-full', dotColor)} aria-hidden="true" />
        <h3 className="type-heading min-w-0 flex-1 truncate text-foreground">{name}</h3>

        <span className="shrink-0 rounded-full bg-card px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>

        {/* Committed effort per column is the number a standup actually asks
            for, and the board already has every value it needs to total it. */}
        {points > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                {points}pt
              </span>
            </TooltipTrigger>
            <TooltipContent>{points} story points in this column</TooltipContent>
          </Tooltip>
        ) : null}

        {canCreateItem ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                // Revealed on hover or keyboard focus, so five identical "+"
                // buttons do not compete with the column names at rest.
                className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/board:opacity-100"
                onClick={() => useAppStore.getState().setCreateIssueOpen(true)}
                aria-label={`Add item to ${name}`}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add item to {name}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">{children}</div>
    </section>
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
    setCreateIssueOpen,
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
  const [hasPreviousColumns, setHasPreviousColumns] = useState(false)

  const updateOverflowState = useCallback(() => {
    const element = boardScrollRef.current
    if (!element) return

    const remaining = element.scrollWidth - element.clientWidth - element.scrollLeft
    setHasHiddenColumns(remaining > 8)
    setHasPreviousColumns(element.scrollLeft > 8)
  }, [])

  /** Pages by roughly one column, so a click lands on a column boundary. */
  const scrollBoard = useCallback((direction: -1 | 1) => {
    const element = boardScrollRef.current
    if (!element) return
    element.scrollBy({ left: direction * 292, behavior: 'smooth' })
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
      COLUMNS.map((column) => {
        const columnIssues = filteredIssues
          .filter((issue) => issue.status === column.id)
          .sort((left, right) => left.columnOrder - right.columnOrder)

        return {
          ...column,
          issues: columnIssues,
          points: columnIssues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
        }
      }),
    [filteredIssues]
  )

  const filtersActive = hasActiveFilters(filters, { workItemTypeTab: workItemTypeFilter })
  const totalVisible = filteredIssues.length

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
      <EmptyState
        size="lg"
        icon={FolderOpen}
        title="No project selected"
        description="The board shows one project's work in flight. Choose a project from the switcher in the top bar."
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="group/board flex h-full min-h-0 flex-col">
        <IssueLoadMore className="mx-4 mt-3 shrink-0" />

        {!isLoading && totalVisible === 0 && filtersActive ? (
          <EmptyState
            size="lg"
            icon={ListFilter}
            title="No items match these filters"
            description="Every item on this board is filtered out. Widen or clear the filters to bring the columns back."
          />
        ) : (
          <div
            className="scroll-affordance-shell relative min-h-0 flex-1"
            data-overflowing={hasHiddenColumns}
          >
            {/*
              A gradient alone could not carry this: the fade resolves to the
              page background, and at the right edge what sits under it is a
              white column card, so on a light theme the hint was invisible and
              the Done column simply looked cut off. A real control says there
              is more and moves you there — and it only exists when it has
              somewhere to go.
            */}
            {hasPreviousColumns ? (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Scroll to previous columns"
                onClick={() => scrollBoard(-1)}
                className="absolute left-1.5 top-1/2 z-20 -translate-y-1/2 rounded-full shadow-md"
              >
                <ChevronLeft />
              </Button>
            ) : null}

            {hasHiddenColumns ? (
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Scroll to further columns"
                onClick={() => scrollBoard(1)}
                className="absolute right-1.5 top-1/2 z-20 -translate-y-1/2 rounded-full shadow-md"
              >
                <ChevronRight />
              </Button>
            ) : null}

            <div
              ref={boardScrollRef}
              onScroll={updateOverflowState}
              className="scroll-affordance-x flex h-full gap-3 overflow-x-auto px-4 py-3"
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
                  points={column.points}
                >
                  <>
                    {isLoading && column.issues.length === 0 ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-[5.5rem] w-full" />
                        <Skeleton className="h-[5.5rem] w-full" />
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

                    {/*
                      An empty column is a drop target, so it says so rather
                      than repeating a generic "No items" under a grey icon.
                    */}
                    {!isLoading && column.issues.length === 0 ? (
                      <div className="flex min-h-[5rem] items-center justify-center rounded-md border border-dashed border-border px-2 py-6 text-center">
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          Drop work here
                          {canCreateWorkItems ? (
                            <>
                              {' or '}
                              <button
                                type="button"
                                onClick={() => setCreateIssueOpen(true)}
                                className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                              >
                                add an item
                              </button>
                            </>
                          ) : null}
                        </p>
                      </div>
                    ) : null}
                  </>
                </BoardColumn>
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeIssue ? <IssueCard issue={activeIssue} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}
