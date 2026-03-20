'use client'

import { useMemo } from 'react'
import { useAppStore, WorkItemType } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Bug,
  CheckCircle2,
  CircleDot,
  Flag,
  LayoutGrid,
  List,
  PackageCheck,
  Plus,
  Rocket,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react'

const ALL_VALUE = '__all__'

const WORK_ITEM_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  all: { icon: CircleDot, color: 'text-muted-foreground' },
  epic: { icon: Rocket, color: 'text-indigo-500' },
  feature: { icon: Flag, color: 'text-cyan-500' },
  story: { icon: Star, color: 'text-violet-500' },
  task: { icon: CheckCircle2, color: 'text-emerald-500' },
  bug: { icon: Bug, color: 'text-red-500' },
  design_doc: { icon: Rocket, color: 'text-teal-500' },
  release_item: { icon: PackageCheck, color: 'text-orange-500' },
}

interface FilterBarProps {
  onViewModeChange?: (mode: 'board' | 'list') => void
  showViewModeToggle?: boolean
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
        { key: 'all', name: 'All Types' },
        ...workItemTypes.map((type) => ({ key: type.key, name: type.name })),
      ]
    }

    return [
      { key: 'all', name: 'All Types' },
      { key: 'epic', name: 'Epic' },
      { key: 'feature', name: 'Feature' },
      { key: 'story', name: 'User Story' },
      { key: 'task', name: 'Task' },
      { key: 'bug', name: 'Bug' },
      { key: 'design_doc', name: 'Design Doc' },
      { key: 'release_item', name: 'Release Item' },
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

  const hasActiveFilters =
    filters.assigneeId ||
    filters.priority ||
    filters.type ||
    filters.search ||
    filters.iterationId ||
    filters.labelIds.length > 0 ||
    workItemTypeFilter !== 'all'

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

  return (
    <div className="flex-shrink-0 border-b border-border bg-background px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(event) => setFilters({ search: event.target.value })}
            placeholder="Search issues..."
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Select
          value={workItemTypeFilter}
          onValueChange={(value) => setWorkItemTypeFilter(value as WorkItemType | 'all')}
        >
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((type) => {
              const config =
                WORK_ITEM_TYPE_CONFIG[type.key] ?? WORK_ITEM_TYPE_CONFIG.all
              const Icon = config.icon
              return (
                <SelectItem key={type.key} value={type.key}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    <span>{type.name}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <Select
          value={filters.assigneeId || ALL_VALUE}
          onValueChange={(value) =>
            setFilters({ assigneeId: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger className="h-8 w-[140px] text-sm">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All Assignees</SelectItem>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.priority || ALL_VALUE}
          onValueChange={(value) =>
            setFilters({ priority: value === ALL_VALUE ? null : value })
          }
        >
          <SelectTrigger className="h-8 w-[120px] text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All</SelectItem>
            <SelectItem value="highest">Highest</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="lowest">Lowest</SelectItem>
          </SelectContent>
        </Select>

        {iterations.length > 0 && (
          <Select
            value={filters.iterationId || ALL_VALUE}
            onValueChange={(value) =>
              setFilters({ iterationId: value === ALL_VALUE ? null : value })
            }
          >
            <SelectTrigger className="h-8 w-[150px] text-sm">
              <SelectValue placeholder="Iteration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All Iterations</SelectItem>
              {iterations.map((iteration) => (
                <SelectItem key={iteration.id} value={iteration.id}>
                  {iteration.path || iteration.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {labels.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
                <Tag className="h-3.5 w-3.5" />
                Labels
                {filters.labelIds.length > 0 && (
                  <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">
                    {filters.labelIds.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                Filter by labels
              </div>
              <div className="max-h-64 space-y-1 overflow-auto p-2">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/50"
                    onClick={() => toggleLabel(label.id)}
                  >
                    <Checkbox checked={filters.labelIds.includes(label.id)} />
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 text-sm">{label.name}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 px-2 text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        <div className="flex-1" />

        {showViewModeToggle && (
          <div className="flex items-center rounded-md border border-border p-0.5">
            <Button
              variant={viewMode === 'board' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('board')}
              className="h-7 gap-1 rounded-sm px-2 text-xs"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Board</span>
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('list')}
              className="h-7 gap-1 rounded-sm px-2 text-xs"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">List</span>
            </Button>
          </div>
        )}

        {canManageSprints && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={() => setSprintModalOpen(true)}
          >
            <Flag className="mr-1.5 h-3.5 w-3.5" />
            Sprints
          </Button>
        )}

        {currentProject && canCreateWorkItems && (
          <Button size="sm" className="h-8 text-sm" onClick={() => setCreateIssueOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Work Item
          </Button>
        )}
      </div>
    </div>
  )
}
