'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { fetchWithRetry, getApiErrorMessage, parseJsonResponse } from '@/lib/utils'
import { toIssueQueryParams } from '@/lib/domain/issue-filters'

/**
 * Truncation notice and pager for work-item views.
 *
 * The client loads a capped page of work items and every view then filters,
 * sorts and searches that array locally. A project with more items than the cap
 * therefore showed an incomplete board and backlog **with no indication that
 * anything was missing**, and "search" only ever searched the loaded window.
 *
 * This makes the shortfall explicit and offers two ways out: load more, or push
 * the current filters to the server so the query covers the whole project
 * rather than the loaded page.
 */
export function IssueLoadMore({ className }: { className?: string }) {
  const {
    currentProject,
    filters,
    issues,
    issueTotal,
    issuePageSize,
    workItemTypeFilter,
    appendIssues,
    setIssues,
  } = useAppStore()

  const [isLoading, setIsLoading] = useState(false)

  const loaded = issues.length
  const hasMore = issueTotal > loaded

  const loadMore = useCallback(async () => {
    if (!currentProject) return
    setIsLoading(true)

    try {
      // Offset paging over a stable order; the list endpoint sorts by
      // parent/columnOrder/createdAt, which does not shift under normal use.
      const params = new URLSearchParams({
        projectId: currentProject.id,
        page: String(Math.floor(loaded / issuePageSize) + 1),
        pageSize: String(issuePageSize),
        includeTotal: 'true',
      })

      const response = await fetchWithRetry(`/api/issues?${params}`, {
        timeoutMs: 10_000,
        retries: 1,
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to load more work items'))
      }

      const payload = await parseJsonResponse<unknown>(response, null)
      if (!Array.isArray(payload)) throw new Error('Work items returned malformed data')

      appendIssues(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load more work items')
    } finally {
      setIsLoading(false)
    }
  }, [appendIssues, currentProject, issuePageSize, loaded])

  const searchWholeProject = useCallback(async () => {
    if (!currentProject) return
    setIsLoading(true)

    try {
      // Push the active filters to the server so results cover every work item,
      // not only the page already in memory.
      const params = toIssueQueryParams(filters, { workItemTypeTab: workItemTypeFilter })
      params.set('projectId', currentProject.id)
      params.set('pageSize', String(issuePageSize))
      params.set('includeTotal', 'true')

      const response = await fetchWithRetry(`/api/issues?${params}`, {
        timeoutMs: 10_000,
        retries: 1,
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Search failed'))
      }

      const payload = await parseJsonResponse<unknown>(response, null)
      if (!Array.isArray(payload)) throw new Error('Search returned malformed data')

      setIssues(payload, {
        total: Number(response.headers.get('x-total-count')) || payload.length,
        pageSize: issuePageSize,
      })

      toast.success(`Searched all ${issueTotal} work items`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }, [currentProject, filters, issuePageSize, issueTotal, setIssues, workItemTypeFilter])

  if (!hasMore) return null

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 ${className ?? ''}`}
      role="status"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-status-in-review" aria-hidden="true" />

      <p className="flex-1 text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular-nums">{loaded}</span> of{' '}
        <span className="font-medium text-foreground tabular-nums">{issueTotal}</span> work items.
        Filters and search apply only to what is loaded.
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={searchWholeProject} disabled={isLoading}>
          Search all
        </Button>
        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={loadMore} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          Load more
        </Button>
      </div>
    </div>
  )
}
