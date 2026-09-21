'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bookmark, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EMPTY_PLANNING_FILTERS,
  hasPlanningFilters,
  type PlanningFilterItem,
  type PlanningFilterState,
} from '@/lib/domain/planning-filters'

type Named = { id: string; name?: string; title?: string }

export type PlanningFilterOptionItem = PlanningFilterItem & {
  assignee?: (Named & { avatar?: string | null }) | null
  area?: Named | null
  iteration?: (Named & {
    iterationType?: string | null
    team?: Named | null
  }) | null
  objectives?: Named[]
}

type SavedPlanningView = {
  id: string
  name: string
  filters: PlanningFilterState
}

type PlanningFilterBarProps = {
  items: PlanningFilterOptionItem[]
  filters: PlanningFilterState
  onChange: (filters: PlanningFilterState) => void
  storageKey: string
}

const ALL = '__all__'

function uniqueNamed(values: Array<Named | null | undefined>) {
  return Array.from(
    new Map(values.filter((value): value is Named => Boolean(value)).map((value) => [value.id, value])).values()
  ).sort((left, right) => (left.name ?? left.title ?? '').localeCompare(right.name ?? right.title ?? ''))
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: Named[]
  onChange: (value: string | null) => void
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger className="h-9 min-w-[145px] bg-background" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}s</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name ?? option.title ?? option.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PlanningFilterBar({ items, filters, onChange, storageKey }: PlanningFilterBarProps) {
  const [savedViews, setSavedViews] = useState<SavedPlanningView[]>([])
  const [viewName, setViewName] = useState('')

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey)
        const parsed = stored ? JSON.parse(stored) : []
        setSavedViews(Array.isArray(parsed) ? parsed : [])
      } catch {
        setSavedViews([])
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [storageKey])

  const options = useMemo(() => {
    const owners = uniqueNamed(items.map((item) => item.assignee))
    const teams = uniqueNamed(items.map((item) => item.iteration?.team))
    const areas = uniqueNamed(items.map((item) => item.area))
    const objectives = uniqueNamed(items.flatMap((item) => item.objectives ?? []))
    const releases = uniqueNamed(
      items.map((item) => item.iteration?.iterationType === 'release' ? item.iteration : null)
    )
    const types = [...new Set(items.map((item) => item.workItemType))]
      .sort()
      .map((id) => ({ id, name: id.replace(/_/g, ' ') }))
    const states = [...new Set(items.map((item) => item.status))]
      .sort()
      .map((id) => ({ id, name: id.replace(/_/g, ' ') }))
    return { owners, teams, areas, objectives, releases, types, states }
  }, [items])

  const update = (patch: Partial<PlanningFilterState>) => onChange({ ...filters, ...patch })

  const persistViews = (next: SavedPlanningView[]) => {
    setSavedViews(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Saving a view is optional when storage is unavailable.
    }
  }

  const saveView = () => {
    const name = viewName.trim()
    if (!name || !hasPlanningFilters(filters)) return
    const next = [
      ...savedViews.filter((view) => view.name.toLowerCase() !== name.toLowerCase()),
      { id: crypto.randomUUID(), name, filters },
    ]
    persistViews(next)
    setViewName('')
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3" data-testid="planning-filter-bar">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterSelect label="Owner" value={filters.ownerId} options={options.owners} onChange={(ownerId) => update({ ownerId })} />
        <FilterSelect label="Team" value={filters.teamId} options={options.teams} onChange={(teamId) => update({ teamId })} />
        <FilterSelect label="Area" value={filters.areaId} options={options.areas} onChange={(areaId) => update({ areaId })} />
        <FilterSelect label="Objective" value={filters.objectiveId} options={options.objectives} onChange={(objectiveId) => update({ objectiveId })} />
        <FilterSelect label="Type" value={filters.workItemType} options={options.types} onChange={(workItemType) => update({ workItemType })} />
        <FilterSelect label="State" value={filters.status} options={options.states} onChange={(status) => update({ status })} />
        <FilterSelect label="Release" value={filters.releaseId} options={options.releases} onChange={(releaseId) => update({ releaseId })} />
        <Input className="h-9 min-w-[145px] bg-background" type="date" aria-label="Filter from date" value={filters.dateFrom ?? ''} onChange={(event) => update({ dateFrom: event.target.value || null })} />
        <Input className="h-9 min-w-[145px] bg-background" type="date" aria-label="Filter through date" value={filters.dateTo ?? ''} onChange={(event) => update({ dateTo: event.target.value || null })} />
        {hasPlanningFilters(filters) ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" onClick={() => onChange({ ...EMPTY_PLANNING_FILTERS })}>
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value="" onValueChange={(id) => {
          const selected = savedViews.find((view) => view.id === id)
          if (selected) onChange(selected.filters)
        }}>
          <SelectTrigger className="h-8 min-w-[180px] bg-background" aria-label="Apply saved planning view">
            <SelectValue placeholder="Saved planning views" />
          </SelectTrigger>
          <SelectContent>
            {savedViews.map((view) => <SelectItem key={view.id} value={view.id}>{view.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="h-8 max-w-[220px] bg-background" value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Name current filters" aria-label="Saved view name" />
        <Button type="button" variant="outline" size="sm" className="h-8" disabled={!viewName.trim() || !hasPlanningFilters(filters)} onClick={saveView}>
          <Bookmark className="h-3.5 w-3.5" /> Save view
        </Button>
        {savedViews.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 sm:ml-auto" onClick={() => persistViews([])}>
            <Trash2 className="h-3.5 w-3.5" /> Clear saved
          </Button>
        ) : null}
      </div>
    </div>
  )
}
