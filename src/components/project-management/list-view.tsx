'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppStore, type Issue } from '@/store/app-store'
import { compareIssueKeys } from '@/lib/domain/issue-key-format'
import { filterIssues } from '@/lib/domain/issue-filters'
import { IssueLoadMore } from '@/components/project-management/issue-load-more'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/states'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BulkActionToolbar } from '@/components/project-management/bulk-action-toolbar'
import {
  PriorityIndicator,
  StatusBadge,
  TypeIcon,
  priorityRank,
} from '@/components/project-management/work-item-indicators'
import {
  buildWorkItemHierarchy,
  flattenWorkItemHierarchy,
} from '@/lib/domain/work-item-hierarchy'
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ListFilter,
  Shapes,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn, getApiErrorMessage } from '@/lib/utils'
import { hasActiveFilters } from '@/lib/domain/issue-filters'

type SortField =
  | 'key'
  | 'title'
  | 'status'
  | 'priority'
  | 'workItemType'
  | 'assignee'
  | 'createdAt'
type SortOrder = 'asc' | 'desc'

/**
 * A sortable column header.
 *
 * The previous version drew the same neutral up/down glyph on every column
 * including the active one, so the table told you it could be sorted but never
 * which column was sorting it or in which direction. Here the icon is the
 * state: a single arrow pointing the way the data actually runs on the active
 * column, and a dimmed pair everywhere else.
 */
function SortHeader({
  field,
  activeField,
  order,
  onSort,
  align = 'left',
  children,
}: {
  field: SortField
  activeField: SortField
  order: SortOrder
  onSort: (field: SortField) => void
  align?: 'left' | 'right'
  children: ReactNode
}) {
  const active = activeField === field
  const Icon = !active ? ChevronsUpDown : order === 'asc' ? ArrowUp : ArrowDown

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={`Sort by ${String(children)}`}
      className={cn(
        'group/sort -mx-1 inline-flex h-6 max-w-full items-center gap-1 rounded-sm px-1',
        'text-[11px] font-semibold uppercase tracking-[0.055em] transition-colors',
        'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        align === 'right' && 'flex-row-reverse'
      )}
    >
      <span className="truncate">{children}</span>
      <Icon
        className={cn(
          'size-3 shrink-0 transition-opacity',
          active ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-60'
        )}
        aria-hidden="true"
      />
    </button>
  )
}

