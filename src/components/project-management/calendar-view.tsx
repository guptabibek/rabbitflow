'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, isSameDay } from 'date-fns'
import { useAppStore } from '@/store/app-store'
import { useProjectCollaboration } from '@/hooks/use-project-collaboration'
import { PresenceStrip } from '@/components/project-management/presence-strip'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getApiErrorMessage } from '@/lib/utils'

type CalendarItem = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  workItemType: string
  startDate: string | null
  dueDate: string | null
  assignee: { id: string; name: string; avatar: string | null } | null
}

export function CalendarView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentUser = useAppStore((state) => state.currentUser)
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const collaboration = useProjectCollaboration(currentProject?.id ?? null, 'calendar')

  useEffect(() => {
    if (!currentProject) return

    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)

      fetch(`/api/calendar?projectId=${currentProject.id}&month=${month.toISOString()}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, 'Failed to load calendar'))
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
            setError(loadError instanceof Error ? loadError.message : 'Failed to load calendar')
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
  }, [collaboration.refreshToken, currentProject, month])

  const selectedItems = useMemo(() => {
    if (!selectedDate) return []
    return items.filter((item) => {
      const start = item.startDate ? new Date(item.startDate) : null
      const due = item.dueDate ? new Date(item.dueDate) : null
      return (start && isSameDay(start, selectedDate)) || (due && isSameDay(due, selectedDate))
    })
  }, [items, selectedDate])

  if (!currentProject) return null

  return (
    <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Calendar View</CardTitle>
            <p className="text-sm text-muted-foreground">Scheduled work across start and due dates.</p>
          </div>
          <PresenceStrip presence={collaboration.presence} currentUserId={currentUser?.id} />
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            month={month}
            onMonthChange={setMonth}
          />
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-xl border border-border/70 bg-card/60 p-3">
              <div className="font-medium text-foreground">{items.length}</div>
              Scheduled items this month
            </div>
            <div className="rounded-xl border border-border/70 bg-card/60 p-3">
              <div className="font-medium text-foreground">{selectedItems.length}</div>
              Items on selected day
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading calendar items…</div>
          ) : selectedItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">No scheduled work on the selected day.</div>
          ) : (
            selectedItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.key}</Badge>
                  <span className="font-medium">{item.title}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{item.workItemType}</span>
                  <span>{item.status.replace(/_/g, ' ')}</span>
                  {item.startDate ? <span>Starts {format(new Date(item.startDate), 'MMM d')}</span> : null}
                  {item.dueDate ? <span>Due {format(new Date(item.dueDate), 'MMM d')}</span> : null}
                  <span>{item.assignee ? `Owner: ${item.assignee.name}` : 'Unassigned'}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}