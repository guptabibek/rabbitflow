'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useAppStore } from '@/store/app-store'
import { useProjectCollaboration } from '@/hooks/use-project-collaboration'
import { PresenceStrip } from '@/components/project-management/presence-strip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getApiErrorMessage } from '@/lib/utils'

type ActivityItem = {
  id: string
  action: string
  details: string | null
  createdAt: string
  user: { id: string; name: string; avatar: string | null }
  issue?: { id: string; key: string; title: string } | null
}

export function ActivityFeedView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentUser = useAppStore((state) => state.currentUser)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const collaboration = useProjectCollaboration(currentProject?.id ?? null, 'activity')

  useEffect(() => {
    if (!currentProject) return

    let cancelled = false

    const timeout = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)

      fetch(
        `/api/activity?projectId=${currentProject.id}${query ? `&search=${encodeURIComponent(query)}` : ''}`
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, 'Failed to load activity'))
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
            setError(loadError instanceof Error ? loadError.message : 'Failed to load activity')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [collaboration.refreshToken, currentProject, query])

  if (!currentProject) return null

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Activity Feed</CardTitle>
            <p className="text-sm text-muted-foreground">Live project activity with searchable audit details.</p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by issue key, action, or details"
              className="w-full md:w-80"
            />
            <PresenceStrip presence={collaboration.presence} currentUserId={currentUser?.id} />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-4">
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading activity…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity matches the current filters.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={item.user.avatar || undefined} />
                    <AvatarFallback className="text-xs">
                      {item.user.name
                        .split(' ')
                        .map((segment) => segment[0])
                        .join('')
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{item.user.name}</span>
                      <span className="text-muted-foreground">{item.action.replace(/_/g, ' ')}</span>
                      {item.issue ? <span className="text-muted-foreground">on {item.issue.key}</span> : null}
                    </div>
                    {item.details ? <div className="mt-1 text-sm text-muted-foreground">{item.details}</div> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}