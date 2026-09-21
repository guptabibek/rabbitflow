'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { useAppStore } from '@/store/app-store'
import { useProjectCollaboration } from '@/hooks/use-project-collaboration'
import { PresenceStrip } from '@/components/project-management/presence-strip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ChevronLeft, ChevronRight, GripVertical, Plus, RotateCcw } from 'lucide-react'

type CalendarItem = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  workItemType: string
  version: number
  startDate: string | null
  dueDate: string | null
  assignee: { id: string; name: string; avatar: string | null } | null
  area: { id: string; name: string } | null
  iteration: {
    id: string
    name: string
    iterationType: string
    team: { id: string; name: string } | null
  } | null
  objectives: Array<{ id: string; title: string }>
}

type CalendarUndo = Pick<CalendarItem, 'id' | 'key' | 'startDate' | 'dueDate'>

export function CalendarView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentUser = useAppStore((state) => state.currentUser)
  const currentProjectPermissions = useAppStore((state) => state.currentProjectPermissions)
  const openWorkItem = useAppStore((state) => state.openWorkItem)
  const setCreateIssueDraft = useAppStore((state) => state.setCreateIssueDraft)
  const setCreateIssueOpen = useAppStore((state) => state.setCreateIssueOpen)
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [items, setItems] = useState<CalendarItem[]>([])
  const [unscheduled, setUnscheduled] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [undo, setUndo] = useState<CalendarUndo | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [filters, setFilters] = useState<PlanningFilterState>(() =>
    typeof window === 'undefined' ? { ...EMPTY_PLANNING_FILTERS } : parsePlanningFilters(window.location.search)
  )
  const collaboration = useProjectCollaboration(currentProject?.id ?? null, 'calendar')
  const canCreate = currentProjectPermissions.includes('workitem:create')
  const canUpdate = currentProjectPermissions.includes('workitem:update')

  const fetchItems = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const response = await fetch(
        `/api/calendar?projectId=${currentProject.id}&month=${month.toISOString()}`,
        { cache: 'no-store' }
      )
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Failed to load calendar'))
      const payload = await response.json()
      setItems(payload.items ?? [])
      setUnscheduled(payload.unscheduled ?? [])
      setError(null)
      setScheduleError(null)
    } catch (loadError) {
      setItems([])
      setUnscheduled([])
      setError(loadError instanceof Error ? loadError.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [currentProject, month])

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

  const allItems = useMemo(() => [...items, ...unscheduled], [items, unscheduled])
  const visibleItems = useMemo(
    () => items.filter((item) => matchesPlanningFilters(item, filters)),
    [filters, items]
  )
  const visibleUnscheduled = useMemo(
    () => unscheduled.filter((item) => matchesPlanningFilters(item, filters)),
    [filters, unscheduled]
  )

  const selectedItems = useMemo(() => {
    if (!selectedDate) return []
    return visibleItems.filter((item) => {
      const start = item.startDate ? new Date(item.startDate) : null
      const due = item.dueDate ? new Date(item.dueDate) : null
      if (!start && !due) return false
      const rangeStart = start ?? due!
      const rangeEnd = due ?? start!
      const selected = new Date(selectedDate)
      selected.setHours(12, 0, 0, 0)
      return selected >= new Date(new Date(rangeStart).setHours(0, 0, 0, 0)) &&
        selected <= new Date(new Date(rangeEnd).setHours(23, 59, 59, 999))
    })
  }, [selectedDate, visibleItems])

  const calendarDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  }), [month])

  const updateSchedule = async (
    item: CalendarItem,
    nextStart: Date | null,
    nextDue: Date | null,
    recordUndo = true
  ) => {
    if (
      !canUpdate ||
      savingItemId ||
      (nextStart !== null && nextDue !== null && nextDue < nextStart) ||
      (nextStart === null) !== (nextDue === null)
    ) return
    const previousItems = items
    const previousUnscheduled = unscheduled
    const optimistic = {
      ...item,
      startDate: nextStart?.toISOString() ?? null,
      dueDate: nextDue?.toISOString() ?? null,
    }
    setScheduleError(null)
    setSavingItemId(item.id)
    if (nextStart === null) {
      setItems((current) => current.filter((candidate) => candidate.id !== item.id))
      setUnscheduled((current) => [
        ...current.filter((candidate) => candidate.id !== item.id),
        optimistic,
      ])
    } else {
      setUnscheduled((current) => current.filter((candidate) => candidate.id !== item.id))
      setItems((current) => [
        ...current.filter((candidate) => candidate.id !== item.id),
        optimistic,
      ])
    }

    try {
      const response = await fetch(`/api/issues/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: optimistic.startDate,
          dueDate: optimistic.dueDate,
          version: item.version,
        }),
      })
      if (!response.ok) {
        const message = await getApiErrorMessage(response, 'Calendar update failed')
        throw new Error(response.status === 409 ? `Schedule conflict: ${message}` : message)
      }
      const saved = await response.json()
      const savedItem = {
        ...optimistic,
        version: saved.version,
        startDate: saved.startDate ?? null,
        dueDate: saved.dueDate ?? null,
      }
      if (savedItem.startDate === null) {
        setUnscheduled((current) => current.map((candidate) => candidate.id === item.id ? savedItem : candidate))
      } else {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? savedItem : candidate))
      }
      if (recordUndo) {
        setUndo({ id: item.id, key: item.key, startDate: item.startDate, dueDate: item.dueDate })
      } else {
        setUndo(null)
      }
      setAnnouncement(`${item.key} schedule saved.`)
    } catch (mutationError) {
      setItems(previousItems)
      setUnscheduled(previousUnscheduled)
      setScheduleError(mutationError instanceof Error ? mutationError.message : 'Calendar update failed')
    } finally {
      setSavingItemId(null)
    }
  }

  const moveToDate = (item: CalendarItem, date: Date) => {
    const duration = item.startDate && item.dueDate
      ? Math.max(0, differenceInCalendarDays(new Date(item.dueDate), new Date(item.startDate)))
      : 0
    void updateSchedule(item, date, addDays(date, duration))
  }

  const resizeItem = (item: CalendarItem, days: number) => {
    if (!item.startDate) return
    const currentDue = item.dueDate ? new Date(item.dueDate) : new Date(item.startDate)
    const nextDue = addDays(currentDue, days)
    if (nextDue < new Date(item.startDate)) return
    void updateSchedule(item, new Date(item.startDate), nextDue)
  }

  const undoLastChange = () => {
    if (!undo) return
    const item = allItems.find((candidate) => candidate.id === undo.id)
    if (!item) return
    void updateSchedule(
      item,
      undo.startDate ? new Date(undo.startDate) : null,
      undo.dueDate ? new Date(undo.dueDate) : null,
      false
    )
  }

  const createOnDate = (date: Date) => {
    if (!canCreate) return
    const value = format(date, 'yyyy-MM-dd')
    setCreateIssueDraft({
      id: `calendar:${value}:${Date.now()}`,
      title: '',
      workItemType: 'task',
      startDate: value,
      dueDate: value,
    })
    setCreateIssueOpen(true)
  }

  if (!currentProject) return null

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Calendar</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create work on a date, drag to reschedule, and resize duration from the selected-day panel.
            </p>
          </div>
          <PresenceStrip presence={collaboration.presence} currentUserId={currentUser?.id} />
        </CardHeader>
      </Card>

      <PlanningFilterBar
        items={allItems}
        filters={filters}
        onChange={setFilters}
        storageKey={`rabbitflow-calendar-views:${currentProject.id}`}
      />

      {error || scheduleError ? (
        <InlineAlert
          tone="danger"
          title={scheduleError?.startsWith('Schedule conflict:') ? 'The calendar changed elsewhere.' : 'Calendar action not completed.'}
          action={<Button type="button" variant="outline" size="sm" onClick={() => void fetchItems()}>Reload latest</Button>}
        >
          {scheduleError ?? error}
        </InlineAlert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/70">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(today) }}>Today</Button>
              <Button type="button" variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">{format(month, 'MMMM yyyy')}</CardTitle>
              {undo ? <Button type="button" variant="outline" size="sm" onClick={undoLastChange} disabled={Boolean(savingItemId)}><RotateCcw className="h-3.5 w-3.5" /> Undo</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <div className="space-y-3 p-3 md:hidden" data-testid="mobile-calendar">
              <p className="text-sm text-muted-foreground">Choose a day, then review or schedule its work below.</p>
              <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Previous day" onClick={() => setSelectedDate((value) => addDays(value ?? new Date(), -1))}><ChevronLeft className="size-4" /></Button>
                <label className="text-center text-sm font-medium">
                  <span className="sr-only">Selected calendar date</span>
                  <input type="date" value={format(selectedDate ?? new Date(), 'yyyy-MM-dd')} onChange={(event) => { const [year, monthIndex, day] = event.target.value.split('-').map(Number); const next = new Date(year, monthIndex - 1, day); setSelectedDate(next); setMonth(next) }} className="h-11 w-full rounded-md border border-input bg-background px-3 text-center" />
                </label>
                <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Next day" onClick={() => setSelectedDate((value) => addDays(value ?? new Date(), 1))}><ChevronRight className="size-4" /></Button>
              </div>
              {selectedDate && canCreate ? <Button type="button" className="min-h-11 w-full" onClick={() => createOnDate(selectedDate)}><Plus className="size-4" /> Create work on {format(selectedDate, 'MMM d')}</Button> : null}
            </div>
            <div className="hidden min-w-[760px] md:block">
              <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-medium text-muted-foreground">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="p-2">{day}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                  const dayItems = visibleItems.filter((item) => {
                    if (!item.startDate && !item.dueDate) return false
                    const start = new Date(item.startDate ?? item.dueDate!)
                    const end = new Date(item.dueDate ?? item.startDate!)
                    return day >= new Date(new Date(start).setHours(0, 0, 0, 0)) && day <= new Date(new Date(end).setHours(23, 59, 59, 999))
                  })
                  const selected = selectedDate ? isSameDay(day, selectedDate) : false
                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-28 border-b border-r border-border p-1.5 ${isSameMonth(day, month) ? 'bg-background' : 'bg-muted/20 text-muted-foreground'} ${selected ? 'ring-2 ring-inset ring-primary' : ''}`}
                      onClick={() => setSelectedDate(day)}
                      onDragOver={(event) => { if (canUpdate) event.preventDefault() }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const item = allItems.find((candidate) => candidate.id === event.dataTransfer.getData('text/plain'))
                        if (item) moveToDate(item, day)
                      }}
                      data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${isSameDay(day, new Date()) ? 'bg-primary font-semibold text-primary-foreground' : ''}`}>{format(day, 'd')}</span>
                        {canCreate ? (
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Create work item on ${format(day, 'MMMM d')}`} onClick={(event) => { event.stopPropagation(); createOnDate(day) }}><Plus className="h-3.5 w-3.5" /></Button>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {dayItems.slice(0, 4).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            draggable={canUpdate}
                            onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move' }}
                            onClick={(event) => { event.stopPropagation(); openWorkItem(item.id) }}
                            className="flex w-full items-center gap-1 rounded bg-primary/10 px-1.5 py-1 text-left text-[11px] text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={`${item.key}: ${item.title}`}
                          >
                            {canUpdate ? <GripVertical className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                            <span className="truncate">{item.key} {item.title}</span>
                          </button>
                        ))}
                        {dayItems.length > 4 ? <p className="px-1 text-[10px] text-muted-foreground">+{dayItems.length - 4} more</p> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {loading ? <p className="text-sm text-muted-foreground">Loading calendar items…</p> : selectedItems.length === 0 ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>No scheduled work on the selected day.</p>
                  {selectedDate && canCreate ? <Button type="button" size="sm" onClick={() => createOnDate(selectedDate)}><Plus className="h-3.5 w-3.5" /> Create on this date</Button> : null}
                </div>
              ) : selectedItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <button type="button" className="w-full text-left" onClick={() => openWorkItem(item.id)}>
                    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.key}</Badge><span className="font-medium">{item.title}</span></div>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{item.status.replace(/_/g, ' ')}</span>
                    <span>{item.assignee?.name ?? 'Unassigned'}</span>
                    {item.startDate ? <span>{format(new Date(item.startDate), 'MMM d')}</span> : null}
                    {item.dueDate ? <span>→ {format(new Date(item.dueDate), 'MMM d')}</span> : null}
                  </div>
                  {canUpdate && item.startDate ? (
                    <div className="mt-3 flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-0" onClick={() => resizeItem(item, -1)} disabled={Boolean(savingItemId) || !item.dueDate || differenceInCalendarDays(new Date(item.dueDate), new Date(item.startDate)) < 1}>Shorten</Button>
                      <Button type="button" variant="outline" size="sm" className="min-h-11 sm:min-h-0" onClick={() => resizeItem(item, 1)} disabled={Boolean(savingItemId)}>Extend 1 day</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Unscheduled work <Badge variant="secondary" className="ml-1">{visibleUnscheduled.length}</Badge></CardTitle></CardHeader>
            <CardContent className="max-h-[360px] space-y-2 overflow-auto">
              {visibleUnscheduled.length === 0 ? <p className="text-sm text-muted-foreground">No unscheduled work matches the current filters.</p> : visibleUnscheduled.map((item) => (
                <div key={item.id} draggable={canUpdate} onDragStart={(event) => { event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move' }} className="rounded-xl border border-border/70 p-3">
                  <button type="button" className="w-full text-left" onClick={() => openWorkItem(item.id)}><span className="font-mono text-xs text-muted-foreground">{item.key}</span><p className="mt-1 text-sm font-medium">{item.title}</p></button>
                  {selectedDate && canUpdate ? <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => moveToDate(item, selectedDate)}>Schedule {format(selectedDate, 'MMM d')}</Button> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
