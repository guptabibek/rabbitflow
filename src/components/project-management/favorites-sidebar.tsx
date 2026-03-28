'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Star,
  FileText,
  FolderKanban,
  Layers,
  BookOpen,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Favorite {
  id: string
  entityType: 'project' | 'issue' | 'view' | 'document'
  entityId: string
  createdAt: string
  entity?: {
    id: string
    name?: string
    title?: string
    identifier?: string
  }
}

interface FavoritesSidebarProps {
  onNavigate?: (entityType: string, entityId: string) => void
}

const ICON_MAP: Record<string, React.ElementType> = {
  project: FolderKanban,
  issue: Layers,
  view: FileText,
  document: BookOpen,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FavoritesSidebar({ onNavigate }: FavoritesSidebarProps) {
  const { currentProject } = useAppStore()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)

  const fetchFavorites = useCallback(async () => {
    setLoading(true)
    try {
      const url = currentProject
        ? `/api/favorites?projectId=${currentProject.id}`
        : '/api/favorites'
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load favorites'))
      }
      const data = await res.json()
      setFavorites(data.favorites ?? data)
    } catch (error) {
      setFavorites([])
      toast.error(error instanceof Error ? error.message : 'Failed to load favorites')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchFavorites() }, [fetchFavorites])

  const handleToggle = async (entityType: string, entityId: string) => {
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update favorites'))
      }

      await fetchFavorites()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update favorites')
    }
  }

  if (loading) {
    return (
      <div className="space-y-1.5 px-2 py-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
      </div>
    )
  }

  if (favorites.length === 0) return null

  return (
    <div className="px-2 py-2">
      <h4 className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Star className="h-3 w-3" />
        Favorites
      </h4>
      <div className="space-y-0.5">
        {favorites.map((fav) => {
          const Icon = ICON_MAP[fav.entityType] || Layers
          const label =
            fav.entity?.name ||
            fav.entity?.title ||
            fav.entity?.identifier ||
            fav.entityId.slice(0, 8)
          return (
            <div
              key={fav.id}
              className="group flex items-center gap-1 rounded-md hover:bg-accent transition-colors"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-sm"
                onClick={() => onNavigate?.(fav.entityType, fav.entityId)}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate flex-1 text-left">{label}</span>
              </button>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleToggle(fav.entityType, fav.entityId)
                }}
              >
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
