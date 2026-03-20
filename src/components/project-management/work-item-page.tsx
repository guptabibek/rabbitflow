'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { WorkItemDetailContent, type WorkItemBootstrapPayload } from '@/components/project-management/issue-detail-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export function WorkItemPage({ issueId }: { issueId: string }) {
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

  if (isLoading && !payload) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border px-6 py-4">
          <Skeleton className="h-9 w-56" />
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-[540px] w-full" />
        </div>
      </div>
    )
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <p className="text-sm text-muted-foreground">{error || 'Work item not found'}</p>
          <Button onClick={() => router.push('/')}>Return to project</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gradient-to-b from-background via-background to-muted/10">
      <header className="border-b border-border/80 bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2"
            onClick={() => {
              if (window.history.length > 1) {
                router.back()
                return
              }
              router.push('/')
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Workspace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2"
            onClick={() => void loadWorkItem()}
          >
            <Loader2 className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        <div className="mx-auto h-full max-w-[1600px] overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
          <WorkItemDetailContent
            payload={payload}
            isRefreshing={isLoading}
            onReload={() => void loadWorkItem()}
            onIssueUpdated={(issue) => setPayload((previous) => (previous ? { ...previous, issue } : previous))}
          />
        </div>
      </div>
    </div>
  )
}
