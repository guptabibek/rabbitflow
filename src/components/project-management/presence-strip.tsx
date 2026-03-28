'use client'

import { formatDistanceToNow } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

type PresenceItem = {
  userId: string
  name: string
  avatar: string | null
  view: string | null
  updatedAt: string
}

interface PresenceStripProps {
  presence: PresenceItem[]
  currentUserId?: string | null
}

export function PresenceStrip({ presence, currentUserId }: PresenceStripProps) {
  const visiblePresence = presence.filter((entry) => entry.userId !== currentUserId)

  if (visiblePresence.length === 0) {
    return (
      <Badge variant="outline" className="border-dashed text-xs text-muted-foreground">
        No active collaborators
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visiblePresence.slice(0, 5).map((entry) => (
        <div
          key={entry.userId}
          className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2 py-1"
          title={`${entry.name} · ${entry.view ?? 'workspace'} · active ${formatDistanceToNow(new Date(entry.updatedAt), { addSuffix: true })}`}
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={entry.avatar || undefined} />
            <AvatarFallback className="text-[10px]">
              {entry.name
                .split(' ')
                .map((segment) => segment[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{entry.name}</div>
            <div className="truncate text-[10px] text-muted-foreground">{entry.view ?? 'workspace'}</div>
          </div>
        </div>
      ))}
      {visiblePresence.length > 5 ? (
        <Badge variant="secondary" className="text-xs">
          +{visiblePresence.length - 5}
        </Badge>
      ) : null}
    </div>
  )
}