'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState as EmptyStatePanel, InlineAlert } from '@/components/ui/states'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Bug,
  Clock,
  Target,
  Zap,
  Shield,
  DollarSign,
  Download,
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Users,
  Gauge,
  Timer,
  Layers,
  GitBranch,
  Inbox,
} from 'lucide-react'
import { STATUS_STYLES } from '@/lib/ui-tokens'
import { getApiErrorMessage } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportTab =
  | 'overview'
  | 'agile'
  | 'productivity'
  | 'work-items'
  | 'quality'
  | 'dora'
  | 'forecast'
  | 'time-tracking'
  | 'audit'

// ---------------------------------------------------------------------------
// Mini chart components (pure CSS/div based — no chart library needed)
// ---------------------------------------------------------------------------

function MiniBarChart({ data, maxValue, colorClass = 'bg-primary' }: {
  data: Array<{ label: string; value: number }>
  maxValue?: number
  colorClass?: string
}) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div
            className={`w-full rounded-t ${colorClass} min-h-[2px] transition-all duration-300`}
            style={{ height: `${(d.value / max) * 100}%` }}
          />
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function MiniStackedBar({ segments }: {
  segments: Array<{ label: string; value: number; colorClass: string }>
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${seg.colorClass} transition-all duration-300`}
            style={{ width: `${(seg.value / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`h-2 w-2 rounded-full ${seg.colorClass}`} />
            <span className="text-[11px] text-muted-foreground">{seg.label}</span>
            <span className="text-[11px] font-medium tabular-nums">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A figure in a report.
 *
 * The previous version gave each number a 36px tinted icon square and its own
 * shadowed card, so a row of four spent 160px of height and most of its ink on
 * decoration — the icon colours were chosen per call site and carried no
 * meaning, and `bg-red-500/10` ignored the theme entirely.
 *
 * The signature is unchanged so all fifteen call sites keep working; `iconBg`
 * is accepted and deliberately ignored, and `iconColor` now tints only the
 * small leading glyph.
 */
function StatCard({ label, value, icon: Icon, trend, description, iconColor }: {
  label: string
  value: string | number
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  description?: string
  iconBg?: string
  iconColor?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className={`size-3.5 shrink-0 ${iconColor || 'text-muted-foreground'}`} aria-hidden="true" />
        <span className="type-label truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="type-numeric text-[1.375rem] font-semibold leading-none tracking-[-0.02em] text-foreground">
          {value}
        </span>
        {trend === 'up' ? <TrendingUp className="size-3.5 text-success" aria-label="Trending up" /> : null}
        {trend === 'down' ? <TrendingDown className="size-3.5 text-danger" aria-label="Trending down" /> : null}
      </div>
      {description ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

function BurndownChart({ data }: {
  data: Array<{ date: string; remaining: number; ideal: number; completed: number; scope: number }>
}) {
  if (!data.length) return <EmptyState message="No burndown data" />
  const maxVal = Math.max(...data.map((d) => Math.max(d.remaining, d.ideal, d.scope)), 1)

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-[2px] h-40">
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-px h-full justify-end">
            <div className="w-full flex items-end gap-px h-full">
              <div
                className="flex-1 bg-blue-500/30 rounded-t min-h-[1px] transition-all"
                style={{ height: `${(d.ideal / maxVal) * 100}%` }}
                title={`Ideal: ${d.ideal}`}
              />
              <div
                className="flex-1 bg-primary rounded-t min-h-[1px] transition-all"
                style={{ height: `${(d.remaining / maxVal) * 100}%` }}
                title={`Remaining: ${d.remaining}`}
              />
            </div>
            <span className="text-[8px] text-muted-foreground truncate w-full text-center mt-1">
              {i % Math.max(1, Math.floor(data.length / 8)) === 0 ? d.date : ''}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded bg-primary" />
          <span className="text-muted-foreground">Remaining</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded bg-blue-500/30" />
          <span className="text-muted-foreground">Ideal</span>
        </div>
      </div>
    </div>
  )
}

function VelocityChart({ data }: {
  data: Array<{ sprintName: string; completedPoints: number; committedPoints: number }>
}) {
  if (!data.length) return <EmptyState message="No velocity data" />
  const max = Math.max(...data.map((d) => Math.max(d.completedPoints, d.committedPoints)), 1)

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 h-36">
        {data.map((d, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <div className="w-full flex items-end gap-[2px] h-32">
              <div
                className="flex-1 bg-muted-foreground/20 rounded-t transition-all min-h-[2px]"
                style={{ height: `${(d.committedPoints / max) * 100}%` }}
                title={`Committed: ${d.committedPoints}`}
              />
              <div
                className="flex-1 bg-primary rounded-t transition-all min-h-[2px]"
                style={{ height: `${(d.completedPoints / max) * 100}%` }}
                title={`Completed: ${d.completedPoints}`}
              />
            </div>
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">
              {d.sprintName.length > 8 ? d.sprintName.slice(0, 8) + '…' : d.sprintName}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded bg-primary" />
          <span className="text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded bg-muted-foreground/20" />
          <span className="text-muted-foreground">Committed</span>
        </div>
      </div>
    </div>
  )
}

function TrendLine({ data, colorClass = 'bg-primary' }: {
  data: Array<{ date: string; count: number }>
  colorClass?: string
}) {
  if (!data.length) return null
  const max = Math.max(...data.map((d) => d.count), 1)
  // Show last 14 or all
  const display = data.length > 20 ? data.slice(-20) : data
  return (
    <div className="flex items-end gap-px h-16">
      {display.map((d, i) => (
        <div
          key={i}
          className={`flex-1 min-w-[2px] rounded-t ${colorClass} transition-all min-h-[1px]`}
          style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-6 text-center">
      <Inbox className="size-4 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  )
}

function LoadingCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Loading report">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[4.75rem]" />
      ))}
    </div>
  )
}

const statusColorMap: Record<string, string> = {
  backlog: 'bg-status-backlog-bar',
  todo: 'bg-status-todo-bar',
  in_progress: 'bg-status-in-progress-bar',
  in_review: 'bg-status-in-review-bar',
  done: 'bg-status-done-bar',
  cancelled: 'bg-status-cancelled-bar',
}

const priorityColorMap: Record<string, string> = {
  highest: 'bg-priority-highest-bg',
  high: 'bg-priority-high-bg',
  medium: 'bg-priority-medium-bg',
  low: 'bg-priority-low-bg',
  lowest: 'bg-priority-lowest-bg',
}

const healthColors: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'Healthy' },
  'at-risk': { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'At Risk' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Critical' },
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ReportsView() {
  const { currentProject, iterations, teams } = useAppStore()
  const [activeTab, setActiveTab] = useState<ReportTab>('overview')
  const [selectedTeam, setSelectedTeam] = useState<string>('all')
  const [selectedSprint, setSelectedSprint] = useState<string>('')
  const [dayRange, setDayRange] = useState('30')
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Data states
  const [executive, setExecutive] = useState<Record<string, unknown> | null>(null)
  const [burndown, setBurndown] = useState<Record<string, unknown> | null>(null)
  const [velocity, setVelocity] = useState<unknown[] | null>(null)
  const [cfd, setCfd] = useState<unknown[] | null>(null)
  const [leadCycle, setLeadCycle] = useState<Record<string, unknown> | null>(null)
  const [workload, setWorkload] = useState<unknown[] | null>(null)
  const [completion, setCompletion] = useState<Record<string, unknown> | null>(null)
  const [timeEstimates, setTimeEstimates] = useState<Record<string, unknown> | null>(null)
  const [statusDist, setStatusDist] = useState<Record<string, unknown> | null>(null)
  const [aging, setAging] = useState<Record<string, unknown> | null>(null)
  const [blocked, setBlocked] = useState<Record<string, unknown> | null>(null)
  const [reopened, setReopened] = useState<Record<string, unknown> | null>(null)
  const [bugMetrics, setBugMetrics] = useState<Record<string, unknown> | null>(null)
  const [dora, setDora] = useState<Record<string, unknown> | null>(null)
  const [forecast, setForecast] = useState<Record<string, unknown> | null>(null)
  const [timeTracking, setTimeTracking] = useState<Record<string, unknown> | null>(null)
  const [audit, setAudit] = useState<Record<string, unknown> | null>(null)

  const projectId = currentProject?.id
  const teamId = selectedTeam !== 'all' ? selectedTeam : undefined
  const selectedTeamName = selectedTeam === 'all'
    ? 'All Teams'
    : (teams.find((team) => team.id === selectedTeam)?.name || 'Selected Team')
  const tabLabelMap: Record<ReportTab, string> = {
    overview: 'Overview',
    agile: 'Agile',
    productivity: 'Productivity',
    'work-items': 'Work Items',
    quality: 'Quality',
    dora: 'DORA',
    forecast: 'Forecast',
    'time-tracking': 'Time Tracking',
    audit: 'Audit',
  }
  const activeScopeLabel = `${tabLabelMap[activeTab]} • ${selectedTeamName}`

  const sprints = iterations.filter((i) => {
    const row = i as Record<string, unknown>
    if (row.iterationType !== 'sprint') return false
    if (!teamId) return true
    return row.teamId === teamId
  })
  const activeSelectedSprint =
    selectedSprint && sprints.some((s) => (s as { id: string }).id === selectedSprint)
      ? selectedSprint
      : ''
  const visibleBurndown = activeSelectedSprint ? burndown : null

  const fetchApi = useCallback(async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(await getApiErrorMessage(res, 'Failed to load report data'))
    }
    return res.json()
  }, [])

  const withTeam = useCallback((url: string) => {
    if (!teamId) return url
    return `${url}&teamId=${teamId}`
  }, [teamId])

  // Load data per tab
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        switch (activeTab) {
          case 'overview': {
            const [exec, statusData, vel, qual] = await Promise.all([
              fetchApi('/api/reports/executive'),
              fetchApi(withTeam(`/api/reports/work-items?projectId=${projectId}&report=status-distribution`)),
              fetchApi(withTeam(`/api/reports/agile?projectId=${projectId}&report=velocity&lastN=6`)),
              fetchApi(withTeam(`/api/reports/quality?projectId=${projectId}&days=30`)),
            ])
            if (cancelled) return
            setExecutive(exec)
            setStatusDist(statusData)
            setVelocity(vel)
            setBugMetrics(qual)
            break
          }
          case 'agile': {
            const promises: Promise<unknown>[] = [
              fetchApi(withTeam(`/api/reports/agile?projectId=${projectId}&report=velocity&lastN=10`)),
              fetchApi(withTeam(`/api/reports/agile?projectId=${projectId}&report=cumulative-flow&days=${dayRange}`)),
              fetchApi(withTeam(`/api/reports/agile?projectId=${projectId}&report=lead-cycle-time`)),
            ]
            if (activeSelectedSprint) {
              promises.push(fetchApi(withTeam(`/api/reports/agile?projectId=${projectId}&report=burndown&sprintId=${activeSelectedSprint}`)))
            }
            const [vel, flow, lct, bd] = await Promise.all(promises) as [unknown[], unknown[], Record<string, unknown>, Record<string, unknown> | undefined]
            if (cancelled) return
            setVelocity(vel as unknown[])
            setCfd(flow as unknown[])
            setLeadCycle(lct)
            setBurndown(bd ?? null)
            break
          }
          case 'productivity': {
            const [wl, comp, te] = await Promise.all([
              fetchApi(withTeam(`/api/reports/productivity?projectId=${projectId}&report=workload`)),
              fetchApi(withTeam(`/api/reports/productivity?projectId=${projectId}&report=completion-rates&days=${dayRange}`)),
              fetchApi(withTeam(`/api/reports/productivity?projectId=${projectId}&report=time-estimates`)),
            ])
            if (cancelled) return
            setWorkload(wl)
            setCompletion(comp)
            setTimeEstimates(te)
            break
          }
          case 'work-items': {
            const [sd, ag, bl, re] = await Promise.all([
              fetchApi(withTeam(`/api/reports/work-items?projectId=${projectId}&report=status-distribution`)),
              fetchApi(withTeam(`/api/reports/work-items?projectId=${projectId}&report=backlog-aging`)),
              fetchApi(withTeam(`/api/reports/work-items?projectId=${projectId}&report=blocked`)),
              fetchApi(withTeam(`/api/reports/work-items?projectId=${projectId}&report=reopened&days=${dayRange}`)),
            ])
            if (cancelled) return
            setStatusDist(sd)
            setAging(ag)
            setBlocked(bl)
            setReopened(re)
            break
          }
          case 'quality': {
            const data = await fetchApi(withTeam(`/api/reports/quality?projectId=${projectId}&days=${dayRange}`))
            if (cancelled) return
            setBugMetrics(data)
            break
          }
          case 'dora': {
            const data = await fetchApi(withTeam(`/api/reports/dora?projectId=${projectId}&days=90`))
            if (cancelled) return
            setDora(data)
            break
          }
          case 'forecast': {
            const data = await fetchApi(withTeam(`/api/reports/forecast?projectId=${projectId}`))
            if (cancelled) return
            setForecast(data)
            break
          }
          case 'time-tracking': {
            const data = await fetchApi(withTeam(`/api/reports/time-tracking?projectId=${projectId}`))
            if (cancelled) return
            setTimeTracking(data)
            break
          }
          case 'audit': {
            const data = await fetchApi(withTeam(`/api/reports/audit?projectId=${projectId}&days=${dayRange}`))
            if (cancelled) return
            setAudit(data)
            break
          }
        }
      } catch (error) {
        console.error('Failed to load report data:', error)
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load report data')
        }
      }
      if (!cancelled) setIsLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId, activeTab, activeSelectedSprint, dayRange, fetchApi, withTeam])

  const handleExport = () => {
    if (!projectId) return
    const exportUrl = teamId
      ? `/api/reports/export?projectId=${projectId}&teamId=${teamId}`
      : `/api/reports/export?projectId=${projectId}`
    window.open(exportUrl, '_blank')
  }

  if (!currentProject) {
    return (
      <EmptyStatePanel
        size="lg"
        icon={BarChart3}
        title="No project selected"
        description="Reports are scoped to a project. Choose one from the switcher in the top bar."
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/*
        The tab strip belongs to the header, flush against its bottom rule, so
        it reads as navigation within the page rather than as a floating
        control bar. The scope filters sit with the title because they change
        what every tab below them means.
      */}
      <PageHeader
        title="Reports"
        description={activeScopeLabel}
        actions={
          <>
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Filter by team">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dayRange} onValueChange={setDayRange}>
              <SelectTrigger size="sm" className="w-[6.5rem]" aria-label="Reporting period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download />
              <span className="hidden md:inline">Export CSV</span>
            </Button>
          </>
        }
        tabs={
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="agile">Agile</TabsTrigger>
              <TabsTrigger value="productivity">Productivity</TabsTrigger>
              <TabsTrigger value="work-items">Work items</TabsTrigger>
              <TabsTrigger value="quality">Quality</TabsTrigger>
              <TabsTrigger value="dora">DORA</TabsTrigger>
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="time-tracking">Time</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)} className="space-y-4">
            {loadError ? (
              <InlineAlert tone="danger" title="This report could not load.">
                {loadError}
              </InlineAlert>
            ) : null}

            {/* ---------------------------------------------------------------- */}
            {/* OVERVIEW TAB                                                      */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : (
                <>
                  {/* Executive KPIs */}
                  {executive && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard
                        label="Total Issues"
                        value={(executive as { totals?: { totalIssues?: number } }).totals?.totalIssues ?? 0}
                        icon={Layers}
                        iconBg="bg-category-active-bg"
                        iconColor="text-category-active"
                      />
                      <StatCard
                        label="Completed"
                        value={(executive as { totals?: { completedIssues?: number } }).totals?.completedIssues ?? 0}
                        icon={CheckCircle2}
                        iconBg="bg-category-done-bg"
                        iconColor="text-category-done"
                        description={`${(executive as { totals?: { overallProgress?: number } }).totals?.overallProgress ?? 0}% overall`}
                      />
                      <StatCard
                        label="Open Bugs"
                        value={(executive as { totals?: { openBugs?: number } }).totals?.openBugs ?? 0}
                        icon={Bug}
                        iconBg="bg-red-500/10"
                        iconColor="text-red-500"
                      />
                      <StatCard
                        label="Projects"
                        value={(executive as { totals?: { totalProjects?: number } }).totals?.totalProjects ?? 0}
                        icon={BarChart3}
                        iconBg="bg-type-story-bg"
                        iconColor="text-type-story"
                      />
                    </div>
                  )}

                  {/* Status Distribution + Velocity side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {statusDist ? (
                          <MiniStackedBar
                            segments={((statusDist as { byStatus?: Array<{ status: string; count: number }> }).byStatus || []).map((s) => ({
                              label: s.status.replace('_', ' '),
                              value: s.count,
                              colorClass: statusColorMap[s.status] || 'bg-muted',
                            }))}
                          />
                        ) : <EmptyState message="No data" />}
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Sprint Velocity</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {velocity && Array.isArray(velocity) && velocity.length > 0 ? (
                          <VelocityChart
                            data={(velocity as Array<{ sprintName: string; completedPoints: number; committedPoints: number }>)}
                          />
                        ) : <EmptyState message="No velocity data" />}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Project health cards */}
                  {executive && (executive as { projects?: unknown[] }).projects && ((executive as { projects: unknown[] }).projects.length > 0) && (
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Project Health</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="space-y-2">
                          {((executive as { projects: Array<{ id: string; key: string; name: string; color: string; progress: number; totalIssues: number; completedIssues: number; openBugs: number; health: string }> }).projects).map((project) => {
                            const h = healthColors[project.health] || healthColors.healthy
                            return (
                              <div key={project.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div
                                  className="h-7 w-7 rounded flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                                  style={{ backgroundColor: project.color }}
                                >
                                  {project.key.slice(0, 2)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                                    <Badge variant="outline" className={`text-[10px] border-0 ${h.bg} ${h.text}`}>
                                      {h.label}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1">
                                    <Progress value={project.progress} className="h-1 flex-1" />
                                    <span className="text-[11px] text-muted-foreground tabular-nums">{project.progress}%</span>
                                  </div>
                                </div>
                                <div className="flex gap-4 text-[11px] text-muted-foreground flex-shrink-0">
                                  <span>{project.completedIssues}/{project.totalIssues}</span>
                                  {project.openBugs > 0 && (
                                    <span className="text-red-400">{project.openBugs} bugs</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Bug trend */}
                  {bugMetrics && (
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Bug Trend (Last {dayRange} days)</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <TrendLine
                          data={(bugMetrics as { trend?: Array<{ date: string; count: number }> }).trend || []}
                          colorClass="bg-red-500"
                        />
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* AGILE TAB                                                         */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="agile" className="space-y-4 mt-0">
              {/* Sprint picker */}
              <div className="flex items-center gap-2">
                <Select value={activeSelectedSprint} onValueChange={setSelectedSprint}>
                  <SelectTrigger className="h-7 w-[200px] text-xs">
                    <SelectValue placeholder="Select sprint for burndown" />
                  </SelectTrigger>
                  <SelectContent>
                    {sprints.map((s) => (
                      <SelectItem key={(s as { id: string }).id} value={(s as { id: string }).id}>
                        {(s as { name: string }).name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? <LoadingCards count={2} /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Burndown */}
                  <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-medium">Sprint Burndown</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {visibleBurndown && (visibleBurndown as { burndown?: unknown[] }).burndown ? (
                        <BurndownChart data={(visibleBurndown as { burndown: Array<{ date: string; remaining: number; ideal: number; completed: number; scope: number }> }).burndown} />
                      ) : (
                        <EmptyState message={activeSelectedSprint ? 'Loading…' : 'Select a sprint'} />
                      )}
                      {visibleBurndown && (
                        <div className="mt-3 flex gap-4 text-[11px]">
                          <span className="text-muted-foreground">
                            Total: <span className="font-medium text-foreground">{(visibleBurndown as { totalPoints?: number }).totalPoints ?? 0} pts</span>
                          </span>
                          <span className="text-muted-foreground">
                            Items: <span className="font-medium text-foreground">{(visibleBurndown as { totalItems?: number }).totalItems ?? 0}</span>
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Velocity */}
                  <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-medium">Velocity</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {velocity && Array.isArray(velocity) && velocity.length > 0 ? (
                        <VelocityChart
                          data={(velocity as Array<{ sprintName: string; completedPoints: number; committedPoints: number }>)}
                        />
                      ) : <EmptyState message="No velocity data" />}
                    </CardContent>
                  </Card>

                  {/* Cumulative Flow */}
                  <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-medium">Cumulative Flow</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {cfd && Array.isArray(cfd) && cfd.length > 0 ? (
                        <div className="space-y-3">
                          <div className="flex items-end gap-px h-32">
                            {(cfd as Array<Record<string, unknown>>).slice(-30).map((day, i) => {
                              const statuses = ['done', 'in_review', 'in_progress', 'todo', 'backlog']
                              const vals = statuses.map((s) => (day[s] as number) || 0)
                              const total = vals.reduce((a, b) => a + b, 0) || 1
                              return (
                                <div key={i} className="flex-1 min-w-0 flex flex-col h-full">
                                  {statuses.map((s, si) => (
                                    <div
                                      key={s}
                                      className={`${statusColorMap[s] || 'bg-muted'} ${si === 0 ? 'rounded-t' : ''}`}
                                      style={{ height: `${(vals[si] / total) * 100}%` }}
                                    />
                                  ))}
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex flex-wrap gap-3 text-[11px]">
                            {['done', 'in_review', 'in_progress', 'todo', 'backlog'].map((s) => (
                              <div key={s} className="flex items-center gap-1.5">
                                <div className={`h-2 w-2 rounded-full ${statusColorMap[s] || 'bg-muted'}`} />
                                <span className="text-muted-foreground capitalize">{s.replace('_', ' ')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : <EmptyState message="No flow data" />}
                    </CardContent>
                  </Card>

                  {/* Lead & Cycle Time */}
                  <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-medium">Lead & Cycle Time</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      {leadCycle && (leadCycle as { summary?: Record<string, unknown> }).summary ? (() => {
                        const summary = (leadCycle as { summary: { count: number; leadTime: { avg: number; median: number; p85: number }; cycleTime: { avg: number; median: number; p85: number } } }).summary
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Lead Time</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">Average</span>
                                    <span className="font-medium tabular-nums">{summary.leadTime.avg}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">Median</span>
                                    <span className="font-medium tabular-nums">{summary.leadTime.median}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">P85</span>
                                    <span className="font-medium tabular-nums">{summary.leadTime.p85}d</span>
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Cycle Time</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">Average</span>
                                    <span className="font-medium tabular-nums">{summary.cycleTime.avg}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">Median</span>
                                    <span className="font-medium tabular-nums">{summary.cycleTime.median}d</span>
                                  </div>
                                  <div className="flex justify-between text-[11px]">
                                    <span className="text-muted-foreground">P85</span>
                                    <span className="font-medium tabular-nums">{summary.cycleTime.p85}d</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Based on {summary.count} completed items
                            </p>
                          </div>
                        )
                      })() : <EmptyState message="No lead/cycle time data" />}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* PRODUCTIVITY TAB                                                  */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="productivity" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : (
                <>
                  {/* Completion rates summary */}
                  {completion && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <StatCard
                        label="Created"
                        value={(completion as { summary?: { created?: number } }).summary?.created ?? 0}
                        icon={ArrowUpRight}
                        iconBg="bg-blue-500/10"
                        iconColor="text-blue-500"
                        description={`Last ${dayRange} days`}
                      />
                      <StatCard
                        label="Completed"
                        value={(completion as { summary?: { completed?: number } }).summary?.completed ?? 0}
                        icon={CheckCircle2}
                        iconBg="bg-category-done-bg"
                        iconColor="text-category-done"
                      />
                      <StatCard
                        label="Completion Rate"
                        value={`${(completion as { summary?: { rate?: number } }).summary?.rate ?? 0}%`}
                        icon={Target}
                        iconBg="bg-amber-500/10"
                        iconColor="text-amber-500"
                      />
                    </div>
                  )}

                  {/* Created vs Completed trend */}
                  {completion && (completion as { daily?: unknown[] }).daily && (
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Created vs Completed</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {(() => {
                          const daily = (completion as { daily: Array<{ date: string; created: number; completed: number }> }).daily
                          const display = daily.length > 30 ? daily.slice(-30) : daily
                          const max = Math.max(...display.map((d) => Math.max(d.created, d.completed)), 1)
                          return (
                            <div className="space-y-3">
                              <div className="flex items-end gap-1 h-28">
                                {display.map((d, i) => (
                                  <div key={i} className="flex-1 min-w-0 flex items-end gap-px h-full">
                                    <div
                                      className="flex-1 bg-blue-500/40 rounded-t min-h-[1px]"
                                      style={{ height: `${(d.created / max) * 100}%` }}
                                    />
                                    <div
                                      className="flex-1 bg-emerald-500 rounded-t min-h-[1px]"
                                      style={{ height: `${(d.completed / max) * 100}%` }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex gap-4 text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  <div className="h-2 w-4 rounded bg-blue-500/40" />
                                  <span className="text-muted-foreground">Created</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="h-2 w-4 rounded bg-emerald-500" />
                                  <span className="text-muted-foreground">Completed</span>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Workload distribution */}
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Workload Distribution</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {workload && Array.isArray(workload) && workload.length > 0 ? (
                          <div className="space-y-2">
                            {(workload as Array<{
                              assignee: { id: string; name: string; avatar: string | null } | null
                              itemCount: number
                              totalPoints: number
                              completedHours: number
                              estimatedHours: number
                            }>).slice(0, 10).map((entry, i) => {
                              const maxItems = Math.max(...(workload as Array<{ itemCount: number }>).map((w) => w.itemCount), 1)
                              return (
                                <div key={i} className="flex items-center gap-2">
                                  <Avatar className="h-5 w-5 flex-shrink-0">
                                    <AvatarImage src={entry.assignee?.avatar || undefined} />
                                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                      {(entry.assignee?.name || '?').slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[11px] font-medium truncate">{entry.assignee?.name || 'Unassigned'}</span>
                                      <span className="text-[11px] text-muted-foreground tabular-nums">{entry.itemCount} items</span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary rounded-full transition-all"
                                        style={{ width: `${(entry.itemCount / maxItems) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : <EmptyState message="No workload data" />}
                      </CardContent>
                    </Card>

                    {/* Time vs Estimates */}
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Time vs Estimates</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {timeEstimates && (timeEstimates as { summary?: Record<string, unknown> }).summary ? (() => {
                          const te = (timeEstimates as { summary: { totalEstimated: number; totalCompleted: number; totalRemaining: number; accuracy: number; itemCount: number } }).summary
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[11px] text-muted-foreground mb-1">Estimated</p>
                                  <p className="text-lg font-bold tabular-nums">{te.totalEstimated}h</p>
                                </div>
                                <div>
                                  <p className="text-[11px] text-muted-foreground mb-1">Completed</p>
                                  <p className="text-lg font-bold tabular-nums">{te.totalCompleted}h</p>
                                </div>
                              </div>
                              <div>
                                <div className="flex justify-between text-[11px] mb-1">
                                  <span className="text-muted-foreground">Accuracy</span>
                                  <span className="font-medium">{te.accuracy}%</span>
                                </div>
                                <Progress value={Math.min(te.accuracy, 100)} className="h-1.5" />
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Remaining</span>
                                <span className="font-medium tabular-nums">{te.totalRemaining}h</span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {te.itemCount} items with time tracking
                              </p>
                            </div>
                          )
                        })() : <EmptyState message="No time estimate data" />}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* WORK ITEMS TAB                                                    */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="work-items" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : (
                <>
                  {/* Status + Priority distribution */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">By Status</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {statusDist ? (
                          <MiniStackedBar
                            segments={((statusDist as { byStatus?: Array<{ status: string; count: number }> }).byStatus || []).map((s) => ({
                              label: s.status.replace('_', ' '),
                              value: s.count,
                              colorClass: statusColorMap[s.status] || 'bg-muted',
                            }))}
                          />
                        ) : <EmptyState message="No data" />}
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">By Priority</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {statusDist ? (
                          <MiniStackedBar
                            segments={((statusDist as { byPriority?: Array<{ priority: string; count: number }> }).byPriority || []).map((p) => ({
                              label: p.priority,
                              value: p.count,
                              colorClass: priorityColorMap[p.priority] || 'bg-muted',
                            }))}
                          />
                        ) : <EmptyState message="No data" />}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Backlog aging */}
                  {aging && (
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">Backlog Aging</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <p className="text-[11px] text-muted-foreground">Open Items</p>
                            <p className="text-lg font-bold tabular-nums">{(aging as { summary?: { totalOpen?: number } }).summary?.totalOpen ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Avg Age</p>
                            <p className="text-lg font-bold tabular-nums">{(aging as { summary?: { avgAgeDays?: number } }).summary?.avgAgeDays ?? 0} days</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">Oldest</p>
                            <p className="text-lg font-bold tabular-nums">{(aging as { summary?: { oldestDays?: number } }).summary?.oldestDays ?? 0} days</p>
                          </div>
                        </div>
                        <MiniBarChart
                          data={((aging as { buckets?: Array<{ range: string; count: number }> }).buckets || []).map((b) => ({
                            label: b.range,
                            value: b.count,
                          }))}
                          colorClass="bg-amber-500"
                        />
                      </CardContent>
                    </Card>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Blocked items */}
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          Blocked Items
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {(blocked as { count?: number })?.count ?? 0}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {blocked && ((blocked as { blockedItems?: unknown[] }).blockedItems?.length ?? 0) > 0 ? (
                          <ScrollArea className="h-48">
                            <div className="space-y-2">
                              {((blocked as { blockedItems: Array<{ issue: { key: string; title: string; status: string }; blockedBy: { key: string; title: string } }> }).blockedItems || []).slice(0, 15).map((item, i) => (
                                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-muted/20">
                                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-medium truncate">
                                      <span className="text-muted-foreground font-mono">{item.issue.key}</span>{' '}
                                      {item.issue.title}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      Blocked by: <span className="font-mono">{item.blockedBy.key}</span> {item.blockedBy.title}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : <EmptyState message="No blocked items" />}
                      </CardContent>
                    </Card>

                    {/* Reopened items */}
                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <GitBranch className="h-3.5 w-3.5 text-orange-500" />
                          Reopened Items
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {(reopened as { count?: number })?.count ?? 0}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        {reopened && ((reopened as { items?: unknown[] }).items?.length ?? 0) > 0 ? (
                          <ScrollArea className="h-48">
                            <div className="space-y-2">
                              {((reopened as { items: Array<{ key?: string; title?: string; reopenedAt: string }> }).items).slice(0, 15).map((item, i) => (
                                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded bg-muted/20">
                                  <GitBranch className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-medium truncate">
                                      <span className="text-muted-foreground font-mono">{item.key}</span>{' '}
                                      {item.title}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      Reopened {new Date(item.reopenedAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        ) : <EmptyState message="No reopened items" />}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* QUALITY TAB                                                       */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="quality" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : bugMetrics ? (() => {
                const bm = bugMetrics as {
                  summary: { totalBugs: number; openBugs: number; resolvedBugs: number; recentBugs: number; avgResolutionDays: number }
                  trend: Array<{ date: string; count: number }>
                  bySeverity: Array<{ severity: string; count: number }>
                  byPriority: Array<{ priority: string; count: number }>
                }
                return (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard label="Total Bugs" value={bm.summary.totalBugs} icon={Bug} iconBg="bg-red-500/10" iconColor="text-red-500" />
                      <StatCard label="Open Bugs" value={bm.summary.openBugs} icon={AlertTriangle} iconBg="bg-amber-500/10" iconColor="text-amber-500" />
                      <StatCard label="Resolved" value={bm.summary.resolvedBugs} icon={CheckCircle2} iconBg="bg-category-done-bg" iconColor="text-category-done" />
                      <StatCard label="Avg Resolution" value={`${bm.summary.avgResolutionDays}d`} icon={Timer} iconBg="bg-blue-500/10" iconColor="text-blue-500" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">Bug Trend</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <TrendLine data={bm.trend} colorClass="bg-red-500" />
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">By Severity</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <MiniStackedBar
                            segments={bm.bySeverity.map((s) => ({
                              label: s.severity,
                              value: s.count,
                              colorClass: s.severity === 'critical' ? 'bg-red-600' :
                                s.severity === 'high' ? 'bg-orange-500' :
                                s.severity === 'medium' ? 'bg-amber-500' :
                                s.severity === 'low' ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                            }))}
                          />
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">By Priority</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <MiniBarChart
                          data={bm.byPriority.map((p) => ({ label: p.priority, value: p.count }))}
                          colorClass="bg-red-500/70"
                        />
                      </CardContent>
                    </Card>
                  </>
                )
              })() : <EmptyState message="No bug data" />}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* DORA TAB                                                          */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="dora" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : dora ? (() => {
                const d = dora as {
                  deploymentFrequency: { total: number; perWeek: number; deployments: Array<{ name: string; date: string | null }> }
                  leadTimeForChanges: { avgDays: number }
                  changeFailureRate: { rate: number; bugsCreated: number; totalCompleted: number }
                  mttr: { hours: number; days: number; resolvedCount: number }
                }
                return (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard
                        label="Deployment Freq"
                        value={`${d.deploymentFrequency.perWeek}/wk`}
                        icon={Zap}
                        iconBg="bg-emerald-500/10"
                        iconColor="text-emerald-500"
                        description={`${d.deploymentFrequency.total} deployments`}
                      />
                      <StatCard
                        label="Lead Time"
                        value={`${d.leadTimeForChanges.avgDays}d`}
                        icon={Clock}
                        iconBg="bg-blue-500/10"
                        iconColor="text-blue-500"
                        description="Creation to done"
                      />
                      <StatCard
                        label="Change Failure"
                        value={`${d.changeFailureRate.rate}%`}
                        icon={AlertTriangle}
                        iconBg="bg-amber-500/10"
                        iconColor="text-amber-500"
                        description={`${d.changeFailureRate.bugsCreated} bugs / ${d.changeFailureRate.totalCompleted} completed`}
                      />
                      <StatCard
                        label="MTTR"
                        value={`${d.mttr.days}d`}
                        icon={Timer}
                        iconBg="bg-purple-500/10"
                        iconColor="text-purple-500"
                        description={`${d.mttr.resolvedCount} bugs resolved`}
                      />
                    </div>

                    {d.deploymentFrequency.deployments.length > 0 && (
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">Recent Deployments / Releases</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <div className="space-y-1.5">
                            {d.deploymentFrequency.deployments.map((dep, i) => (
                              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20 text-[11px]">
                                <Zap className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                                <span className="font-medium">{dep.name}</span>
                                {dep.date && (
                                  <span className="text-muted-foreground ml-auto">
                                    {new Date(dep.date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium">DORA Performance Rating</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                          {[
                            { label: 'Deployment Frequency', value: d.deploymentFrequency.perWeek, rating: d.deploymentFrequency.perWeek >= 1 ? 'Elite' : d.deploymentFrequency.perWeek >= 0.25 ? 'High' : 'Medium' },
                            { label: 'Lead Time', value: `${d.leadTimeForChanges.avgDays}d`, rating: d.leadTimeForChanges.avgDays <= 1 ? 'Elite' : d.leadTimeForChanges.avgDays <= 7 ? 'High' : 'Medium' },
                            { label: 'Change Failure Rate', value: `${d.changeFailureRate.rate}%`, rating: d.changeFailureRate.rate <= 5 ? 'Elite' : d.changeFailureRate.rate <= 15 ? 'High' : 'Medium' },
                            { label: 'MTTR', value: `${d.mttr.days}d`, rating: d.mttr.days <= 1 ? 'Elite' : d.mttr.days <= 7 ? 'High' : 'Medium' },
                          ].map((metric) => (
                            <div key={metric.label} className="text-center space-y-1">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric.label}</p>
                              <Badge
                                variant="outline"
                                className={`text-[10px] border-0 ${
                                  metric.rating === 'Elite' ? 'bg-emerald-500/10 text-emerald-500' :
                                  metric.rating === 'High' ? 'bg-blue-500/10 text-blue-500' :
                                  'bg-amber-500/10 text-amber-500'
                                }`}
                              >
                                {metric.rating}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )
              })() : <EmptyState message="No DORA data" />}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* FORECAST TAB                                                      */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="forecast" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : forecast ? (() => {
                const f = forecast as {
                  avgVelocity: number
                  totalRemainingPoints: number
                  totalRemainingItems: number
                  predictedSprints: number | null
                  confidence: string
                  predictability: number
                  stdDev: number
                  velocityHistory?: Array<{ sprintName: string; completedPoints: number; committedPoints: number }>
                }
                const confColors: Record<string, string> = {
                  high: 'text-emerald-500 bg-emerald-500/10',
                  medium: 'text-amber-500 bg-amber-500/10',
                  low: 'text-red-500 bg-red-500/10',
                }
                return (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard label="Avg Velocity" value={`${f.avgVelocity} pts`} icon={TrendingUp} iconBg="bg-primary/10" iconColor="text-primary" />
                      <StatCard label="Remaining Work" value={`${f.totalRemainingPoints} pts`} icon={Layers} iconBg="bg-amber-500/10" iconColor="text-amber-500" description={`${f.totalRemainingItems} items`} />
                      <StatCard label="Predicted Sprints" value={f.predictedSprints ?? '—'} icon={Target} iconBg="bg-blue-500/10" iconColor="text-blue-500" description="To complete backlog" />
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Confidence</p>
                              <Badge variant="outline" className={`text-xs border-0 capitalize ${confColors[f.confidence] || ''}`}>
                                {f.confidence}
                              </Badge>
                              <p className="text-[11px] text-muted-foreground">{f.predictability}% predictable</p>
                            </div>
                            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                              <Gauge className="h-4 w-4 text-purple-500" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {f.velocityHistory && f.velocityHistory.length > 0 && (
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">Velocity History</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <VelocityChart data={f.velocityHistory} />
                          <div className="mt-3 flex gap-4 text-[11px]">
                            <span className="text-muted-foreground">
                              Std Dev: <span className="font-medium text-foreground">{f.stdDev}</span>
                            </span>
                            <span className="text-muted-foreground">
                              Avg: <span className="font-medium text-foreground">{f.avgVelocity} pts/sprint</span>
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )
              })() : <EmptyState message="No forecast data (need completed sprints)" />}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* TIME TRACKING TAB                                                 */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="time-tracking" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={4} /> : timeTracking ? (() => {
                const tt = timeTracking as {
                  summary: { totalEstimated: number; totalCompleted: number; totalRemaining: number; totalCost: number; estimatedCost: number; remainingCost: number; costPerHour: number; itemCount: number }
                  byAssignee: Array<{ assigneeId: string; estimated: number; completed: number; remaining: number; name: string; avatar: string | null; cost: number }>
                  byType: Array<{ type: string; estimated: number; completed: number; remaining: number; count: number; cost: number }>
                }
                return (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <StatCard label="Estimated" value={`${tt.summary.totalEstimated}h`} icon={Clock} iconBg="bg-blue-500/10" iconColor="text-blue-500" />
                      <StatCard label="Completed" value={`${tt.summary.totalCompleted}h`} icon={CheckCircle2} iconBg="bg-category-done-bg" iconColor="text-category-done" />
                      <StatCard label="Remaining" value={`${tt.summary.totalRemaining}h`} icon={Timer} iconBg="bg-amber-500/10" iconColor="text-amber-500" />
                      <StatCard label="Items Tracked" value={tt.summary.itemCount} icon={Layers} iconBg="bg-primary/10" iconColor="text-primary" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">By Assignee</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          {tt.byAssignee.length > 0 ? (
                            <div className="space-y-2">
                              {tt.byAssignee.map((entry) => (
                                <div key={entry.assigneeId} className="flex items-center gap-2 text-[11px]">
                                  <Avatar className="h-5 w-5 flex-shrink-0">
                                    <AvatarImage src={entry.avatar || undefined} />
                                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                      {entry.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium truncate flex-1">{entry.name}</span>
                                  <span className="text-muted-foreground tabular-nums">{entry.completed}h / {entry.estimated}h</span>
                                </div>
                              ))}
                            </div>
                          ) : <EmptyState message="No data" />}
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">By Work Item Type</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          {tt.byType.length > 0 ? (
                            <MiniBarChart
                              data={tt.byType.map((t) => ({
                                label: t.type,
                                value: t.completed,
                              }))}
                              colorClass="bg-primary"
                            />
                          ) : <EmptyState message="No data" />}
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )
              })() : <EmptyState message="No time tracking data" />}
            </TabsContent>

            {/* ---------------------------------------------------------------- */}
            {/* AUDIT TAB                                                         */}
            {/* ---------------------------------------------------------------- */}
            <TabsContent value="audit" className="space-y-4 mt-0">
              {isLoading ? <LoadingCards count={2} /> : audit ? (() => {
                const a = audit as {
                  activities: Array<{ id: string; action: string; createdAt: string; details: Record<string, unknown> | null; user: { id: string; name: string; avatar: string | null }; issue: { key: string; title: string } | null }>
                  pagination: { page: number; pageSize: number; total: number; totalPages: number }
                  actionSummary: Array<{ action: string; count: number }>
                  userSummary: Array<{ userId: string; user: { id: string; name: string; avatar: string | null } | null; count: number }>
                }
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <StatCard label="Total Activities" value={a.pagination.total} icon={Activity} iconBg="bg-primary/10" iconColor="text-primary" description={`Last ${dayRange} days`} />
                      <StatCard label="Action Types" value={a.actionSummary.length} icon={Shield} iconBg="bg-purple-500/10" iconColor="text-purple-500" />
                      <StatCard label="Active Users" value={a.userSummary.length} icon={Users} iconBg="bg-type-story-bg" iconColor="text-type-story" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Action breakdown */}
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">By Action</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <ScrollArea className="h-52">
                            <div className="space-y-1.5">
                              {a.actionSummary.map((action) => (
                                <div key={action.action} className="flex items-center justify-between text-[11px] px-2 py-1 rounded hover:bg-muted/20">
                                  <span className="text-muted-foreground truncate">{action.action.replace(/_/g, ' ')}</span>
                                  <span className="font-medium tabular-nums ml-2">{action.count}</span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      {/* Top users */}
                      <Card className="border-border/50 bg-card transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">Top Users</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <ScrollArea className="h-52">
                            <div className="space-y-2">
                              {a.userSummary.slice(0, 10).map((entry) => (
                                <div key={entry.userId} className="flex items-center gap-2 text-[11px]">
                                  <Avatar className="h-5 w-5 flex-shrink-0">
                                    <AvatarImage src={entry.user?.avatar || undefined} />
                                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                      {(entry.user?.name || '?').slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium truncate flex-1">{entry.user?.name || 'Unknown'}</span>
                                  <span className="text-muted-foreground tabular-nums">{entry.count}</span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>

                      {/* Recent activity */}
                      <Card className="border-border/50 bg-card lg:col-span-1">
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-4">
                          <ScrollArea className="h-52">
                            <div className="space-y-1.5">
                              {a.activities.slice(0, 20).map((act) => (
                                <div key={act.id} className="px-2 py-1.5 rounded bg-muted/10 text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium">{act.user.name}</span>
                                    <span className="text-muted-foreground">{act.action.replace(/_/g, ' ')}</span>
                                  </div>
                                  {act.issue && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      <span className="font-mono">{act.issue.key}</span> {act.issue.title}
                                    </p>
                                  )}
                                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                    {new Date(act.createdAt).toLocaleString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )
              })() : <EmptyState message="No audit data" />}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  )
}
