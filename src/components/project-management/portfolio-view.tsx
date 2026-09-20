'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, InlineAlert } from '@/components/ui/states'
import { canonicalWorkspaceRoute } from '@/lib/domain/workspace-route'
import { getApiErrorMessage } from '@/lib/utils'

type Scope = 'all' | 'open' | 'completed' | 'dueSoon' | 'overdue' | 'blocked'
type IssueResult = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  project: { id: string; key: string; name: string; color: string }
  assignee: { id: string; name: string; avatar: string | null } | null
}

type PortfolioPayload = {
  generatedAt: string
  healthExplanation: string
  summary: {
    totalProjects: number
    totalObjectives: number
    objectiveHealth: number | null
    dueSoonCount: number
    overdueCount: number
    blockedCount: number
  }
  projects: Array<{
    id: string
    key: string
    name: string
    color: string
    description: string | null
    members: number
    totalIssues: number
    openIssues: number
    completedIssues: number
    completionRate: number
    dueSoonCount: number
    overdueCount: number
    blockedCount: number
    health: {
      state: 'no_data' | 'healthy' | 'watch' | 'at_risk'
      label: string
      score: number | null
      signals: { openWork: number; overdueWork: number; blockedWork: number; overduePercent: number; blockedPercent: number }
    }
  }>
  objectives: Array<{
    id: string
    title: string
    progress: number
    status: string
    updatedAt: string
    project: { id: string; key: string; name: string; color: string }
  }>
  queryResults: IssueResult[]
  resultCount: number
  resultScope: Scope | 'search' | null
  resultProjectId: string | null
}

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'All work', open: 'Open work', completed: 'Completed work',
  dueSoon: 'Due in the next 7 days', overdue: 'Overdue work', blocked: 'Blocked work',
}

function HealthBadge({ state, label }: { state: string; label: string }) {
  const tone = state === 'healthy' ? 'border-success/30 bg-success/10 text-success'
    : state === 'watch' ? 'border-warning/30 bg-warning/10 text-warning'
      : state === 'at_risk' ? 'border-danger/30 bg-danger/10 text-danger'
        : 'border-border bg-muted text-muted-foreground'
  return <Badge variant="outline" className={tone}>{label}</Badge>
}

