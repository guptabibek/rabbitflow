'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns'
import { Activity, ListFilter, Search, X } from 'lucide-react'

import { useAppStore } from '@/store/app-store'
import { useProjectCollaboration } from '@/hooks/use-project-collaboration'
import { PresenceStrip } from '@/components/project-management/presence-strip'
import { PageHeader } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getApiErrorMessage } from '@/lib/utils'

type ActivityItem = {
  id: string
  action: string
  details: string | null
  createdAt: string
  user: { id: string; name: string; avatar: string | null }
  issue?: { id: string; key: string; title: string } | null
}

/**
 * The API stores an activity's payload as a JSON string, and the feed used to
 * print it verbatim — users were reading
 * `{"key":"APEX-18","title":"Per-project custom fields","workItemType":"epic"}`
 * as their audit trail.
 *
 * This reads the payload and returns a sentence. Anything it cannot parse or
 * recognise falls back to the raw string rather than being dropped, because an
 * audit log that quietly hides entries it does not understand is worse than an
 * ugly one — but it is truncated so a stray blob cannot take over the row.
 */
function describeDetails(details: string | null): string | null {
  if (!details) return null

  const trimmed = details.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed.slice(0, 160)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return trimmed.slice(0, 160)
  }

  const payload = parsed as Record<string, unknown>
  const str = (value: unknown) => (typeof value === 'string' ? value : null)

  // A field change: "Status: To Do → In Progress".
  const field = str(payload.field) ?? str(payload.property)
  const from = payload.from ?? payload.previous ?? payload.old
  const to = payload.to ?? payload.next ?? payload.new
  if (field && (from !== undefined || to !== undefined)) {
    const label = field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${from ?? '—'} → ${to ?? '—'}`
  }

  // A creation or reference: fall back to the human-readable name in the blob.
  const title = str(payload.title) ?? str(payload.name) ?? str(payload.message)
  if (title) return title

  // Last resort: a compact key list rather than a wall of JSON.
  const keys = Object.keys(payload).slice(0, 4)
  return keys.length > 0 ? keys.join(', ') : null
}

/** Groups entries under Today / Yesterday / a date, the way a log is read. */
function dayLabel(iso: string): string {
  const date = new Date(iso)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, d MMMM yyyy')
}

export function ActivityFeedView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentUser = useAppStore((state) => state.currentUser)
  const openWorkItem = useAppStore((state) => state.openWorkItem)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
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
  }, [collaboration.refreshToken, currentProject, query, reloadToken])

  const groups = useMemo(() => {
    const buckets = new Map<string, ActivityItem[]>()
    for (const item of items) {
      const label = dayLabel(item.createdAt)
      const bucket = buckets.get(label)
      if (bucket) bucket.push(item)
      else buckets.set(label, [item])
    }
    return [...buckets.entries()]
  }, [items])

  if (!currentProject) return null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Activity"
        description="Every change made in this project, most recent first."
        actions={
          <>
            <PresenceStrip presence={collaboration.presence} currentUserId={currentUser?.id} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by key, action or detail"
              aria-label="Filter activity"
              containerClassName="w-full sm:w-64"
              className="h-8"
              icon={<Search />}
              trailing={
                query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear filter"
                    className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : undefined
              }
            />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <ErrorState
            title="Activity could not be loaded"
            description="The audit trail is temporarily unavailable. Nothing has been lost."
            detail={error}
            onRetry={() => setReloadToken((token) => token + 1)}
          />
        ) : loading && items.length === 0 ? (
          <div className="divide-y divide-border/60">
            {Array.from({ length: 10 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2.5 px-4 py-2.5 sm:px-6">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-2.5 w-40" />
                <Skeleton className="h-2.5 flex-1 max-w-sm" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            size="lg"
            icon={query ? ListFilter : Activity}
            title={query ? 'Nothing matches that filter' : 'No activity yet'}
            description={
              query
                ? 'Try a work-item key such as APEX-1, or part of an action name like "status".'
                : 'Creating, assigning and moving work items will all be recorded here.'
            }
            action={
              query ? (
                <Button size="sm" variant="outline" onClick={() => setQuery('')}>
                  Clear filter
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map(([label, entries]) => (
            <section key={label}>
              {/* A sticky day heading rather than a date stamped on every row:
                  in a log of 200 entries the date is context, not content. */}
              <h2 className="type-label sticky top-0 z-10 border-b border-border bg-surface-sunken px-4 py-1.5 sm:px-6">
                {label}
              </h2>
              <ul className="divide-y divide-border/60">
                {entries.map((item) => {
                  const detail = describeDetails(item.details)

                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-2.5 px-4 py-2 transition-colors hover:bg-surface-hover sm:px-6"
                    >
                      <Avatar className="mt-px size-6 shrink-0">
                        <AvatarImage src={item.user.avatar || undefined} />
                        <AvatarFallback className="bg-surface-sunken text-[9px] font-semibold text-muted-foreground">
                          {item.user.name
                            .split(' ')
                            .map((segment) => segment[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug text-foreground">
                          <span className="font-medium">{item.user.name}</span>{' '}
                          <span className="text-muted-foreground">
                            {item.action.replace(/_/g, ' ')}
                          </span>
                          {item.issue ? (
                            <>
                              {' '}
                              <button
                                type="button"
                                onClick={() => item.issue && openWorkItem(item.issue.id)}
                                className="rounded-sm font-mono text-[12px] text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                              >
                                {item.issue.key}
                              </button>
                            </>
                          ) : null}
                        </p>
                        {detail ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
                        ) : null}
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <time
                            dateTime={item.createdAt}
                            className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground"
                          >
                            {format(new Date(item.createdAt), 'HH:mm')}
                          </time>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
