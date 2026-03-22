'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { WorkItemDetailContent, type WorkItemBootstrapPayload } from '@/components/project-management/issue-detail-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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

  // --- COMPACT LOADING STATE ---
  if (isLoading && !payload) {
    return (
      <div className={cn("flex flex-col bg-background", embedded ? "h-full" : "min-h-screen")}>
        <div className="flex h-11 items-center border-b border-border/50 px-3">
          <Skeleton className="h-7 w-32 rounded-md" />
        </div>
        <div className="flex-1 space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-6 flex-1 max-w-md" />
          </div>
          <Skeleton className="h-[calc(100vh-150px)] w-full rounded-lg" />
        </div>
      </div>
    )
  }

  // --- ERROR STATE ---
  if (error || !payload) {
    return (
      <div className={cn("flex items-center justify-center bg-background px-6", embedded ? "h-full" : "min-h-screen")}>
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[13px] text-muted-foreground">{error || 'Work item not found'}</p>
          <Button variant="outline" size="sm" onClick={() => embedded && onClose ? onClose() : router.push('/')}>
            {embedded ? 'Close' : 'Return home'}
          </Button>
        </div>
      </div>
    )
  }

  // --- COMPACT MAIN VIEW ---
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Slim Header: Reduced height and padding */}
      <header className="z-10 flex h-11 shrink-0 items-center border-b border-border/50 bg-background/80 px-3 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
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
              {embedded ? <X className="mr-1.5 h-3.5 w-3.5" /> : <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />}
              {embedded ? 'Close' : 'Back'}
            </Button>
            
            <div className="h-3 w-[1px] bg-border/60" /> {/* Tiny separator */}
            
            <span className="truncate text-[12px] font-medium text-muted-foreground">
              {payload.issue.project.name} / {payload.issue.key}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area: No extra container padding, full height usage */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full w-full bg-card/30">
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