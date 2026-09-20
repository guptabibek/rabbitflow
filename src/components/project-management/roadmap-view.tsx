'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, differenceInCalendarDays, endOfWeek, format, max, min, startOfWeek } from 'date-fns'
import { useAppStore } from '@/store/app-store'
import { useProjectCollaboration } from '@/hooks/use-project-collaboration'
import { PresenceStrip } from '@/components/project-management/presence-strip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getApiErrorMessage } from '@/lib/utils'
import { InlineAlert } from '@/components/ui/states'
import { PlanningFilterBar } from '@/components/project-management/planning-filter-bar'
import {
  EMPTY_PLANNING_FILTERS,
  matchesPlanningFilters,
  parsePlanningFilters,
  writePlanningFilters,
  type PlanningFilterState,
} from '@/lib/domain/planning-filters'
import { ChevronDown, ChevronRight, Link2, MoveHorizontal, RotateCcw } from 'lucide-react'

type RoadmapItem = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  workItemType: string
  hierarchyLevel: number
  version: number
  parentIssueId: string | null
  startDate: string
  endDate: string
  assignee: { id: string; name: string; avatar: string | null } | null
  area: { id: string; name: string } | null
  iteration: {
    id: string
    name: string
    iterationType: string
    team: { id: string; name: string } | null
  } | null
  objectives: Array<{ id: string; title: string }>
  epicGroupId: string | null
  epicGroupLabel: string
  dependencies: Array<{
    id: string
    relationType: string
    direction: string
    linkedIssue: {
      id: string
      key: string
      title: string
      status: string
      startDate: string | null
      dueDate: string | null
    }
  }>
}

type ScheduleUndo = {
  itemId: string
  key: string
  startDate: string
  endDate: string
}

type ScheduleProposal = {
  itemId: string
  key: string
  title: string
  startDate: string
  endDate: string
  objectives: RoadmapItem['objectives']
  dependencies: RoadmapItem['dependencies']
}

