'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Search,
  FileText,
  FolderKanban,
  User,
  MessageSquare,
  BookOpen,
  AlertTriangle,
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
  issue: 'Work items',
  project: 'Projects',
  user: 'People',
  comment: 'Comments',
  document: 'Documents',
}

const NEVER_CHANGES = () => () => {}

/**
 * ⌘ on Apple hardware, Ctrl everywhere else.
 *
 * `useSyncExternalStore` rather than state-in-an-effect: it is built for a
 * value the server cannot know, returns the server snapshot during hydration,
 * and swaps to the client value without an extra render pass or a hydration
 * mismatch warning.
 */
function useShortcutSymbol() {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'),
    () => 'Ctrl'
  )
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openWorkItem = useAppStore((s) => s.openWorkItem)
  const shortcut = useShortcutSymbol()

  // Register Cmd+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([])
      setSearchError(null)
      return
    }

    setIsSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Search failed'))
      }
      const data = await res.json()
      setResults(data.results ?? [])
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
  }

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  return (
    <>
      {/*
        The palette used to be keyboard-only: this component rendered nothing
        but the dialog, so the product's global search existed and was
        invisible. On a wide window it is a real search affordance with its
        shortcut printed on it; below sm it collapses to the icon rather than
        disappearing.
      */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(true)}
            aria-label="Search"
            aria-keyshortcuts="Control+K Meta+K"
            className="gap-1.5 px-1.5 text-muted-foreground lg:w-52 lg:justify-start lg:border lg:border-border lg:bg-card lg:px-2 lg:font-normal lg:hover:bg-surface-hover"
          >
            <Search />
            <span className="hidden lg:inline">Search</span>
            <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-border bg-surface-sunken px-1 font-mono text-[10px] text-muted-foreground lg:inline-flex">
              {shortcut}K
            </kbd>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="lg:hidden">
          Search ({shortcut}K)
        </TooltipContent>
      </Tooltip>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Find work items, projects, people and documents">
        <CommandInput
          placeholder="Search work items, projects, people…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {/* Before you have typed enough to search, say what this searches
              rather than showing an empty box that looks broken. */}
          {query.length < 2 && !isSearching ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-foreground">Search this workspace</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Work items, projects, people, comments and documents. Type at least two
                characters.
              </p>
            </div>
          ) : null}

          {isSearching ? (
            <div className="space-y-2 p-3" role="status" aria-label="Searching">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-center gap-2">
                  <Skeleton className="size-4 shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : null}

          {searchError && !isSearching ? (
            <div className="flex items-start gap-2 px-4 py-6 text-left">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-medium text-foreground">Search is unavailable</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The search service did not respond. Try again in a moment.
                </p>
              </div>
            </div>
          ) : null}

          {!isSearching && !searchError && query.length >= 2 && results.length === 0 ? (
            <CommandEmpty>
              <span className="block text-[13px] text-foreground">
                Nothing matches “{query}”
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Try a work-item key such as APEX-1, or fewer words.
              </span>
            </CommandEmpty>
          ) : null}

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
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{item.title}</div>
                      {item.subtitle ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </div>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}
