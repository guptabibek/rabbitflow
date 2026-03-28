'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getApiErrorMessage } from '@/lib/utils'

type PortfolioPayload = {
  summary: {
    totalProjects: number
    totalObjectives: number
    objectiveHealth: number
    dueSoonCount: number
  }
  projects: Array<{
    id: string
    key: string
    name: string
    color: string
    description: string | null
    members: number
    totalIssues: number
    completionRate: number
    dueSoonCount: number
  }>
  queryResults: Array<{
    id: string
    key: string
    title: string
    status: string
    priority: string
    dueDate: string | null
    project: { id: string; key: string; name: string; color: string }
    assignee: { id: string; name: string; avatar: string | null } | null
  }>
  dueSoon: Array<{
    id: string
    key: string
    title: string
    dueDate: string
    status: string
    project: { id: string; key: string; name: string; color: string }
  }>
}

export function PortfolioView() {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<PortfolioPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const timeout = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)

      fetch(`/api/portfolio${query ? `?q=${encodeURIComponent(query)}` : ''}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, 'Failed to load portfolio'))
          }
          return response.json()
        })
        .then((payload) => {
          if (!cancelled) {
            setData(payload)
            setError(null)
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setData(null)
            setError(loadError instanceof Error ? loadError.message : 'Failed to load portfolio')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Portfolio Dashboard</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cross-project health, due-soon work, and query-driven portfolio triage.
            </p>
          </div>
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cross-project query by key or title"
              className="pl-9"
            />
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">Loading portfolio…</CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{error || 'Portfolio data is unavailable.'}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="transition-shadow hover:shadow-md"><CardContent className="p-4 sm:p-5"><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Projects</div><div className="mt-2 text-3xl font-semibold">{data.summary.totalProjects}</div></CardContent></Card>
            <Card className="transition-shadow hover:shadow-md"><CardContent className="p-4 sm:p-5"><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Objectives</div><div className="mt-2 text-3xl font-semibold">{data.summary.totalObjectives}</div></CardContent></Card>
            <Card className="transition-shadow hover:shadow-md"><CardContent className="p-4 sm:p-5"><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Objective Health</div><div className="mt-2 text-3xl font-semibold">{data.summary.objectiveHealth}%</div></CardContent></Card>
            <Card className="transition-shadow hover:shadow-md"><CardContent className="p-4 sm:p-5"><div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Due Soon</div><div className="mt-2 text-3xl font-semibold">{data.summary.dueSoonCount}</div></CardContent></Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader><CardTitle>Project Health</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.projects.map((project) => (
                  <div key={project.id} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
                          <span className="font-medium">{project.name}</span>
                          <Badge variant="outline">{project.key}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{project.description || 'No project summary provided.'}</p>
                      </div>
                      <Badge variant="secondary">{project.completionRate}% complete</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{project.totalIssues} issues</span>
                      <span>{project.members} members</span>
                      <span>{project.dueSoonCount} due soon</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Due Soon</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.dueSoon.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No work items due in the next week.</div>
                ) : data.dueSoon.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-card/70 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.key}</Badge>
                      <span className="text-sm font-medium">{item.title}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {item.project.name} · due {new Date(item.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Cross-Project Query Results</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.queryResults.length === 0 ? (
                <div className="text-sm text-muted-foreground">Type a query to search accessible projects.</div>
              ) : data.queryResults.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card/70 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{item.key}</Badge>
                      <span className="font-medium">{item.title}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {item.project.name} · {item.status.replace(/_/g, ' ')} · {item.priority}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.assignee ? `Assigned to ${item.assignee.name}` : 'Unassigned'}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}