export function RoadmapView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentUser = useAppStore((state) => state.currentUser)
  const openWorkItem = useAppStore((state) => state.openWorkItem)
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [undo, setUndo] = useState<ScheduleUndo | null>(null)
  const [proposal, setProposal] = useState<ScheduleProposal | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [showDependencies, setShowDependencies] = useState(true)
  const [filters, setFilters] = useState<PlanningFilterState>(() =>
    typeof window === 'undefined' ? { ...EMPTY_PLANNING_FILTERS } : parsePlanningFilters(window.location.search)
  )
  const collaboration = useProjectCollaboration(currentProject?.id ?? null, 'roadmap')

  const fetchItems = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const response = await fetch(`/api/roadmap?projectId=${currentProject.id}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Failed to load roadmap'))
      const payload = await response.json()
      setItems(payload.items ?? [])
      setError(null)
      setScheduleError(null)
    } catch (loadError) {
      setItems([])
      setError(loadError instanceof Error ? loadError.message : 'Failed to load roadmap')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchItems(), 0)
    return () => window.clearTimeout(timeout)
  }, [collaboration.refreshToken, fetchItems])

  useEffect(() => {
    const params = writePlanningFilters(window.location.search, filters)
    const query = params.toString()
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) window.history.replaceState(window.history.state, '', next)
  }, [filters])

  const visibleItems = useMemo(
    () => items.filter((item) => matchesPlanningFilters(item, filters)),
    [filters, items]
  )

  const groups = useMemo(() => {
    const sorted = [...visibleItems].sort(
      (left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
    )

    return sorted.reduce<Record<string, RoadmapItem[]>>((accumulator, item) => {
      if (!accumulator[item.epicGroupLabel]) {
        accumulator[item.epicGroupLabel] = []
      }
      accumulator[item.epicGroupLabel].push(item)
      return accumulator
    }, {})
  }, [visibleItems])

  const range = useMemo(() => {
    if (visibleItems.length === 0) return null
    const minDate = startOfWeek(min(visibleItems.map((item) => new Date(item.startDate))), { weekStartsOn: 1 })
    const maxDate = endOfWeek(max(visibleItems.map((item) => new Date(item.endDate))), { weekStartsOn: 1 })
    const totalDays = Math.max(differenceInCalendarDays(maxDate, minDate) + 1, 1)
    const ticks = Array.from({ length: Math.ceil(totalDays / 7) + 1 }, (_, index) => {
      const tickDate = new Date(minDate)
      tickDate.setDate(minDate.getDate() + index * 7)
      return tickDate
    })
    return { minDate, maxDate, totalDays, ticks }
  }, [visibleItems])

  const updateSchedule = async (
    item: RoadmapItem,
    nextStart: Date,
    nextEnd: Date,
    recordUndo = true
  ) => {
    if (nextEnd.getTime() < nextStart.getTime() || savingItemId) return false
    const before = { startDate: item.startDate, endDate: item.endDate }
    const optimisticStart = nextStart.toISOString()
    const optimisticEnd = nextEnd.toISOString()
    setScheduleError(null)
    setSavingItemId(item.id)
    setItems((current) => current.map((candidate) => candidate.id === item.id
      ? { ...candidate, startDate: optimisticStart, endDate: optimisticEnd }
      : candidate))

    try {
      const response = await fetch(`/api/issues/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: optimisticStart,
          dueDate: optimisticEnd,
          version: item.version,
        }),
      })
      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Schedule update failed')
        throw new Error(response.status === 409 ? `Schedule conflict: ${message}` : message)
      }
      const saved = await response.json()
      setItems((current) => current.map((candidate) => candidate.id === item.id
        ? {
            ...candidate,
            version: saved.version,
            startDate: saved.startDate ?? optimisticStart,
            endDate: saved.dueDate ?? optimisticEnd,
          }
        : candidate))
      if (recordUndo) {
        setUndo({ itemId: item.id, key: item.key, ...before })
      } else {
        setUndo(null)
      }
      setAnnouncement(`${item.key} schedule saved.`)
      return true
    } catch (mutationError) {
      setItems((current) => current.map((candidate) => candidate.id === item.id
        ? { ...candidate, ...before }
        : candidate))
      setScheduleError(mutationError instanceof Error ? mutationError.message : 'Schedule update failed')
      return false
    } finally {
      setSavingItemId(null)
    }
  }

  const previewSchedule = (item: RoadmapItem, nextStart: Date, nextEnd: Date) => {
    if (nextEnd < nextStart) return
    setScheduleError(null)
    setProposal({
      itemId: item.id,
      key: item.key,
      title: item.title,
      startDate: nextStart.toISOString(),
      endDate: nextEnd.toISOString(),
      objectives: item.objectives,
      dependencies: item.dependencies,
    })
  }

  const applyProposal = async () => {
    if (!proposal) return
    const latestItem = items.find((item) => item.id === proposal.itemId)
    if (!latestItem) {
      setScheduleError('The proposed item is no longer available. Reload the roadmap and try again.')
      return
    }
    const saved = await updateSchedule(latestItem, new Date(proposal.startDate), new Date(proposal.endDate))
    if (saved) setProposal(null)
  }

  const shiftItem = (item: RoadmapItem, days: number) => {
    previewSchedule(
      item,
      addDays(new Date(item.startDate), days),
      addDays(new Date(item.endDate), days)
    )
  }

  const resizeItem = (item: RoadmapItem, days: number) => {
    const nextEnd = addDays(new Date(item.endDate), days)
    if (nextEnd < new Date(item.startDate)) return
    previewSchedule(item, new Date(item.startDate), nextEnd)
  }

  const undoLastChange = () => {
    if (!undo) return
    const item = items.find((candidate) => candidate.id === undo.itemId)
    if (!item) return
    void updateSchedule(item, new Date(undo.startDate), new Date(undo.endDate), false)
  }

  const dependencyConflict = (item: RoadmapItem, dependency: RoadmapItem['dependencies'][number]) => {
    const linkedStart = dependency.linkedIssue.startDate ? new Date(dependency.linkedIssue.startDate) : null
    const linkedEnd = dependency.linkedIssue.dueDate
      ? new Date(dependency.linkedIssue.dueDate)
      : linkedStart
    const itemStart = new Date(item.startDate)
    const itemEnd = new Date(item.endDate)
    const linkedBlocksItem =
      (dependency.direction === 'outgoing' && dependency.relationType === 'blocked_by') ||
      (dependency.direction === 'incoming' && dependency.relationType === 'blocks')
    const itemBlocksLinked =
      (dependency.direction === 'outgoing' && dependency.relationType === 'blocks') ||
      (dependency.direction === 'incoming' && dependency.relationType === 'blocked_by')
    if (linkedBlocksItem && linkedEnd && linkedEnd >= itemStart) return true
    if (itemBlocksLinked && linkedStart && itemEnd >= linkedStart) return true
    return false
  }

  const proposalConflicts = proposal
    ? proposal.dependencies.filter((dependency) => dependencyConflict({
        ...items.find((item) => item.id === proposal.itemId)!,
        startDate: proposal.startDate,
        endDate: proposal.endDate,
      }, dependency))
    : []

  if (!currentProject) return null

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Roadmap / Timeline</CardTitle>
            <p className="text-sm text-muted-foreground">
              Gantt-style planning with epic grouping and dependency visibility.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={showDependencies ? 'secondary' : 'outline'} size="sm" onClick={() => setShowDependencies((value) => !value)}>
              <Link2 className="h-3.5 w-3.5" /> Dependencies
            </Button>
            {undo ? (
              <Button type="button" variant="outline" size="sm" onClick={undoLastChange} disabled={Boolean(savingItemId)}>
                <RotateCcw className="h-3.5 w-3.5" /> Undo {undo.key}
              </Button>
            ) : null}
            <PresenceStrip presence={collaboration.presence} currentUserId={currentUser?.id} />
          </div>
        </CardHeader>
      </Card>

      <PlanningFilterBar
        items={items}
        filters={filters}
        onChange={setFilters}
        storageKey={`rabbitflow-roadmap-views:${currentProject.id}`}
      />

      {scheduleError ? (
        <InlineAlert
          tone="danger"
          title={scheduleError.startsWith('Schedule conflict:') ? 'The roadmap changed elsewhere.' : 'Schedule not updated.'}
          action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void fetchItems()}>Reload latest</Button>{proposal ? <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('roadmap-proposal')?.scrollIntoView({ behavior: 'smooth' })}>Review proposed dates</Button> : null}</div>}
        >
          {scheduleError}
        </InlineAlert>
      ) : null}

      {proposal ? (
        <Card id="roadmap-proposal" data-testid="roadmap-proposal" className="scroll-mt-4 border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Review proposed dates for {proposal.key}</CardTitle>
            <p className="text-sm text-muted-foreground">Nothing has been saved yet. Review the delivery impact before applying this scenario.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3"><span className="block text-xs text-muted-foreground">Proposed start</span>{format(new Date(proposal.startDate), 'MMM d, yyyy')}</div>
              <div className="rounded-lg bg-muted/50 p-3"><span className="block text-xs text-muted-foreground">Proposed end</span>{format(new Date(proposal.endDate), 'MMM d, yyyy')}</div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><h4 className="text-sm font-medium">Affected dependencies</h4>{proposal.dependencies.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No dependencies are connected.</p> : <div className="mt-1 space-y-1">{proposal.dependencies.map((dependency) => <p key={dependency.id} className={proposalConflicts.some((entry) => entry.id === dependency.id) ? 'text-xs text-warning' : 'text-xs text-muted-foreground'}>{dependency.linkedIssue.key} · {dependency.relationType.replace(/_/g, ' ')}{proposalConflicts.some((entry) => entry.id === dependency.id) ? ' · dates conflict' : ' · no date conflict'}</p>)}</div>}</div>
              <div><h4 className="text-sm font-medium">Affected objectives</h4>{proposal.objectives.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No objectives are linked.</p> : <div className="mt-1 space-y-1">{proposal.objectives.map((objective) => <p key={objective.id} className="text-xs text-muted-foreground">{objective.title}</p>)}</div>}</div>
            </div>
            <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setProposal(null)} disabled={Boolean(savingItemId)}>Cancel scenario</Button><Button type="button" onClick={() => void applyProposal()} disabled={Boolean(savingItemId)}>{savingItemId ? 'Applying…' : 'Apply dates'}</Button></div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading roadmap…</CardContent>
        </Card>
      ) : visibleItems.length === 0 || !range ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error || (items.length > 0
              ? 'No roadmap items match the current filters.'
              : 'No roadmap items with schedule data yet. Add start dates, due dates, or epic children to populate the timeline.')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <div className="space-y-3 p-3 md:hidden" data-testid="mobile-roadmap">
              {visibleItems.map((item) => (
                <article key={item.id} className="rounded-xl border border-border/70 p-3">
                  <button type="button" className="min-h-11 w-full text-left" onClick={() => openWorkItem(item.id)}>
                    <span className="font-mono text-xs text-muted-foreground">{item.key}</span>
                    <span className="mt-1 block text-sm font-medium">{item.title}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge variant="outline">{format(new Date(item.startDate), 'MMM d')}</Badge><span className="text-xs text-muted-foreground">to</span><Badge variant="outline">{format(new Date(item.endDate), 'MMM d')}</Badge>{item.dependencies.length > 0 ? <Badge variant="secondary">{item.dependencies.length} dependencies</Badge> : null}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2" aria-label={`Schedule controls for ${item.key}`}>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => shiftItem(item, -1)} disabled={Boolean(savingItemId)}>Move 1 day earlier</Button>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => shiftItem(item, 1)} disabled={Boolean(savingItemId)}>Move 1 day later</Button>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => resizeItem(item, -1)} disabled={Boolean(savingItemId) || differenceInCalendarDays(new Date(item.endDate), new Date(item.startDate)) < 1}>Shorten 1 day</Button>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => resizeItem(item, 1)} disabled={Boolean(savingItemId)}>Extend 1 day</Button>
                  </div>
                  {showDependencies && item.dependencies.length > 0 ? <div className="mt-3 border-t pt-2">{item.dependencies.map((dependency) => <p key={dependency.id} className={dependencyConflict(item, dependency) ? 'text-xs text-warning' : 'text-xs text-muted-foreground'}>{dependency.linkedIssue.key} · {dependency.relationType.replace(/_/g, ' ')}{dependencyConflict(item, dependency) ? ' · dates conflict' : ''}</p>)}</div> : null}
                </article>
              ))}
            </div>
            <div className="hidden min-w-[980px] p-4 md:block">
              <div className="grid grid-cols-[260px_1fr] gap-4 border-b border-border pb-3">
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Epic / Work item</div>
                <div className="relative h-10">
                  {range.ticks.map((tick) => {
                    const offset = (differenceInCalendarDays(tick, range.minDate) / range.totalDays) * 100
                    return (
                      <div
                        key={tick.toISOString()}
                        className="absolute inset-y-0"
                        style={{ left: `${offset}%` }}
                      >
                        <div className="h-full border-l border-dashed border-border/70" />
                        <div className="absolute left-2 top-0 text-[11px] text-muted-foreground">
                          {format(tick, 'MMM d')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-6 pt-4">
                {Object.entries(groups).map(([groupLabel, groupItems]) => (
                  <div key={groupLabel} className="space-y-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      onClick={() => setCollapsedGroups((current) => {
                        const next = new Set(current)
                        if (next.has(groupLabel)) next.delete(groupLabel)
                        else next.add(groupLabel)
                        return next
                      })}
                    >
                      {collapsedGroups.has(groupLabel) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <h3 className="text-sm font-semibold">{groupLabel}</h3>
                      <Badge variant="secondary">{groupItems.length} items</Badge>
                    </button>

                    {!collapsedGroups.has(groupLabel) && groupItems.map((item) => {
                      const startOffset =
                        (differenceInCalendarDays(new Date(item.startDate), range.minDate) / range.totalDays) * 100
                      const width =
                        ((differenceInCalendarDays(new Date(item.endDate), new Date(item.startDate)) + 1) / range.totalDays) * 100

                      return (
                        <div key={item.id} className="grid grid-cols-[260px_1fr] gap-4">
                          <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                            <button type="button" className="w-full text-left" onClick={() => openWorkItem(item.id)}>
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {item.key}
                              </div>
                              <div className="mt-1 text-sm font-medium leading-snug">{item.title}</div>
                            </button>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="outline">{item.workItemType}</Badge>
                              <Badge variant="secondary">{item.status.replace(/_/g, ' ')}</Badge>
                              {item.dependencies.length > 0 ? (
                                <Badge variant="outline">{item.dependencies.length} deps</Badge>
                              ) : null}
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-1" aria-label={`Schedule controls for ${item.key}`}>
                              <Button type="button" variant="outline" size="sm" className="h-7 px-1 text-[11px]" aria-label={`Move ${item.key} one day earlier`} onClick={() => shiftItem(item, -1)} disabled={Boolean(savingItemId)}>−1d</Button>
                              <Button type="button" variant="outline" size="sm" className="h-7 px-1 text-[11px]" aria-label={`Move ${item.key} one day later`} onClick={() => shiftItem(item, 1)} disabled={Boolean(savingItemId)}>+1d</Button>
                              <Button type="button" variant="outline" size="sm" className="h-7 px-1 text-[11px]" aria-label={`Shorten ${item.key} by one day`} onClick={() => resizeItem(item, -1)} disabled={Boolean(savingItemId) || differenceInCalendarDays(new Date(item.endDate), new Date(item.startDate)) < 1}>Shorten</Button>
                              <Button type="button" variant="outline" size="sm" className="h-7 px-1 text-[11px]" aria-label={`Extend ${item.key} by one day`} onClick={() => resizeItem(item, 1)} disabled={Boolean(savingItemId)}>Extend</Button>
                            </div>
                            {showDependencies && item.dependencies.length > 0 ? (
                              <div className="mt-3 space-y-1 border-t border-border pt-2">
                                {item.dependencies.map((dependency) => {
                                  const conflict = dependencyConflict(item, dependency)
                                  const linkedBlocksItem =
                                    (dependency.direction === 'outgoing' && dependency.relationType === 'blocked_by') ||
                                    (dependency.direction === 'incoming' && dependency.relationType === 'blocks')
                                  return (
                                    <p key={dependency.id} className={conflict ? 'text-[11px] text-warning' : 'text-[11px] text-muted-foreground'}>
                                      {linkedBlocksItem ? 'Blocked by' : 'Blocks'} {dependency.linkedIssue.key}
                                      {conflict ? ' · dates overlap' : ''}
                                    </p>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>

                          <div
                            className="relative h-20 rounded-2xl border border-border/70 bg-muted/30"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              const draggedId = event.dataTransfer.getData('text/plain')
                              if (draggedId !== item.id) return
                              const bounds = event.currentTarget.getBoundingClientRect()
                              const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
                              const start = addDays(range.minDate, Math.round(ratio * (range.totalDays - 1)))
                              const duration = differenceInCalendarDays(new Date(item.endDate), new Date(item.startDate))
                              previewSchedule(item, start, addDays(start, duration))
                            }}
                          >
                            {range.ticks.map((tick) => {
                              const offset = (differenceInCalendarDays(tick, range.minDate) / range.totalDays) * 100
                              return (
                                <div
                                  key={tick.toISOString()}
                                  className="absolute inset-y-0 border-l border-dashed border-border/60"
                                  style={{ left: `${offset}%` }}
                                />
                              )
                            })}
                            <div
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', item.id)
                              }}
                              className="absolute top-5 flex h-10 cursor-grab items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg active:cursor-grabbing"
                              style={{ left: `${startOffset}%`, width: `${Math.max(width, 4)}%` }}
                              role="button"
                              tabIndex={0}
                              aria-label={`${item.key} scheduled ${format(new Date(item.startDate), 'MMM d')} through ${format(new Date(item.endDate), 'MMM d')}. Drag to reschedule or use the date controls.`}
                            >
                              <MoveHorizontal className="mr-2 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{format(new Date(item.startDate), 'MMM d')} - {format(new Date(item.endDate), 'MMM d')}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
