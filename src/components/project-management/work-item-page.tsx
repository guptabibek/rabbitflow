'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { WorkItemDetailContent, type WorkItemBootstrapPayload } from '@/components/project-management/issue-detail-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TypeIcon } from '@/components/project-management/work-item-indicators'
import { cn } from '@/lib/utils'

export function WorkItemPage({ issueId, embedded, onClose }: { issueId: string; embedded?: boolean; onClose?: () => void }) {
  const router = useRouter()
  const [payload, setPayload] = useState<WorkItemBootstrapPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadWorkItem = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/issues/${issueId}?mode=bootstrap`, {
        cache: 'no-store',
      })

      if (response.status === 401) {
        router.replace('/login')
        return
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setError(payload.error || 'Work item not found')
        setPayload(null)
        return
      }

      const nextPayload = (await response.json()) as WorkItemBootstrapPayload
      setPayload(nextPayload)

      void fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: nextPayload.issue.project.id }),
      })
    } catch (caughtError) {
      console.error('Failed to load work item page:', caughtError)
      setError('Failed to load work item')
      setPayload(null)
    } finally {
      setIsLoading(false)
    }
  }, [issueId, router])

  useEffect(() => {
    void loadWorkItem()
  }, [loadWorkItem])

  // Mirrors the real page: a 44px bar, the title row, then the two-column
  // body. Nothing shifts position when the payload lands.
  if (isLoading && !payload) {
    return (
      <div className={cn('flex flex-col bg-background', embedded ? 'h-full' : 'min-h-dvh')}>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 max-w-md flex-1" />
          <Skeleton className="h-8 w-16" />
        </div>
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <Skeleton className="h-full flex-1" />
          <Skeleton className="hidden h-full w-80 lg:block" />
        </div>
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-background px-6',
          embedded ? 'h-full' : 'min-h-dvh'
        )}
      >
        <ErrorState
          title="This work item could not be opened"
          description="It may have been deleted, or you may not have access to the project it belongs to."
          detail={error}
          onRetry={() => void loadWorkItem()}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (embedded && onClose ? onClose() : router.push('/'))}
            >
              {embedded ? 'Close' : 'Back to workspace'}
            </Button>
          }
        />
      </div>
    )
  }

  // --- COMPACT MAIN VIEW ---
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/*
        The item's own chrome. It sits under the workspace top bar, which
        already says which project and section you are in, so this bar answers
        only the next question — which item, and how do I get out of it.

        The version it replaces repeated the project name the top bar was
        showing and put the exit behind a text label competing with it for
        first position. Here the exit is the same corner icon every overlay in
        this product uses, and the space goes to the item's own identity.
      */}
      <header className="z-10 flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={embedded ? 'Close work item' : 'Back'}
              onClick={() => {
                if (embedded && onClose) {
                  onClose()
                  return
                }
                if (window.history.length > 1) {
                  router.back()
                  return
                }
                router.push('/')
              }}
            >
              {embedded ? <X /> : <ArrowLeft />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{embedded ? 'Close' : 'Back'}</TooltipContent>
        </Tooltip>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          <TypeIcon type={payload.issue.workItemType} />
          <span className="shrink-0 font-mono text-[12px] font-medium text-foreground">
            {payload.issue.key}
          </span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground/50">
            ·
          </span>
          <span className="truncate text-[12px] text-muted-foreground">
            {payload.issue.title}
          </span>
        </nav>

        {isLoading ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Syncing
          </span>
        ) : null}
      </header>

      {/* Main Content Area: No extra container padding, full height usage */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full w-full">
          <WorkItemDetailContent
            payload={payload}
            isRefreshing={isLoading}
            onReload={() => void loadWorkItem()}
            onIssueUpdated={(issue) => setPayload((previous) => (previous ? { ...previous, issue } : previous))}
          />
        </div>
      </main>
    </div>
  )
}