export function PortfolioView() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.get('portfolioQuery') ?? ''
  const scope = (searchParams.get('portfolioScope') ?? '') as Scope | ''
  const selectedProjectId = searchParams.get('portfolioProject') ?? ''
  const [data, setData] = useState<PortfolioPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const updateUrl = useCallback((updates: { query?: string; scope?: Scope | ''; projectId?: string }) => {
    const params = new URLSearchParams(searchParams.toString())
    if (updates.query !== undefined) {
      if (updates.query) params.set('portfolioQuery', updates.query)
      else params.delete('portfolioQuery')
      params.delete('portfolioScope')
      params.delete('portfolioProject')
    }
    if (updates.scope !== undefined) {
      if (updates.scope) params.set('portfolioScope', updates.scope)
      else params.delete('portfolioScope')
    }
    if (updates.projectId !== undefined) {
      if (updates.projectId) params.set('portfolioProject', updates.projectId)
      else params.delete('portfolioProject')
    }
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (scope) params.set('scope', scope)
      if (selectedProjectId) params.set('projectId', selectedProjectId)
      fetch(`/api/portfolio${params.size ? `?${params}` : ''}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Failed to load portfolio'))
          return response.json() as Promise<PortfolioPayload>
        })
        .then((payload) => {
          if (!cancelled) { setData(payload); setError(null) }
        })
        .catch((loadError) => {
          if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Failed to load portfolio')
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 220)
    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [query, reloadKey, scope, selectedProjectId])

  const drillInto = (nextScope: Scope, projectId = '') => {
    updateUrl({ query: '', scope: nextScope, projectId })
    window.setTimeout(() => document.getElementById('portfolio-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Portfolio</CardTitle>
            <p className="text-sm text-muted-foreground">Cross-project delivery signals with traceable source work.</p>
            {data ? <p className="mt-1 text-xs text-muted-foreground">Calculated {new Date(data.generatedAt).toLocaleString()}</p> : null}
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => updateUrl({ query: event.target.value })} placeholder="Search every accessible project" className="pl-9" aria-label="Search portfolio work" />
          </div>
        </CardHeader>
      </Card>

      {error && !data ? <ErrorState title="Portfolio did not load" description="No portfolio values are being shown because the source request failed." detail={error} onRetry={() => setReloadKey((value) => value + 1)} size="sm" /> : null}
      {error && data ? <InlineAlert tone="danger" title="Portfolio could not be refreshed." action={<Button size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>Retry</Button>}>{error}</InlineAlert> : null}
      {loading && !data ? <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading portfolio…</CardContent></Card> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-busy={loading}>
            <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => document.getElementById('portfolio-projects')?.scrollIntoView({ behavior: 'smooth' })}><span><span className="block text-xs uppercase text-muted-foreground">Projects</span><span className="mt-1 block text-2xl font-semibold">{data.summary.totalProjects}</span></span></Button>
            <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => document.getElementById('portfolio-objectives')?.scrollIntoView({ behavior: 'smooth' })}><span><span className="block text-xs uppercase text-muted-foreground">Objectives</span><span className="mt-1 block text-2xl font-semibold">{data.summary.totalObjectives}</span></span></Button>
            <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => document.getElementById('portfolio-objectives')?.scrollIntoView({ behavior: 'smooth' })}><span><span className="block text-xs uppercase text-muted-foreground">Average objective progress</span><span className="mt-1 block text-2xl font-semibold">{data.summary.objectiveHealth === null ? 'No data' : `${data.summary.objectiveHealth}%`}</span></span></Button>
            <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => drillInto('dueSoon')}><span><span className="block text-xs uppercase text-muted-foreground">Due soon</span><span className="mt-1 block text-2xl font-semibold">{data.summary.dueSoonCount}</span></span></Button>
            <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => drillInto('overdue')}><span><span className="block text-xs uppercase text-muted-foreground">Overdue</span><span className="mt-1 block text-2xl font-semibold">{data.summary.overdueCount}</span></span></Button>
            <Button variant="outline" className="h-auto justify-start p-4 text-left" onClick={() => drillInto('blocked')}><span><span className="block text-xs uppercase text-muted-foreground">Blocked</span><span className="mt-1 block text-2xl font-semibold">{data.summary.blockedCount}</span></span></Button>
          </div>

          <Card id="portfolio-projects" className="scroll-mt-4">
            <CardHeader><CardTitle>Project delivery</CardTitle><p className="text-sm text-muted-foreground">{data.healthExplanation}</p></CardHeader>
            <CardContent className="space-y-3">
              {data.projects.length === 0 ? <p className="text-sm text-muted-foreground">No accessible projects have portfolio data.</p> : data.projects.map((project) => (
                <div key={project.id} data-testid={`portfolio-project-${project.id}`} className="rounded-xl border border-border/70 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <button type="button" className="flex items-center gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={() => router.push(canonicalWorkspaceRoute(project.id, 'dashboard'))}>
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="font-medium">{project.name}</span><Badge variant="outline">{project.key}</Badge><ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                      <p className="mt-1 text-sm text-muted-foreground">{project.description || 'No project summary provided.'}</p>
                    </div>
                    <div className="flex items-center gap-2"><HealthBadge state={project.health.state} label={project.health.label} /><Badge variant="secondary">{project.completionRate}% complete</Badge></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {([
                      ['all', `${project.totalIssues} total`], ['open', `${project.openIssues} open`], ['completed', `${project.completedIssues} completed`],
                      ['dueSoon', `${project.dueSoonCount} due soon`], ['overdue', `${project.overdueCount} overdue`], ['blocked', `${project.blockedCount} blocked`],
                    ] as Array<[Scope, string]>).map(([metricScope, label]) => <Button key={metricScope} data-testid={`portfolio-project-${project.id}-${metricScope}`} size="sm" variant="outline" onClick={() => drillInto(metricScope, project.id)}>{label}</Button>)}
                    <span className="self-center px-2 text-xs text-muted-foreground">{project.members} members · health {project.health.score === null ? 'has no data' : `${project.health.score}/100`} ({project.health.signals.overduePercent}% overdue, {project.health.signals.blockedPercent}% blocked)</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="portfolio-objectives" className="scroll-mt-4">
            <CardHeader><CardTitle>Objectives</CardTitle><p className="text-sm text-muted-foreground">Progress is the mean completion of each objective&apos;s key results.</p></CardHeader>
            <CardContent className="space-y-2">
              {data.objectives.length === 0 ? <p className="text-sm text-muted-foreground">No objectives are defined in accessible projects.</p> : data.objectives.map((objective) => (
                <button key={objective.id} data-testid={`portfolio-objective-${objective.id}`} type="button" className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring" onClick={() => router.push(canonicalWorkspaceRoute(objective.project.id, 'objectives'))}>
                  <span><span className="font-medium">{objective.title}</span><span className="mt-1 block text-xs text-muted-foreground">{objective.project.name} · {objective.status.replace(/_/g, ' ')}</span></span>
                  <span className="font-semibold">{Math.round(objective.progress)}%</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card id="portfolio-results" className="scroll-mt-4">
            <CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>{query ? `Search results for “${query}”` : scope ? SCOPE_LABELS[scope] : 'Work drill-down'}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{data.resultScope ? `${data.resultCount} matching work item${data.resultCount === 1 ? '' : 's'}${data.queryResults.length < data.resultCount ? `; showing first ${data.queryResults.length}` : ''}.` : 'Choose any portfolio number to inspect the exact work behind it.'}</p></div>{data.resultScope ? <Button variant="ghost" size="sm" onClick={() => updateUrl({ query: '', scope: '', projectId: '' })}>Clear</Button> : null}</CardHeader>
            <CardContent className="space-y-2">
              {data.resultScope && data.queryResults.length === 0 ? <p className="text-sm text-muted-foreground">No work items match this selection.</p> : data.queryResults.map((item) => (
                <button key={item.id} type="button" className="flex w-full flex-col gap-2 rounded-lg border p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring md:flex-row md:items-center md:justify-between" onClick={() => router.push(`/work-items/${encodeURIComponent(item.id)}`)}>
                  <span><span className="flex items-center gap-2"><Badge variant="outline">{item.key}</Badge><span className="font-medium">{item.title}</span></span><span className="mt-1 block text-xs text-muted-foreground">{item.project.name} · {item.status.replace(/_/g, ' ')} · {item.priority}</span></span>
                  <span className="text-xs text-muted-foreground">{item.dueDate ? `Due ${new Date(item.dueDate).toLocaleDateString()}` : item.assignee ? `Assigned to ${item.assignee.name}` : 'Unassigned'}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
