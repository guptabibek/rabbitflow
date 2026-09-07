'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { getApiErrorMessage, parseJsonResponse } from '@/lib/utils'

/*
  The preference matrix.

  `/api/notifications/preferences` has returned a full two-channel by
  seven-category matrix, and accepted writes to it, since notifications were
  built. Nothing in the product reached it, so every account received every
  notification on both channels with no way to say otherwise.

  The route writes one cell at a time (`{ channel, category, enabled }`), so
  each switch is its own request. That keeps the interaction honest: a failed
  write reverts one switch rather than silently discarding a whole form.
*/

const CHANNELS = [
  { id: 'in_app', label: 'In-app' },
  { id: 'email', label: 'Email' },
] as const

const CATEGORIES = [
  {
    id: 'mentions',
    label: 'Mentions',
    description: 'Someone writes @you in a comment or description',
  },
  {
    id: 'assignments',
    label: 'Assignments',
    description: 'A work item is assigned to you, or reassigned away',
  },
  {
    id: 'comments',
    label: 'Comments',
    description: 'New replies on work items you reported or are assigned',
  },
  {
    id: 'status_updates',
    label: 'Status changes',
    description: 'Work you follow moves between workflow states',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    description: 'A decision is waiting on you, or yours is answered',
  },
  {
    id: 'sla',
    label: 'SLA warnings',
    description: 'A timer you own is close to breaching, or has breached',
  },
  {
    id: 'system',
    label: 'System',
    description: 'Import results, automation failures and webhook errors',
  },
] as const

type ChannelId = (typeof CHANNELS)[number]['id']
type CategoryId = (typeof CATEGORIES)[number]['id']
type Matrix = Record<string, Record<string, boolean>>

export function NotificationPreferences() {
  const [matrix, setMatrix] = useState<Matrix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Keyed `channel:category` so two switches can be in flight at once without
  // either disabling the other.
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/notifications/preferences')

      if (!response.ok) {
        setError(await getApiErrorMessage(response, 'Failed to load notification preferences'))
        return
      }

      const data = await parseJsonResponse<Matrix | null>(response, null)

      if (!data || typeof data !== 'object') {
        setError('Notification preferences returned malformed data.')
        return
      }

      setMatrix(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load notification preferences')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (channel: ChannelId, category: CategoryId, enabled: boolean) => {
    const key = `${channel}:${category}`

    // Optimistic: the switch moves under the finger, and reverts only if the
    // write is refused.
    setMatrix((previous) =>
      previous
        ? { ...previous, [channel]: { ...previous[channel], [category]: enabled } }
        : previous
    )
    setSaving((previous) => new Set(previous).add(key))

    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, category, enabled }),
      })

      if (!response.ok) {
        setMatrix((previous) =>
          previous
            ? { ...previous, [channel]: { ...previous[channel], [category]: !enabled } }
            : previous
        )
        toast.error(await getApiErrorMessage(response, 'Could not save that preference'))
      }
    } catch (caught) {
      setMatrix((previous) =>
        previous
          ? { ...previous, [channel]: { ...previous[channel], [category]: !enabled } }
          : previous
      )
      toast.error(caught instanceof Error ? caught.message : 'Could not save that preference')
    } finally {
      setSaving((previous) => {
        const next = new Set(previous)
        next.delete(key)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading notification preferences">
        {CATEGORIES.map((category) => (
          <div key={category.id} className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <div className="flex shrink-0 gap-6">
              <Skeleton className="h-5 w-9 rounded-full" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error || !matrix) {
    return (
      <ErrorState
        title="Preferences did not load"
        description="Your notification settings could not be read. Nothing has changed."
        detail={error}
        onRetry={() => void load()}
        size="sm"
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="type-meta text-muted-foreground">
        Turn off anything you do not want to hear about. Changes save as you make them.
      </p>

      {/* Channel headings, aligned over the switch columns. */}
      <div className="flex items-end justify-between gap-4 border-b pb-2">
        <span className="type-label text-muted-foreground">Notify me about</span>
        <div className="flex shrink-0 gap-6">
          {CHANNELS.map((channel) => (
            <span
              key={channel.id}
              className="type-label w-9 text-center text-muted-foreground"
            >
              {channel.label}
            </span>
          ))}
        </div>
      </div>

      <div className="divide-y">
        {CATEGORIES.map((category) => (
          <div key={category.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="type-body font-medium text-foreground">{category.label}</p>
              <p className="type-meta text-muted-foreground">{category.description}</p>
            </div>

            <div className="flex shrink-0 gap-6">
              {CHANNELS.map((channel) => {
                const key = `${channel.id}:${category.id}`
                const checked = matrix[channel.id]?.[category.id] ?? true

                return (
                  <div key={channel.id} className="flex w-9 justify-center">
                    <Switch
                      checked={checked}
                      disabled={saving.has(key)}
                      onCheckedChange={(next) => void toggle(channel.id, category.id, next)}
                      // The visible column heading is not programmatically tied
                      // to the row, so each switch names both axes itself.
                      aria-label={`${category.label} — ${channel.label} notifications`}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
