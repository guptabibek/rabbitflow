'use client'

import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, endOfWeek, format, max, min, startOfWeek } from 'date-fns'
import { useAppStore } from '@/store/app-store'
import { useProjectCollaboration } from '@/hooks/use-project-collaboration'
import { PresenceStrip } from '@/components/project-management/presence-strip'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getApiErrorMessage } from '@/lib/utils'

type RoadmapItem = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  workItemType: string
  hierarchyLevel: number
  startDate: string
  endDate: string
  epicGroupId: string | null
  epicGroupLabel: string
  dependencies: Array<{ id: string; relationType: string; targetIssueId: string }>
}

export function RoadmapView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentUser = useAppStore((state) => state.currentUser)
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const collaboration = useProjectCollaboration(currentProject?.id ?? null, 'roadmap')

  useEffect(() => {
    if (!currentProject) return

    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)

      fetch(`/api/roadmap?projectId=${currentProject.id}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, 'Failed to load roadmap'))
          }
          return response.json()
        })
        .then((payload) => {
          if (!cancelled) {
            setItems(payload.items ?? [])
            setError(null)
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setItems([])
            setError(loadError instanceof Error ? loadError.message : 'Failed to load roadmap')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [collaboration.refreshToken, currentProject])

  const groups = useMemo(() => {
    const sorted = [...items].sort(
      (left, right) => new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
    )

    return sorted.reduce<Record<string, RoadmapItem[]>>((accumulator, item) => {
      if (!accumulator[item.epicGroupLabel]) {
        accumulator[item.epicGroupLabel] = []
      }
      accumulator[item.epicGroupLabel].push(item)
      return accumulator
    }, {})
  }, [items])

  const range = useMemo(() => {
    if (items.length === 0) return null
    const minDate = startOfWeek(min(items.map((item) => new Date(item.startDate))), { weekStartsOn: 1 })
    const maxDate = endOfWeek(max(items.map((item) => new Date(item.endDate))), { weekStartsOn: 1 })
    const totalDays = Math.max(differenceInCalendarDays(maxDate, minDate) + 1, 1)
    const ticks = Array.from({ length: Math.ceil(totalDays / 7) + 1 }, (_, index) => {
      const tickDate = new Date(minDate)
      tickDate.setDate(minDate.getDate() + index * 7)
      return tickDate
    })
    return { minDate, maxDate, totalDays, ticks }
  }, [items])

  if (!currentProject) return null

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Roadmap / Timeline</CardTitle>
            <p className="text-sm text-muted-foreground">
              Gantt-style planning with epic grouping and dependency visibility.
            </p>
          </div>
          <PresenceStrip presence={collaboration.presence} currentUserId={currentUser?.id} />
        </CardHeader>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading roadmap…</CardContent>
        </Card>
      ) : items.length === 0 || !range ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {error || 'No roadmap items with schedule data yet. Add start dates, due dates, or epic children to populate the timeline.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[980px] p-4">
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{groupLabel}</h3>
                      <Badge variant="secondary">{groupItems.length} items</Badge>
                    </div>

                    {groupItems.map((item) => {
                      const startOffset =
                        (differenceInCalendarDays(new Date(item.startDate), range.minDate) / range.totalDays) * 100
                      const width =
                        ((differenceInCalendarDays(new Date(item.endDate), new Date(item.startDate)) + 1) / range.totalDays) * 100

                      return (
                        <div key={item.id} className="grid grid-cols-[260px_1fr] gap-4">
                          <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-sm">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {item.key}
                            </div>
                            <div className="mt-1 text-sm font-medium leading-snug">{item.title}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge variant="outline">{item.workItemType}</Badge>
                              <Badge variant="secondary">{item.status.replace(/_/g, ' ')}</Badge>
                              {item.dependencies.length > 0 ? (
                                <Badge variant="outline">{item.dependencies.length} deps</Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="relative h-20 rounded-2xl border border-border/70 bg-muted/30">
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
                              className="absolute top-5 flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg"
                              style={{ left: `${startOffset}%`, width: `${Math.max(width, 4)}%` }}
                            >
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