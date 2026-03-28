'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Layers,
  Flag,
  Star,
  CheckCircle2,
  Bug,
  CircleDot,
  Inbox,
  Rocket,
  PackageCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'
import { getTypeText, getStatusClasses, getPriorityText } from '@/lib/ui-tokens'

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

const typeIconMap: Record<string, React.ElementType> = {
  epic: Layers,
  feature: Flag,
  story: Star,
  task: CheckCircle2,
  bug: Bug,
  issue: CircleDot,
  design_doc: Rocket,
  release_item: PackageCheck,
}

const typeColorMap = (t: string) => getTypeText(t)
const statusBgMap = (s: string) => getStatusClasses(s)
const priorityMap = (p: string) => getPriorityText(p)

export function BacklogView() {
  const openWorkItem = useAppStore((s) => s.openWorkItem)

  function applyReorder(nodes: BacklogNode[], oldSiblings: BacklogNode[], newSiblings: BacklogNode[]): BacklogNode[] {
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
  } = useAppStore()
  const canReorderBacklog = currentProjectPermissions.includes('backlog:reorder')
  const [tree, setTree] = useState<BacklogNode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const hasPersistedExpansion =
    currentProject ? Object.prototype.hasOwnProperty.call(hierarchyExpandedByProject, currentProject.id) : false
  const expandedIds = currentProject ? hierarchyExpandedByProject[currentProject.id] ?? [] : []
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])

  const fetchBacklog = async () => {
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
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchBacklog() }, 0)
    return () => { window.clearTimeout(timer) }
  }, [currentProject, hasPersistedExpansion, setHierarchyExpandedIds, workItemTypeFilter])

  const flatCount = useMemo(() => {
    const countNodes = (nodes: BacklogNode[]): number =>
      nodes.reduce((acc, node) => acc + 1 + countNodes(node.children), 0)
    return countNodes(tree)
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
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0
      const isExpanded = expanded.has(node.id)
      const TypeIcon = typeIconMap[node.workItemType] || CircleDot

      return (
        <div key={node.id}>
          <div
            className="group flex items-center gap-2 px-3 py-2 hover:bg-accent/50 transition-colors rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
            role="button"
            style={{ paddingLeft: `${12 + depth * 24}px` }}
            onClick={() => {
              openWorkItem(node.id)
            }}
          >
            {/* Expand toggle */}
            <button
              type="button"
              className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={hasChildren ? (isExpanded ? 'Collapse children' : 'Expand children') : undefined}
              aria-expanded={hasChildren ? isExpanded : undefined}
              onClick={(e) => {
                e.stopPropagation()
                if (hasChildren) toggleExpanded(node.id)
              }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Type icon */}
            <TypeIcon className={`h-4 w-4 flex-shrink-0 ${typeColorMap(node.workItemType)}`} />

            {/* Key */}
            <span className="font-mono text-xs text-muted-foreground flex-shrink-0 w-16">{node.key}</span>

            {/* Title */}
            <span className="flex-1 truncate text-sm font-medium text-foreground">{node.title}</span>

            {/* Status */}
            <Badge variant="outline" className={`text-[10px] capitalize border-0 font-medium flex-shrink-0 ${statusBgMap(node.status)}`}>
              {node.status.replace('_', ' ')}
            </Badge>

            {/* Story Points */}
            {node.storyPoints !== null && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0">
                {node.storyPoints}
              </span>
            )}

            {/* Assignee */}
            {node.assignee ? (
              <Avatar className="h-5 w-5 flex-shrink-0">
                <AvatarImage src={node.assignee.avatar || undefined} />
                <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
                  {node.assignee.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="h-5 w-5 flex-shrink-0" />
            )}

            {/* Reorder */}
            {canReorderBacklog ? (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Move up"
                  onClick={(e) => { e.stopPropagation(); reorderNode(node, siblings, 'up') }}
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label="Move down"
                  onClick={(e) => { e.stopPropagation(); reorderNode(node, siblings, 'down') }}
                >
                  <ArrowDown className="h-3 w-3" />
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
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No project selected</h3>
        <p className="text-sm text-muted-foreground">Select a project from the sidebar to view the backlog</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-base font-semibold text-foreground">Backlog</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {flatCount} work item{flatCount !== 1 ? 's' : ''} in hierarchy
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-sm" onClick={fetchBacklog} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading && tree.length === 0 ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : tree.length > 0 ? (
            renderNodes(tree)
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-medium text-foreground mb-1">No backlog items</h3>
              <p className="text-xs text-muted-foreground">Create issues to populate the backlog</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
