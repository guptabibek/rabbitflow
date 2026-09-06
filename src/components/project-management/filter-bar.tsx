'use client'

import { useMemo } from 'react'
import { useAppStore, WorkItemType } from '@/store/app-store'
import { SavedViews } from '@/components/project-management/saved-views'
import { hasActiveFilters } from '@/lib/domain/issue-filters'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToolbarDivider } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  TypeIcon,
  getPriorityLabel,
} from '@/components/project-management/work-item-indicators'
import { Flag, LayoutGrid, List, Plus, Search, SlidersHorizontal, Tag, X } from 'lucide-react'

const ALL_VALUE = '__all__'

interface FilterBarProps {
  onViewModeChange?: (mode: 'board' | 'list') => void
  showViewModeToggle?: boolean
}

/**
 * A removable summary of one applied filter.
 *
 * The old bar communicated state only through the selects themselves, so a
 * narrow window that wrapped or hid a control hid the filter with it: items
 * were missing from the board with nothing on screen explaining why. The chips
 * always show what is applied and each one removes itself.
 */
function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string
  value: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-surface-sunken pl-2 pr-1 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[9rem] truncate font-medium text-foreground">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

export function FilterBar({
  onViewModeChange,
  showViewModeToggle = true,
}: FilterBarProps) {
  const {
    filters,
    setFilters,
    users,
    labels,
    currentProject,
    currentProjectPermissions,
    iterations,
    viewMode,
    setViewMode,
    setCreateIssueOpen,
    setSprintModalOpen,
    workItemTypeFilter,
    setWorkItemTypeFilter,
    workItemTypes,
  } = useAppStore()

  const canManageSprints = currentProjectPermissions.includes('sprint:manage')
  const canCreateWorkItems = currentProjectPermissions.includes('workitem:create')

  const typeOptions = useMemo(() => {
    if (workItemTypes.length > 0) {
      return [
        { key: 'all', name: 'All types' },
        ...workItemTypes.map((type) => ({ key: type.key, name: type.name })),
      ]
    }

    return [
      { key: 'all', name: 'All types' },
      { key: 'epic', name: 'Epic' },
      { key: 'feature', name: 'Feature' },
      { key: 'design_doc', name: 'Design doc' },
      { key: 'story', name: 'User story' },
      { key: 'dev_task', name: 'Dev task' },
      { key: 'qc_task', name: 'QC task' },
      { key: 'task', name: 'Task' },
      { key: 'bug', name: 'Bug' },
      { key: 'prod_bug', name: 'Prod bug' },
      { key: 'release_item', name: 'Release item' },
    ]
  }, [workItemTypes])

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

  // Shared with the views that do the filtering, so the "clear" affordance can
  // never disagree with what is actually applied. The local copy this replaces
  // omitted areaId, so an area-only filter left no way to clear it.
  const filtersAreActive = hasActiveFilters(filters, { workItemTypeTab: workItemTypeFilter })

  const handleViewModeChange = (mode: 'board' | 'list') => {
    setViewMode(mode)
    onViewModeChange?.(mode)
  }

  const toggleLabel = (labelId: string) => {
    setFilters({
      labelIds: filters.labelIds.includes(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
    })
  }

  const typeName =
    typeOptions.find((option) => option.key === workItemTypeFilter)?.name ?? workItemTypeFilter
  const assigneeName = users.find((user) => user.id === filters.assigneeId)?.name
  const iterationName = iterations.find(
    (iteration) => iteration.id === filters.iterationId
  )
  const activeLabels = labels.filter((label) => filters.labelIds.includes(label.id))

  /**
   * Rendered inline on desktop and inside the filter sheet on mobile. Built
   * once so the two never drift apart — the desktop bar previously hid the
   * iteration select below lg with no other way to reach it.
   */
  const filterControls = (
    <>
      <Select
        value={workItemTypeFilter}
        onValueChange={(value) => setWorkItemTypeFilter(value as WorkItemType | 'all')}
      >
        <SelectTrigger size="sm" className="w-full md:w-[8.5rem]" aria-label="Filter by type">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          {typeOptions.map((type) => (
            <SelectItem key={type.key} value={type.key}>
              <span className="flex items-center gap-2">
                {type.key === 'all' ? (
                  <span className="size-3.5" aria-hidden="true" />
                ) : (
                  <TypeIcon type={type.key} withTooltip={false} />
                )}
                <span>{type.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.assigneeId || ALL_VALUE}
        onValueChange={(value) => setFilters({ assigneeId: value === ALL_VALUE ? null : value })}
      >
        <SelectTrigger size="sm" className="w-full md:w-[9rem]" aria-label="Filter by assignee">
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All assignees</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority || ALL_VALUE}
        onValueChange={(value) => setFilters({ priority: value === ALL_VALUE ? null : value })}
      >
        <SelectTrigger size="sm" className="w-full md:w-[8.5rem]" aria-label="Filter by priority">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All priorities</SelectItem>
          <SelectItem value="highest">Highest</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="lowest">Lowest</SelectItem>
        </SelectContent>
      </Select>

      {iterations.length > 0 ? (
        <Select
          value={filters.iterationId || ALL_VALUE}
          onValueChange={(value) => setFilters({ iterationId: value === ALL_VALUE ? null : value })}
        >
          <SelectTrigger
            size="sm"
            className="w-full md:hidden md:w-[9.5rem] lg:flex"
            aria-label="Filter by iteration"
          >
            <SelectValue placeholder="Iteration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All iterations</SelectItem>
            {iterations.map((iteration) => (
              <SelectItem key={iteration.id} value={iteration.id}>
                {iteration.path || iteration.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {labels.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'w-full justify-start md:w-auto md:justify-center',
                filters.labelIds.length > 0 && 'border-primary/60'
              )}
            >
              <Tag />
              Labels
              {filters.labelIds.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary-muted px-1.5 text-[10px] font-medium tabular-nums text-primary">
                  {filters.labelIds.length}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <div className="type-label border-b border-border px-3 py-2">Filter by label</div>
            <div className="max-h-64 overflow-auto p-1">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  onClick={() => toggleLabel(label.id)}
                >
                  <Checkbox
                    checked={filters.labelIds.includes(label.id)}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{label.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  )

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (workItemTypeFilter !== 'all' ? 1 : 0) +
    (filters.assigneeId ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (filters.iterationId ? 1 : 0) +
    (filters.areaId ? 1 : 0) +
    filters.labelIds.length

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-background px-4 py-2 sm:px-6"
      data-testid="work-items-filter-bar"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          placeholder="Search work items"
          containerClassName="w-full sm:w-56"
          className="h-8"
          aria-label="Search work items"
          data-testid="work-items-search-input"
          icon={<Search />}
          trailing={
            filters.search ? (
              <button
                type="button"
                onClick={() => setFilters({ search: '' })}
                aria-label="Clear search"
                className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : undefined
          }
        />

        <SavedViews />

        <ToolbarDivider className="hidden md:block" />

        {/* Inline on a desktop toolbar. */}
        <div className="hidden items-center gap-1.5 md:flex">{filterControls}</div>

        {/*
          On a phone the same controls live one tap away instead of stacking
          four rows deep above the results. The trigger carries a count so the
          filters are never silently applied behind a closed sheet.
        */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn('md:hidden', activeFilterCount > 0 && 'border-primary/60')}
            >
              <SlidersHorizontal />
              Filters
              {activeFilterCount > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary-muted px-1.5 text-[10px] font-medium tabular-nums text-primary">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] space-y-2.5">
            {filterControls}
            {filtersAreActive ? (
              <Button variant="ghost" size="sm" className="w-full" onClick={clearFilters}>
                Clear all filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-1.5">
          {showViewModeToggle ? (
            <div
              role="group"
              aria-label="View mode"
              className="flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5"
            >
              <Button
                variant={viewMode === 'board' ? 'outline' : 'ghost'}
                size="xs"
                onClick={() => handleViewModeChange('board')}
                aria-pressed={viewMode === 'board'}
                className={cn('rounded-[5px]', viewMode === 'board' && 'bg-card shadow-2xs')}
                data-testid="work-items-view-board-button"
              >
                <LayoutGrid />
                <span className="hidden sm:inline">Board</span>
              </Button>
              <Button
                variant={viewMode === 'list' ? 'outline' : 'ghost'}
                size="xs"
                onClick={() => handleViewModeChange('list')}
                aria-pressed={viewMode === 'list'}
                className={cn('rounded-[5px]', viewMode === 'list' && 'bg-card shadow-2xs')}
                data-testid="work-items-view-list-button"
              >
                <List />
                <span className="hidden sm:inline">List</span>
              </Button>
            </div>
          ) : null}

          {canManageSprints ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setSprintModalOpen(true)}>
                  <Flag />
                  <span className="hidden md:inline">Sprints</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Plan and manage sprints</TooltipContent>
            </Tooltip>
          ) : null}

          {currentProject && canCreateWorkItems ? (
            <Button
              size="sm"
              onClick={() => setCreateIssueOpen(true)}
              data-testid="work-items-new-button"
            >
              <Plus />
              <span className="hidden sm:inline">New work item</span>
              <span className="sm:hidden">New</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* The applied-filter summary. Only present when something is applied, so
          the bar stays one row deep in the common case. */}
      {filtersAreActive ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.search ? (
            <FilterChip
              label="Search"
              value={filters.search}
              onRemove={() => setFilters({ search: '' })}
            />
          ) : null}
          {workItemTypeFilter !== 'all' ? (
            <FilterChip
              label="Type"
              value={typeName}
              onRemove={() => setWorkItemTypeFilter('all')}
            />
          ) : null}
          {filters.assigneeId ? (
            <FilterChip
              label="Assignee"
              value={assigneeName ?? 'Unknown'}
              onRemove={() => setFilters({ assigneeId: null })}
            />
          ) : null}
          {filters.priority ? (
            <FilterChip
              label="Priority"
              value={getPriorityLabel(filters.priority)}
              onRemove={() => setFilters({ priority: null })}
            />
          ) : null}
          {filters.iterationId ? (
            <FilterChip
              label="Iteration"
              value={iterationName?.path || iterationName?.name || 'Unknown'}
              onRemove={() => setFilters({ iterationId: null })}
            />
          ) : null}
          {activeLabels.map((label) => (
            <FilterChip
              key={label.id}
              label="Label"
              value={label.name}
              onRemove={() => toggleLabel(label.id)}
            />
          ))}
          {filters.areaId ? (
            <FilterChip
              label="Area"
              value="Selected"
              onRemove={() => setFilters({ areaId: null })}
            />
          ) : null}

          <Button variant="ghost" size="xs" onClick={clearFilters} className="text-muted-foreground">
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )
}
