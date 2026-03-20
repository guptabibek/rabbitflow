'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, type Issue } from '@/store/app-store'
import { canonicalWorkItemRoute } from '@/lib/domain/work-item-view'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  buildWorkItemHierarchy,
  flattenWorkItemHierarchy,
} from '@/lib/domain/work-item-hierarchy'
import {
  ArrowUpDown,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Flag,
  Inbox,
  Layers,
  PackageCheck,
  Rocket,
  Star,
} from 'lucide-react'
import { format } from 'date-fns'

const typeIcons: Record<string, React.ElementType> = {
  task: CheckCircle2,
  bug: Bug,
  story: Star,
  epic: Layers,
  feature: Flag,
  issue: CircleDot,
  design_doc: Rocket,
  release_item: PackageCheck,
}

const typeColors: Record<string, string> = {
  task: 'text-emerald-500',
  bug: 'text-red-500',
  story: 'text-violet-500',
  epic: 'text-indigo-500',
  feature: 'text-cyan-500',
  issue: 'text-orange-500',
  design_doc: 'text-teal-500',
  release_item: 'text-orange-500',
}

const statusStyles: Record<string, string> = {
  backlog: 'bg-slate-500/10 text-slate-400',
  todo: 'bg-slate-500/10 text-slate-500',
  in_progress: 'bg-blue-500/10 text-blue-500',
  in_review: 'bg-amber-500/10 text-amber-500',
  done: 'bg-emerald-500/10 text-emerald-500',
  cancelled: 'bg-red-500/10 text-red-500',
}

const priorityConfig: Record<string, { label: string; color: string }> = {
  lowest: { label: 'Lowest', color: 'text-slate-400' },
  low: { label: 'Low', color: 'text-slate-500' },
  medium: { label: 'Medium', color: 'text-amber-500' },
  high: { label: 'High', color: 'text-orange-500' },
  highest: { label: 'Highest', color: 'text-red-500' },
}

type SortField =
  | 'key'
  | 'title'
  | 'status'
  | 'priority'
  | 'workItemType'
  | 'assignee'
  | 'createdAt'
type SortOrder = 'asc' | 'desc'

type VisibleRow = {
  issue: Issue
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}

function SortHeaderButton({
  field,
  activeField,
  onSort,
  children,
}: {
  field: SortField
  activeField: SortField
  onSort: (field: SortField) => void
  children: ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 -ml-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      onClick={() => onSort(field)}
    >
      {children}
      <ArrowUpDown
        className={`ml-1 h-3 w-3 ${activeField === field ? 'text-foreground' : 'opacity-40'}`}
      />
    </Button>
  )
}