export function ListView() {
  const openWorkItem = useAppStore((s) => s.openWorkItem)
  const {
    issues,
    isLoading,
    currentProject,
    filters,
    hierarchyExpandedByProject,
    setHierarchyExpandedIds,
    toggleHierarchyExpanded,
    workItemTypeFilter,
    setIssues,
    setFilters,
    setWorkItemTypeFilter,
    setCreateIssueOpen,
    currentProjectPermissions,
  } = useAppStore()
  const [selectedIssues, setSelectedIssues] = useState<string[]>([])
  const [sortField, setSortField] = useState<SortField>('key')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  const hasPersistedExpansion = currentProject
    ? Object.prototype.hasOwnProperty.call(hierarchyExpandedByProject, currentProject.id)
    : false
  const expandedRowIds = currentProject ? hierarchyExpandedByProject[currentProject.id] ?? [] : []
  const expandedRows = useMemo(() => new Set(expandedRowIds), [expandedRowIds])

  // Shared with the board and sprint views. This copy previously ignored
  // `filters.type` and did not search descriptions, so the same filter produced
  // different results depending on which view you were looking at.
  const filteredIssues = useMemo(
    () => filterIssues(issues, filters, { workItemTypeTab: workItemTypeFilter }),
    [filters, issues, workItemTypeFilter]
  )

  const sortedIssues = useMemo(() => {
    return [...filteredIssues].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'key':
          comparison = compareIssueKeys(a.key, b.key)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'priority':
          // Ranked highest-first via the shared scale, so "ascending" means
          // "most urgent first" here and in every other view.
          comparison = priorityRank(b.priority) - priorityRank(a.priority)
          break
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

  const allSelected = selectedIssues.length === visibleRows.length && visibleRows.length > 0
  const someSelected = selectedIssues.length > 0 && !allSelected

  const toggleSelectAll = () => {
    setSelectedIssues(allSelected ? [] : visibleRows.map((row) => row.issue.id))
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

  const filtersActive = hasActiveFilters(filters, { workItemTypeTab: workItemTypeFilter })

  const clearFilters = () => {
    setFilters({
      assigneeId: null,
      priority: null,
      type: null,
      search: '',
      sprintId: null,
      iterationId: null,
      areaId: null,
      labelIds: [],
    })
    setWorkItemTypeFilter('all')
  }

  if (!currentProject) {
    return (
      <EmptyState
        size="lg"
        icon={FolderOpen}
        title="No project selected"
        description="Work items belong to a project. Choose one from the switcher in the top bar to see its items here."
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="work-items-list-view">
      {/*
        Selection count, total and bulk actions share one strip. Previously the
        counts had a row to themselves and the bulk toolbar appeared in a second
        row beneath it, so selecting an item pushed the whole table down by
        40px — the rows moved out from under the cursor mid-selection.
      */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border px-3">
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={toggleSelectAll}
          aria-label={allSelected ? 'Clear selection' : 'Select all work items'}
          data-testid="work-items-select-all"
        />

        {selectedIssues.length > 0 ? (
          <BulkActionToolbar
            selectedIds={selectedIssues}
            onClearSelection={() => setSelectedIssues([])}
            onActionComplete={async () => {
              if (!currentProject) return
              try {
                /*
                  `/api/issues`, not `/api/backlog`.

                  The backlog route answers with `{ projectId, total, tree }` —
                  an object — and this handler pushed it straight into the store
                  as the issue list. Every later `issues.filter(...)` then threw
                  `issues.filter is not a function` and the whole view fell into
                  the error boundary, so completing any bulk action from this
                  list took the list down with it.

                  This endpoint returns the flat array the store expects, and is
                  the same one the workspace loads from.
                */
                const res = await fetch(
                  `/api/issues?projectId=${currentProject.id}&pageSize=200&includeTotal=true`
                )
                if (!res.ok) {
                  throw new Error(await getApiErrorMessage(res, 'Failed to refresh work items'))
                }

                const payload: unknown = await res.json()
                if (!Array.isArray(payload)) {
                  throw new Error('Work items returned malformed data')
                }

                setIssues(payload, {
                  total: Number(res.headers.get('x-total-count')) || payload.length,
                  pageSize: 200,
                })
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : 'Failed to refresh work items'
                )
              }
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            <span className="tabular-nums text-foreground">{visibleRows.length}</span>{' '}
            {visibleRows.length === 1 ? 'item' : 'items'}
            {filtersActive && sortedIssues.length !== issues.length ? (
              <span className="text-muted-foreground">
                {' '}
                of <span className="tabular-nums">{issues.length}</span>
              </span>
            ) : null}
          </p>
        )}

        <div className="ml-auto">
          <IssueLoadMore className="my-0" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading && visibleRows.length === 0 ? (
          <SkeletonTable rows={10} columns={6} />
        ) : visibleRows.length === 0 ? (
          <EmptyState
            size="lg"
            icon={filtersActive ? ListFilter : FolderOpen}
            title={filtersActive ? 'No items match these filters' : 'No work items yet'}
            description={
              filtersActive
                ? 'Every item in this project is filtered out. Widen or clear the filters to see them again.'
                : 'Work items are the unit of delivery here — epics, stories, tasks and bugs all live in this list.'
            }
            action={
              filtersActive ? (
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : currentProjectPermissions.includes('workitem:create') ? (
                <Button size="sm" onClick={() => setCreateIssueOpen(true)}>
                  Create the first work item
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
          {/*
            Below md a nine-column table is not a table any more — it is a
            horizontal scroll bar with some text behind it. The same rows are
            re-laid-out as a stack: identity on the first line, the facts you
            triage on underneath. Not a shrunken table; a different shape for
            the same job.

            Its test ids are `work-item-card-*`, not `work-item-row-*`: both
            layouts are in the DOM at once, and reusing the row ids meant a
            desktop test resolved to the hidden mobile node and timed out
            clicking something with no box.
          */}
          <ul className="divide-y divide-border/60 md:hidden">
            {visibleRows.map(({ issue, depth, hasChildren, isExpanded }) => (
              <li key={issue.id}>
                <div
                  className="flex w-full items-start gap-2 px-3 py-2.5 transition-colors active:bg-surface-hover"
                  style={{ paddingLeft: `${12 + depth * 14}px` }}
                >
                  <Checkbox
                    checked={selectedIssues.includes(issue.id)}
                    onCheckedChange={() => toggleSelect(issue.id)}
                    aria-label={`Select ${issue.key}`}
                    className="mt-0.5 shrink-0"
                    data-testid={`work-item-card-select-${issue.id}`}
                  />

                  <button
                    type="button"
                    onClick={() => openWorkItem(issue.id)}
                    className="min-w-0 flex-1 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    data-testid={`work-item-card-${issue.id}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <TypeIcon type={issue.workItemType} />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {issue.key}
                      </span>
                      <span className="ml-auto shrink-0">
                        <PriorityIndicator priority={issue.priority} showLabel={false} />
                      </span>
                    </div>

                    <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">
                      {issue.title}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StatusBadge status={issue.status} variant="dot" />
                      <span className="text-[11px] text-muted-foreground">
                        {issue.assignee?.name ?? 'Unassigned'}
                      </span>
                      {issue.storyPoints != null ? (
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {issue.storyPoints}pt
                        </span>
                      ) : null}
                    </div>
                  </button>

                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(issue.id)}
                      aria-label={isExpanded ? 'Collapse child items' : 'Expand child items'}
                      aria-expanded={isExpanded}
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {/*
            table-fixed with an explicit width on every column except the
            title. Under auto layout a `w-full` title column claimed all the
            space and squeezed the rest below their content — the key wrapped
            onto two lines and four headers truncated to "K..", "T...",
            "PRIOR...". Fixed layout gives the named columns exactly what they
            asked for and hands the remainder to the title.

            The min-width keeps the columns legible on a phone and lets the
            container scroll sideways rather than crushing every cell.
          */}
          <Table
            density="compact"
            className="table-fixed min-w-[54rem]"
            containerClassName="hidden h-full md:block"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8" aria-label="Select" />
                <TableHead className="w-[5.5rem]">
                  <SortHeader field="key" activeField={sortField} order={sortOrder} onSort={toggleSort}>
                    Key
                  </SortHeader>
                </TableHead>
                {/* An icon column too narrow for its own heading. The label
                    lives in the button's accessible name, and each icon names
                    itself on hover, so nothing is lost by leaving the header
                    visually empty rather than truncating "Type" to "T...". */}
                <TableHead className="w-9 px-0">
                  <button
                    type="button"
                    onClick={() => toggleSort('workItemType')}
                    aria-label="Sort by type"
                    className={cn(
                      'flex size-6 items-center justify-center rounded-sm transition-colors',
                      'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                      sortField === 'workItemType'
                        ? 'text-foreground'
                        : 'text-muted-foreground/60 hover:text-foreground'
                    )}
                  >
                    <Shapes className="size-3.5" aria-hidden="true" />
                  </button>
                </TableHead>
                {/*
                  The one elastic column. Everything after it is sized to its
                  content, which is what closes the 500px void the old layout
                  opened between the title and the status column.
                */}
                <TableHead>
                  <SortHeader field="title" activeField={sortField} order={sortOrder} onSort={toggleSort}>
                    Title
                  </SortHeader>
                </TableHead>
                <TableHead className="hidden w-[9rem] xl:table-cell">Labels</TableHead>
                <TableHead className="w-[7.5rem]">
                  <SortHeader field="status" activeField={sortField} order={sortOrder} onSort={toggleSort}>
                    Status
                  </SortHeader>
                </TableHead>
                <TableHead className="w-[6.5rem]">
                  <SortHeader
                    field="priority"
                    activeField={sortField}
                    order={sortOrder}
                    onSort={toggleSort}
                  >
                    Priority
                  </SortHeader>
                </TableHead>
                <TableHead className="hidden w-[9.5rem] lg:table-cell">
                  <SortHeader
                    field="assignee"
                    activeField={sortField}
                    order={sortOrder}
                    onSort={toggleSort}
                  >
                    Assignee
                  </SortHeader>
                </TableHead>
                <TableHead className="hidden w-14 xl:table-cell" align="right">
                  Pts
                </TableHead>
                <TableHead className="hidden w-[6.5rem] xl:table-cell" align="right">
                  <SortHeader
                    field="createdAt"
                    activeField={sortField}
                    order={sortOrder}
                    onSort={toggleSort}
                    align="right"
                  >
                    Created
                  </SortHeader>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(({ issue, depth, hasChildren, isExpanded }) => {
                const selected = selectedIssues.includes(issue.id)

                return (
                  <TableRow
                    key={issue.id}
                    selected={selected}
                    className="cursor-pointer"
                    onClick={() => openWorkItem(issue.id)}
                    data-testid={`work-item-row-${issue.id}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelect(issue.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${issue.key}`}
                        data-testid={`work-item-select-${issue.id}`}
                      />
                    </TableCell>

                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {issue.key}
                    </TableCell>

                    <TableCell>
                      <TypeIcon type={issue.workItemType} />
                    </TableCell>

                    <TableCell>
                      <div
                        className="flex items-center gap-1"
                        style={{ paddingLeft: `${depth * 18}px` }}
                      >
                        {/* Only rendered where it does something. An inert
                            disclosure control on every leaf row reads as a
                            broken button. */}
                        {hasChildren ? (
                          <button
                            type="button"
                            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleExpanded(issue.id)
                            }}
                            aria-label={isExpanded ? 'Collapse child items' : 'Expand child items'}
                            aria-expanded={isExpanded}
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
                        <span className="truncate font-medium text-foreground">{issue.title}</span>
                      </div>
                    </TableCell>

                    <TableCell className="hidden xl:table-cell">
                      {issue.labels && issue.labels.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {issue.labels.slice(0, 2).map(({ label }) => (
                            <span
                              key={label.id}
                              className="inline-flex max-w-[4.5rem] items-center gap-1 truncate rounded-sm border border-border px-1 py-px text-[11px] text-muted-foreground"
                            >
                              <span
                                aria-hidden="true"
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: label.color }}
                              />
                              <span className="truncate">{label.name}</span>
                            </span>
                          ))}
                          {issue.labels.length > 2 ? (
                            <span className="text-[11px] text-muted-foreground">
                              +{issue.labels.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {/* Dot rather than a filled chip: forty tinted pills down
                          one column is confetti, and the eye stops reading any
                          of them. */}
                      <StatusBadge status={issue.status} variant="dot" />
                    </TableCell>

                    <TableCell>
                      <PriorityIndicator priority={issue.priority} />
                    </TableCell>

                    <TableCell className="hidden lg:table-cell">
                      {issue.assignee ? (
                        <div className="flex min-w-0 items-center gap-1.5">
                          <Avatar className="size-5 shrink-0">
                            <AvatarImage src={issue.assignee.avatar || undefined} />
                            <AvatarFallback className="bg-primary-muted text-[9px] font-semibold text-primary">
                              {issue.assignee.name
                                .split(' ')
                                .map((segment) => segment[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-[12px] text-muted-foreground">
                            {issue.assignee.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted-foreground/50">Unassigned</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden xl:table-cell" align="right">
                      {issue.storyPoints != null ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[12px] font-medium text-foreground">
                              {issue.storyPoints}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Story points</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">—</span>
                      )}
                    </TableCell>

                    <TableCell
                      className="hidden text-[11px] text-muted-foreground xl:table-cell"
                      align="right"
                    >
                      {issue.createdAt ? format(new Date(issue.createdAt), 'd MMM yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          </>
        )}
      </div>
    </div>
  )
}
