'use client'

import { useEffect, useState } from 'react'

export type CollaborationPresence = {
  userId: string
  name: string
  avatar: string | null
  projectId: string
  view: string | null
  issueId: string | null
  updatedAt: string
}

export type CollaborationActivity = {
  id: string
  action: string
  details: string | null
  createdAt: string
  user: { id: string; name: string; avatar: string | null }
  issue?: { id: string; key: string; title: string; areaId: string | null } | null
}

type SnapshotEvent = {
  type: 'snapshot'
  presence: CollaborationPresence[]
  activity: CollaborationActivity[]
  emittedAt: string
}

export function useProjectCollaboration(
  projectId: string | null,
  view: string,
  issueId?: string | null
) {
  const [presence, setPresence] = useState<CollaborationPresence[]>([])
  const [activity, setActivity] = useState<CollaborationActivity[]>([])
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    let eventSource: EventSource | null = null

    const heartbeat = async () => {
      try {
        await fetch('/api/realtime/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, view, issueId: issueId ?? null }),
        })
      } catch {
        // Presence heartbeats are best-effort only.
      }
    }

    const connect = () => {
      eventSource = new EventSource(`/api/realtime/project/stream?projectId=${projectId}`)
      eventSource.onmessage = (event) => {
        if (cancelled) return

        try {
          const payload = JSON.parse(event.data) as SnapshotEvent
          if (payload.type !== 'snapshot') return

          setPresence(payload.presence)
          setActivity(payload.activity)
          setRefreshToken((value) => value + 1)
        } catch {
          // Ignore malformed events and keep the stream alive.
        }
      }
      eventSource.onerror = () => {
        eventSource?.close()
        if (!cancelled) {
          setTimeout(connect, 1500)
        }
      }
    }

    void heartbeat()
    const heartbeatInterval = window.setInterval(() => {
      void heartbeat()
    }, 15_000)

    connect()

    return () => {
      cancelled = true
      window.clearInterval(heartbeatInterval)
      eventSource?.close()
    }
  }, [issueId, projectId, view])

  return {
    presence: projectId ? presence : [],
    activity: projectId ? activity : [],
    refreshToken,
  }
}