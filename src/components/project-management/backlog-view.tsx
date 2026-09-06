'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Inbox,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, getApiErrorMessage } from '@/lib/utils'
import {
  PriorityIndicator,
  StatusBadge,
  TypeIcon,
} from '@/components/project-management/work-item-indicators'

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

export function BacklogView() {
  const openWorkItem = useAppStore((s) => s.openWorkItem)

  function applyReorder(
    nodes: BacklogNode[],
    oldSiblings: BacklogNode[],
    newSiblings: BacklogNode[]
  ): BacklogNode[] {
    if (nodes === oldSiblings) return newSiblings
    return nodes.map((node) => ({
      ...node,
      children: applyReorder(node.children, oldSiblings, newSiblings),
    }))
  }

  const {
    currentProject,
    currentProjectPermissions,
    hierarchyExpandedByProject,
    setHierarchyExpandedIds,
    toggleHierarchyExpanded,
    workItemTypeFilter,
    setCreateIssueOpen,
  } = useAppStore()
  const canReorderBacklog = currentProjectPermissions.includes('backlog:reorder')
  const canCreate = currentProjectPermissions.includes('workitem:create')
  const [tree, setTree] = useState<BacklogNode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const hasPersistedExpansion = currentProject
    ? Object.prototype.hasOwnProperty.call(hierarchyExpandedByProject, currentProject.id)
    : false
  const expandedIds = currentProject ? hierarchyExpandedByProject[currentProject.id] ?? [] : []
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])

  const fetchBacklog = useCallback(async () => {
    if (!currentProject) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({ projectId: currentProject.id })
      if (workItemTypeFilter !== 'all') {
        params.set('workItemType', workItemTypeFilter)
      }

      const res = await fetch(`/api/backlog?${params.toString()}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load backlog'))
      }

      const data = await res.json()
      const nextTree = data.tree || []
      setTree(nextTree)
      if (currentProject && !hasPersistedExpansion && nextTree.length > 0) {
        setHierarchyExpandedIds(
          currentProject.id,
          nextTree.map((node: BacklogNode) => node.id)
        )
      }
    } catch (error) {
      console.error('Failed to load backlog:', error)
      setTree([])
      toast.error(error instanceof Error ? error.message : 'Failed to load backlog')
    } finally {
      setIsLoading(false)
    }
  }, [currentProject, hasPersistedExpansion, setHierarchyExpandedIds, workItemTypeFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchBacklog()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [fetchBacklog])

  const { flatCount, totalPoints } = useMemo(() => {
    const walk = (nodes: BacklogNode[]): { count: number; points: number } =>
      nodes.reduce(
        (acc, node) => {
          const child = walk(node.children)
          return {
            count: acc.count + 1 + child.count,
            points: acc.points + (node.storyPoints ?? 0) + child.points,
          }
        },
        { count: 0, points: 0 }
      )

    const result = walk(tree)
    return { flatCount: result.count, totalPoints: result.points }
  }, [tree])

  const toggleExpanded = (id: string) => {
    if (!currentProject) return
    toggleHierarchyExpanded(currentProject.id, id)
  }

  const reorderNode = async (
    item: BacklogNode,
    siblings: BacklogNode[],
    direction: 'up' | 'down'
  ) => {
    if (!currentProject) return

    if (!canReorderBacklog) {
      toast.error('You do not have permission to reorder backlog items')
      return
    }

    const index = siblings.findIndex((s) => s.id === item.id)
    if (index < 0) return

    let beforeItemId: string | null = null
    if (direction === 'up') {
      if (index === 0) return
      beforeItemId = siblings[index - 1].id
    }
    if (direction === 'down') {
      if (index >= siblings.length - 1) return
      beforeItemId = siblings[index + 2]?.id ?? null
    }

    // Optimistic local swap
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const reordered = [...siblings]
    ;[reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]]
    setTree((prev) => applyReorder(prev, siblings, reordered))

    try {
      const res = await fetch('/api/backlog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          itemId: item.id,
          targetParentId: item.parentIssueId,
          targetStatus: item.status,
          beforeItemId,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || 'Failed to reorder item')
        // Revert on failure
        await fetchBacklog()
      }
    } catch (error) {
      console.error('Failed to reorder backlog item:', error)
      toast.error('Failed to reorder item')
      await fetchBacklog()
    }
  }

  const renderNodes = (nodes: BacklogNode[], depth = 0, siblings = nodes) => {
    return nodes.map((node, index) => {
      const hasChildren = node.children.length > 0
      const isExpanded = expanded.has(node.id)

      return (
        <div key={node.id}>
          <div
            className={cn(
              'group/row relative flex h-9 cursor-pointer items-center gap-2 border-b border-border/60 pr-2',
              'transition-colors hover:bg-surface-hover',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'
            )}
            tabIndex={0}
            role="button"
            onClick={() => openWorkItem(node.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openWorkItem(node.id)
              }
            }}
          >
            {/*
              Depth is drawn as a guide line rather than paid for in padding
              alone, so a three-level tree still reads as a tree once the rows
              have scrolled away from their parent.
            */}
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{ width: `${8 + depth * 18}px` }}
            />
            {depth > 0 ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 w-px bg-border"
                style={{ left: `${8 + (depth - 1) * 18 + 10}px` }}
              />
            ) : null}

            {hasChildren ? (
              <button
                type="button"
                className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                aria-label={isExpanded ? 'Collapse children' : 'Expand children'}
                aria-expanded={isExpanded}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpanded(node.id)
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            ) : (
              <span className="size-5 shrink-0" aria-hidden="true" />
            )}

            <TypeIcon type={node.workItemType} />

            <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-muted-foreground">
              {node.key}
            </span>

            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {node.title}
            </span>

            {/*
              The backlog is a ranking surface, so it shows the same facts the
              list does. It previously showed status and a bare number, leaving
              700px of nothing between the title and the right edge and no way
              to judge priority or ownership while ordering the work.
            */}
            {node.iteration ? (
              <span className="hidden max-w-[8rem] shrink-0 truncate rounded-sm bg-surface-sunken px-1.5 py-px text-[11px] text-muted-foreground xl:inline">
                {node.iteration.name}
              </span>
            ) : null}

            <span className="hidden w-[6rem] shrink-0 items-center lg:flex">
              <PriorityIndicator priority={node.priority} />
            </span>

            <span className="hidden w-[7rem] shrink-0 items-center md:flex">
              <StatusBadge status={node.status} variant="dot" />
            </span>

            <span className="flex w-9 shrink-0 items-center justify-end">
              {node.storyPoints != null ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-[11px] tabular-nums text-foreground">
                      {node.storyPoints}
                      <span className="text-muted-foreground">pt</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{node.storyPoints} story points</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-[11px] text-muted-foreground/40">—</span>
              )}
            </span>

            <span className="flex w-6 shrink-0 items-center">
              {node.assignee ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Avatar className="size-5">
                      <AvatarImage src={node.assignee.avatar || undefined} />
                      <AvatarFallback className="bg-primary-muted text-[9px] font-semibold text-primary">
                        {node.assignee.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>{node.assignee.name}</TooltipContent>
                </Tooltip>
              ) : null}
            </span>

            {/*
              Rank controls sit at the end of the row they move, revealed on
              hover or keyboard focus. Disabled at the ends of a list rather
              than silently doing nothing.
            */}
            {canReorderBacklog ? (
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === 0}
                  aria-label={`Move ${node.key} up`}
                  onClick={(e) => {
                    e.stopPropagation()
                    reorderNode(node, siblings, 'up')
                  }}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={index === siblings.length - 1}
                  aria-label={`Move ${node.key} down`}
                  onClick={(e) => {
                    e.stopPropagation()
                    reorderNode(node, siblings, 'down')
                  }}
                >
                  <ArrowDown />
                </Button>
              </div>
            ) : null}
          </div>

          {hasChildren && isExpanded && renderNodes(node.children, depth + 1, node.children)}
        </div>
      )
    })
  }

  if (!currentProject) {
    return (
      <EmptyState
        size="lg"
        icon={FolderOpen}
        title="No project selected"
        description="The backlog ranks one project's unscheduled work. Choose a project from the switcher in the top bar."
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
        <p className="text-xs text-muted-foreground">
          <span className="tabular-nums text-foreground">{flatCount}</span>{' '}
          {flatCount === 1 ? 'item' : 'items'}
          {totalPoints > 0 ? (
            <>
              {' · '}
              <span className="tabular-nums text-foreground">{totalPoints}</span> points
            </>
          ) : null}
        </p>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="ml-auto"
              onClick={fetchBacklog}
              disabled={isLoading}
              aria-label="Refresh backlog"
            >
              <RefreshCw className={cn(isLoading && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh backlog</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && tree.length === 0 ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="flex h-9 items-center gap-2 px-3">
                <Skeleton className="size-4" />
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="h-2.5 flex-1" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            ))}
          </div>
        ) : tree.length > 0 ? (
          renderNodes(tree)
        ) : (
          <EmptyState
            size="lg"
            icon={Inbox}
            title="The backlog is empty"
            description="Ranked, unscheduled work lives here. Create work items and drag them into priority order before a sprint starts."
            action={
              canCreate ? (
                <Button size="sm" onClick={() => setCreateIssueOpen(true)}>
                  Create a work item
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  )
}
