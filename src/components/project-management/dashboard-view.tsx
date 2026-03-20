'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/app-store'
import { canonicalWorkItemRoute } from '@/lib/domain/work-item-view'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FolderKanban,
  CheckCircle2,
  TrendingUp,
  Users,
  ArrowRight,
  Inbox,
  BarChart3,
} from 'lucide-react'

interface DashboardStats {
  totalProjects?: number
  totalIssues?: number
  totalUsers?: number
}

interface RecentProject {
  id: string
  key: string
  name: string
  color: string
  _count: { issues: number }
}

interface RecentIssue {
  id: string
  key: string
  title: string
  status: string
  priority: string
  project: { key: string; name: string; color: string }
  assignee: { id: string; name: string; avatar: string | null } | null
}

interface IssueByStatus {
  status: string
  _count: number
}

interface ActiveSprint {
  id: string
  name: string
  goal: string | null
  status: string
  startDate: string | null
  endDate: string | null
  _count?: { issues: number }
}

const statusColorMap: Record<string, { bg: string; text: string; bar: string }> = {
  backlog: { bg: 'bg-slate-500/10', text: 'text-slate-400', bar: 'bg-slate-500' },
  todo: { bg: 'bg-slate-500/10', text: 'text-slate-500', bar: 'bg-slate-500' },
  in_progress: { bg: 'bg-blue-500/10', text: 'text-blue-500', bar: 'bg-blue-500' },
  in_review: { bg: 'bg-amber-500/10', text: 'text-amber-500', bar: 'bg-amber-500' },
  done: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', bar: 'bg-emerald-500' },
  cancelled: { bg: 'bg-red-500/10', text: 'text-red-500', bar: 'bg-red-500' },
}

export function DashboardView() {
  const router = useRouter()
  const { currentProject, projects, users } = useAppStore()
  const [stats, setStats] = useState<DashboardStats>({})
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([])
  const [issuesByStatus, setIssuesByStatus] = useState<IssueByStatus[]>([])
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const loadData = async () => {
      setIsLoading(true)
      try {
        const url = currentProject
          ? `/api/dashboard?projectId=${currentProject.id}`
          : '/api/dashboard'
        const res = await fetch(url)
        if (res.ok && mounted) {
          const data = await res.json()
          setStats(data.stats || {})
          setRecentProjects(data.recentProjects || [])
          setRecentIssues(data.recentIssues || [])
          setIssuesByStatus(data.issuesByStatus || [])
          setActiveSprint(data.activeSprint || null)
        }
      } catch (error) {
        console.error('Failed to fetch dashboard:', error)
      }
      if (mounted) setIsLoading(false)
    }
    loadData()
    return () => { mounted = false }
  }, [currentProject])

  const totalIssues = issuesByStatus.reduce((sum, s) => sum + s._count, 0)
  const doneIssues = issuesByStatus.find((s) => s.status === 'done')?._count || 0
  const progress = totalIssues > 0 ? Math.round((doneIssues / totalIssues) * 100) : 0

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  const statCards = [
    {
      label: 'Projects',
      value: stats.totalProjects || projects.length,
      icon: FolderKanban,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Total Issues',
      value: stats.totalIssues || totalIssues,
      icon: CheckCircle2,
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-500',
    },
    {
      label: 'Team Members',
      value: stats.totalUsers || users.length,
      icon: Users,
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-500',
    },
    {
      label: 'Progress',
      value: `${progress}%`,
      icon: TrendingUp,
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-500',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className="border-border/50 bg-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-3.5">
                <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                  <p className="text-2xl font-bold text-foreground tabular-nums">{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress Overview */}
      <Card className="border-border/50 bg-card">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Issue Progress</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Completion Rate</span>
              <span className="text-xs font-semibold tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
            <div className="flex flex-wrap gap-3 pt-1">
              {issuesByStatus.map((s) => {
                const colors = statusColorMap[s.status] || statusColorMap.backlog
                return (
                  <div key={s.status} className="flex items-center gap-1.5">
                    <div className={`h-2.5 w-2.5 rounded-full ${colors.bar}`} />
                    <span className="text-xs capitalize text-muted-foreground">
                      {s.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-foreground">{s._count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel */}
        <Card className="border-border/50 bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">
              {currentProject ? 'Active Sprint' : 'Recent Projects'}
            </h3>
            {currentProject ? (
              activeSprint ? (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {activeSprint.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {activeSprint.status}
                      </p>
                    </div>
                  </div>
                  {activeSprint.goal ? (
                    <p className="text-xs text-muted-foreground">{activeSprint.goal}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No sprint goal has been set.
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {activeSprint._count?.issues ?? 0} work item
                      {(activeSprint._count?.issues ?? 0) === 1 ? '' : 's'}
                    </span>
                    <span>
                      {activeSprint.startDate
                        ? new Date(activeSprint.startDate).toLocaleDateString()
                        : 'No start'}
                      {' - '}
                      {activeSprint.endDate
                        ? new Date(activeSprint.endDate).toLocaleDateString()
                        : 'No end'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No active sprint</p>
                </div>
              )
            ) : (
              <ScrollArea className="h-60">
                <div className="space-y-1">
                  {recentProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                    >
                      <div
                        className="h-8 w-8 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: project.color }}
                      >
                        {project.key.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                        <p className="text-[11px] text-muted-foreground">{project._count.issues} issues</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </div>
                  ))}
                  {recentProjects.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Inbox className="h-8 w-8 text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">No projects yet</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Recent Issues */}
        <Card className="border-border/50 bg-card">
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recent Issues</h3>
            <ScrollArea className="h-60">
              <div className="space-y-1">
                {recentIssues.map((issue) => {
                  const statusStyle = statusColorMap[issue.status] || statusColorMap.backlog
                  return (
                    <div
                      key={issue.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => router.push(canonicalWorkItemRoute(issue.id))}
                    >
                      <div
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: issue.project?.color || '#6b7280' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{issue.title}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">{issue.key}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] capitalize border-0 font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                        {issue.status.replace('_', ' ')}
                      </Badge>
                      {issue.assignee && (
                        <Avatar className="h-5 w-5 flex-shrink-0">
                          <AvatarImage src={issue.assignee.avatar || undefined} />
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-medium">
                            {issue.assignee.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )
                })}
                {recentIssues.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Inbox className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">No issues yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
