'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Bell,
  CheckCheck,
  MessageSquare,
  UserPlus,
  AlertCircle,
  ArrowRightLeft,
  AtSign,
} from 'lucide-react'
import { fetchWithRetry, getApiErrorMessage, parseJsonResponse } from '@/lib/utils'

type Notification = {
  id: string
  type: string
  title: string
  body: string | null
  isRead: boolean
  isArchived: boolean
  entityType: string | null
  entityId: string | null
  createdAt: string
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  assignment: UserPlus,
  comment: MessageSquare,
  status_change: AlertCircle,
  state_transition: ArrowRightLeft,
  mention: AtSign,
  automation_failed: AlertCircle,
  webhook_failed: AlertCircle,
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const openWorkItem = useAppStore((s) => s.openWorkItem)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Read inside the SSE handler so a change of either does not tear down and
  // rebuild the connection.
  const openRef = useRef(open)
  const lastCountRef = useRef(0)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const fetchNotifications = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoadError('You are offline. Showing the last known notifications.')
      return
    }

    const nextErrors: string[] = []

    try {
      const [notificationsResult, unreadCountResult] = await Promise.allSettled([
        fetchWithRetry('/api/notifications?pageSize=20', { timeoutMs: 6_000, retries: 1 }),
        fetchWithRetry('/api/notifications?countOnly=true', { timeoutMs: 6_000, retries: 1 }),
      ])

      if (notificationsResult.status === 'fulfilled') {
        if (notificationsResult.value.ok) {
          const data = await parseJsonResponse<Notification[] | { notifications?: Notification[] } | null>(
            notificationsResult.value,
            null
          )

          if (Array.isArray(data)) {
            setNotifications(data)
          } else if (Array.isArray(data?.notifications)) {
            setNotifications(data.notifications)
          } else {
            nextErrors.push('Notifications returned malformed data.')
          }
        } else {
          nextErrors.push(
            await getApiErrorMessage(notificationsResult.value, 'Failed to load notifications')
          )
        }
      } else {
        nextErrors.push('Failed to load notifications')
      }

      if (unreadCountResult.status === 'fulfilled') {
        if (unreadCountResult.value.ok) {
          const count = await parseJsonResponse<{ unreadCount?: number } | null>(
            unreadCountResult.value,
            null
          )

          if (count && typeof count.unreadCount === 'number') {
            setUnreadCount(count.unreadCount)
          } else {
            nextErrors.push('Unread count returned malformed data.')
          }
        } else {
          nextErrors.push(
            await getApiErrorMessage(unreadCountResult.value, 'Failed to load unread count')
          )
        }
      } else {
        nextErrors.push('Failed to load unread count')
      }

      setLoadError(nextErrors.length > 0 ? nextErrors.join(' ') : null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to refresh notifications')
    }
  }, [])

  /*
    Live unread count over SSE, with a slow poll behind it as a safety net.

    This used to refetch the list *and* the count on a 30s interval — 240
    requests an hour from every open tab, whether or not anything had changed.
    `/api/notifications/stream` already existed and pushed exactly this count;
    nothing subscribed to it.

    The list is only refetched when the count actually moves and the popover is
    on screen. Opening the popover fetches it anyway, so a badge change while
    the panel is shut costs nothing.
  */
  useEffect(() => {
    void fetchNotifications()

    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let disposed = false

    const connect = () => {
      if (disposed) return

      source = new EventSource('/api/notifications/stream')

      source.onopen = () => {
        attempts = 0
      }

      source.onmessage = (event) => {
        let payload: { type?: string; count?: number }

        try {
          payload = JSON.parse(event.data) as { type?: string; count?: number }
        } catch {
          return
        }

        if (payload.type !== 'unread_count' || typeof payload.count !== 'number') return

        const next = payload.count
        setUnreadCount(next)

        if (next !== lastCountRef.current) {
          lastCountRef.current = next
          if (openRef.current) void fetchNotifications()
        }
      }

      source.onerror = () => {
        source?.close()
        source = null

        if (disposed) return

        /*
          The route closes the stream every five minutes by design, so a
          disconnect is routine rather than a fault. Reconnect with capped
          backoff regardless, so a genuine outage cannot turn this into a
          tight reconnect loop.
        */
        attempts += 1
        reconnectTimer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5)))
      }
    }

    connect()

    // For browsers or proxies that drop SSE entirely, so the badge still
    // converges rather than freezing at its mount value.
    pollRef.current = setInterval(() => {
      void fetchNotifications()
    }, 300_000)

    return () => {
      disposed = true
      source?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchNotifications])

  useEffect(() => {
    const handleOnline = () => {
      setLoadError(null)
      void fetchNotifications()
    }

    const handleOffline = () => {
      setLoadError('You are offline. Showing the last known notifications.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [fetchNotifications])

  // Refresh when popover opens
  useEffect(() => {
    if (open) {
      void fetchNotifications()
    }
  }, [open, fetchNotifications])

  const markRead = async (id: string) => {
    let response: Response

    try {
      response = await fetchWithRetry(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read' }),
        timeoutMs: 6_000,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark notification as read')
      void fetchNotifications()
      return
    }

    if (!response.ok) {
      toast.error(await getApiErrorMessage(response, 'Failed to mark notification as read'))
      void fetchNotifications()
      return
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const markAllRead = async () => {
    let response: Response

    try {
      response = await fetchWithRetry('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
        timeoutMs: 6_000,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark notifications as read')
      void fetchNotifications()
      return
    }

    if (!response.ok) {
      toast.error(await getApiErrorMessage(response, 'Failed to mark notifications as read'))
      void fetchNotifications()
      return
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  const handleClick = (notif: Notification) => {
    if (!notif.isRead) {
      void markRead(notif.id)
    }
    if (notif.entityType === 'issue' && notif.entityId) {
      openWorkItem(notif.entityId)
      setOpen(false)
    }
  }

  const timeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications" data-testid="notification-bell-button">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1" data-testid="notification-unread-count">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0"
        align="end"
        sideOffset={8}
        data-testid="notification-panel"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={markAllRead}
              data-testid="notification-mark-all-read-button"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        {loadError ? (
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-destructive" data-testid="notification-load-error">
            <span>{loadError}</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => void fetchNotifications()} data-testid="notification-retry-button">
              Retry
            </Button>
          </div>
        ) : null}

        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground" data-testid="notification-empty-state">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notif) => {
                const Icon = TYPE_ICONS[notif.type] ?? Bell
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    data-testid={`notification-item-${notif.id}`}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors flex gap-3 ${
                      !notif.isRead ? 'bg-accent/20' : ''
                    }`}
                  >
                    <div className="mt-0.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${!notif.isRead ? 'font-medium' : ''}`}>
                        {notif.title}
                      </div>
                      {notif.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {notif.body}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {timeAgo(notif.createdAt)}
                      </div>
                    </div>
                    {!notif.isRead && (
                      <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
