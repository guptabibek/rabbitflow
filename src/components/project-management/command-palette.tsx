'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  FileText,
  FolderKanban,
  User,
  MessageSquare,
  BookOpen,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

type SearchResult = {
  id: string
  type: 'issue' | 'project' | 'comment' | 'user' | 'document'
  title: string
  subtitle?: string
  relevance: number
}

const TYPE_ICONS: Record<string, typeof Search> = {
  issue: FileText,
  project: FolderKanban,
  user: User,
  comment: MessageSquare,
  document: BookOpen,
}

const TYPE_LABELS: Record<string, string> = {
  issue: 'Work Items',
  project: 'Projects',
  user: 'People',
  comment: 'Comments',
  document: 'Documents',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openWorkItem = useAppStore((s) => s.openWorkItem)

  // Register Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }
      if (e.key === '/') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setSearchError(null)
      return
    }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Search failed'))
      }

      const data = await res.json()
      setResults(data.items ?? data.results ?? [])
      setSearchError(null)
    } catch (error) {
      setResults([])
      setSearchError(error instanceof Error ? error.message : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, doSearch])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    if (result.type === 'issue') {
      openWorkItem(result.id)
    }
    // For other types, could navigate
  }

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search work items, projects, people..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {!isSearching && query.length >= 2 && results.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}

        {isSearching && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Searching...
          </div>
        )}

        {searchError && !isSearching && (
          <div className="px-2 py-6 text-center text-sm text-destructive">
            {searchError}
          </div>
        )}

        {Object.entries(grouped).map(([type, items]) => {
          const Icon = TYPE_ICONS[type] ?? Search
          return (
            <CommandGroup key={type} heading={TYPE_LABELS[type] ?? type}>
              {items.map((item) => (
                <CommandItem
                  key={`${item.type}-${item.id}`}
                  value={`${item.title} ${item.subtitle ?? ''}`}
                  onSelect={() => handleSelect(item)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {type}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}