export function ListView() {
  const router = useRouter()
  const {
    issues,
    currentProject,
    filters,
    hierarchyExpandedByProject,
    setHierarchyExpandedIds,
    toggleHierarchyExpanded,
    workItemTypeFilter,
  } = useAppStore()
  const [selectedIssues, setSelectedIssues] = useState<string[]>([])
  const [sortField, setSortField] = useState<SortField>('key')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const hasPersistedExpansion =
    currentProject ? Object.prototype.hasOwnProperty.call(hierarchyExpandedByProject, currentProject.id) : false
  const expandedRowIds = currentProject ? hierarchyExpandedByProject[currentProject.id] ?? [] : []
  const expandedRows = useMemo(() => new Set(expandedRowIds), [expandedRowIds])

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (filters.assigneeId && issue.assignee?.id !== filters.assigneeId) return false
      if (filters.priority && issue.priority !== filters.priority) return false
      if (workItemTypeFilter !== 'all' && issue.workItemType !== workItemTypeFilter) return false
      if (
        filters.labelIds.length > 0 &&
        !filters.labelIds.every((labelId) =>
          issue.labels.some(({ label }) => label.id === labelId)
        )
      ) {
        return false
      }
      if (filters.search) {
        const search = filters.search.toLowerCase()
        if (
          !issue.title.toLowerCase().includes(search) &&
          !issue.key.toLowerCase().includes(search)
        ) {
          return false
        }
      }
      if (filters.iterationId && issue.iteration?.id !== filters.iterationId) return false
      if (filters.areaId && issue.area?.id !== filters.areaId) return false
      return true
    })
  }, [filters, issues, workItemTypeFilter])

  const sortedIssues = useMemo(() => {
    return [...filteredIssues].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'key':
          comparison = a.key.localeCompare(b.key)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'priority': {
          const priorityOrder: Record<string, number> = {
            highest: 0,
            high: 1,
            medium: 2,
            low: 3,
            lowest: 4,
          }
          comparison = priorityOrder[a.priority] - priorityOrder[b.priority]
          break
        }
        case 'workItemType':
          comparison = a.workItemType.localeCompare(b.workItemType)
          break
        case 'assignee':
          comparison = (a.assignee?.name || '').localeCompare(b.assignee?.name || '')
          break
        case 'createdAt':
          comparison =
            new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
          break
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [filteredIssues, sortField, sortOrder])

  const visibleRows = useMemo(() => {
    return flattenWorkItemHierarchy(
      buildWorkItemHierarchy(
        sortedIssues.map((issue) => ({
          ...issue,
          parentIssueId: issue.parentIssueId ?? issue.parentIssue?.id ?? null,
        }))
      ),
      expandedRows
    ).map(({ item, depth, hasChildren, isExpanded }) => ({
      issue: item,
      depth,
      hasChildren,
      isExpanded,
    }))
  }, [expandedRows, sortedIssues])

  useEffect(() => {
    if (!currentProject || hasPersistedExpansion) {
      return
    }

    const rootIds = buildWorkItemHierarchy(
      sortedIssues.map((issue) => ({
        ...issue,
        parentIssueId: issue.parentIssueId ?? issue.parentIssue?.id ?? null,
      }))
    ).map((issue) => issue.id)

    if (rootIds.length > 0) {
      setHierarchyExpandedIds(currentProject.id, rootIds)
    }
  }, [currentProject, hasPersistedExpansion, setHierarchyExpandedIds, sortedIssues])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortField(field)
    setSortOrder('asc')
  }

  const toggleSelectAll = () => {
    setSelectedIssues(
      selectedIssues.length === visibleRows.length ? [] : visibleRows.map((row) => row.issue.id)
    )
  }

  const toggleSelect = (id: string) => {
    setSelectedIssues(
      selectedIssues.includes(id)
        ? selectedIssues.filter((issueId) => issueId !== id)
        : [...selectedIssues, id]
    )
  }

  const toggleExpanded = (id: string) => {
    if (!currentProject) return
    toggleHierarchyExpanded(currentProject.id, id)
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No project selected</h3>
        <p className="text-sm text-muted-foreground">Select a project from the dashboard</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 flex-shrink-0">
        <Checkbox
          checked={selectedIssues.length === visibleRows.length && visibleRows.length > 0}
          onCheckedChange={toggleSelectAll}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {visibleRows.length} visible
        </span>
        <Badge variant="secondary" className="text-[10px] h-5">
          {sortedIssues.length} total in tree
        </Badge>
        {selectedIssues.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5">
            {selectedIssues.length} selected
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead className="w-8" />
              <TableHead className="w-20">
                <SortHeaderButton field="key" activeField={sortField} onSort={toggleSort}>
                  Key
                </SortHeaderButton>
              </TableHead>
              <TableHead className="w-10">
                <SortHeaderButton
                  field="workItemType"
                  activeField={sortField}
                  onSort={toggleSort}
                >
                  Type
                </SortHeaderButton>
              </TableHead>
              <TableHead className="min-w-[320px]">
                <SortHeaderButton field="title" activeField={sortField} onSort={toggleSort}>
                  Title
                </SortHeaderButton>
              </TableHead>
              <TableHead className="w-28">
                <SortHeaderButton field="status" activeField={sortField} onSort={toggleSort}>
                  Status
                </SortHeaderButton>
              </TableHead>
              <TableHead className="w-24">
                <SortHeaderButton field="priority" activeField={sortField} onSort={toggleSort}>
                  Priority
                </SortHeaderButton>
              </TableHead>
              <TableHead className="w-36">
                <SortHeaderButton field="assignee" activeField={sortField} onSort={toggleSort}>
                  Assignee
                </SortHeaderButton>
              </TableHead>
              <TableHead className="w-28">
                <SortHeaderButton field="createdAt" activeField={sortField} onSort={toggleSort}>
                  Created
                </SortHeaderButton>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map(({ issue, depth, hasChildren, isExpanded }) => {
              const TypeIcon = typeIcons[issue.workItemType] || CheckCircle2
              const priority = priorityConfig[issue.priority]

              return (
                <TableRow
                  key={issue.id}
                  className="cursor-pointer hover:bg-accent/40 transition-colors border-b border-border/50"
                  onClick={() => router.push(canonicalWorkItemRoute(issue.id))}
                >
                  <TableCell className="py-2">
                    <Checkbox
                      checked={selectedIssues.includes(issue.id)}
                      onCheckedChange={() => toggleSelect(issue.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground py-2">
                    {issue.key}
                  </TableCell>
                  <TableCell className="py-2">
                    <TypeIcon
                      className={`h-4 w-4 ${typeColors[issue.workItemType] || 'text-muted-foreground'}`}
                    />
                  </TableCell>
                  <TableCell className="py-2">
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingLeft: `${depth * 20}px` }}
                    >
                      <button
                        type="button"
                        className="h-5 w-5 flex items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation()
                          if (hasChildren) {
                            toggleExpanded(issue.id)
                          }
                        }}
                        aria-label={hasChildren ? 'Toggle child work items' : 'No child work items'}
                        aria-expanded={hasChildren ? isExpanded : undefined}
                      >
                        {hasChildren ? (
                          isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <span className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">
                          {issue.title}
                        </span>
                        {depth > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            Child of {issue.parentIssue?.key}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize border-0 font-medium ${statusStyles[issue.status] || ''}`}
                    >
                      {issue.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className={`text-xs font-medium ${priority?.color || ''}`}>
                      {priority?.label || issue.priority}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    {issue.assignee ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={issue.assignee.avatar || undefined} />
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-medium">
                            {issue.assignee.name
                              .split(' ')
                              .map((segment) => segment[0])
                              .join('')
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground truncate">
                          {issue.assignee.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground tabular-nums py-2">
                    {issue.createdAt ? format(new Date(issue.createdAt), 'MMM d, yyyy') : '-'}
                  </TableCell>
                </TableRow>
              )
            })}
            {visibleRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <Inbox className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No work items found</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
