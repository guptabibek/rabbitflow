'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  ArrowRight,
  CalendarClock,
  CircleSlash,
  FolderOpen,
  Inbox,
  ListChecks,
  UserPlus,
  Zap,
} from 'lucide-react'

import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Metric, MetricRow, MeterBar } from '@/components/ui/metric'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { EmptyState } from '@/components/ui/states'
import {
  PriorityIndicator,
  StatusBadge,
  TypeIcon,
  getStatusDotClass,
  getStatusLabel,
  priorityRank,
} from '@/components/project-management/work-item-indicators'

interface DashboardStats {
  totalProjects?: number
  totalIssues?: number
  totalUsers?: number
  total?: number
  done?: number
  progress?: number
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
  workItemType?: string
  updatedAt?: string
  project?: { key: string; name: string; color: string }
  assignee: { id: string; name: string; avatar: string | null } | null
}

interface CountBucket {
  status?: string
  priority?: string
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

interface ActivityEntry {
  id: string
  action?: string
  type?: string
  createdAt: string
  user?: { id: string; name: string; avatar: string | null } | null
  issue?: { key: string; title: string } | null
}

/** Statuses that mean the item is neither finished nor abandoned. */
const OPEN_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'in_review'])

const STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']

export function DashboardView() {
  const openWorkItem = useAppStore((s) => s.openWorkItem)
  const {
    currentProject,
    currentUser,
    issues,
    users,
    setCreateIssueOpen,
    currentProjectPermissions,
  } = useAppStore()

  const [stats, setStats] = useState<DashboardStats>({})
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [recentIssues, setRecentIssues] = useState<RecentIssue[]>([])
  const [issuesByStatus, setIssuesByStatus] = useState<CountBucket[]>([])
  const [activeSprint, setActiveSprint] = useState<ActiveSprint | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
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
          // Already returned by /api/dashboard and previously discarded, which
          // is why the project overview could not say what anyone had done.
          setActivity(data.recentActivity || [])
        }
      } catch (error) {
        console.error('Failed to fetch dashboard:', error)
      }
      if (mounted) setIsLoading(false)
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [currentProject])

  const totalIssues = issuesByStatus.reduce((sum, entry) => sum + entry._count, 0)
  const doneIssues = issuesByStatus.find((entry) => entry.status === 'done')?._count || 0
  const inProgress =
    (issuesByStatus.find((entry) => entry.status === 'in_progress')?._count || 0) +
    (issuesByStatus.find((entry) => entry.status === 'in_review')?._count || 0)
  const openIssues = issuesByStatus
    .filter((entry) => OPEN_STATUSES.has(entry.status ?? ''))
    .reduce((sum, entry) => sum + entry._count, 0)
  const progress = totalIssues > 0 ? Math.round((doneIssues / totalIssues) * 100) : 0

  const statusSegments = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        label: getStatusLabel(status),
        value: issuesByStatus.find((entry) => entry.status === status)?._count ?? 0,
        className: getStatusDotClass(status),
      })).filter((segment) => segment.value > 0),
    [issuesByStatus]
  )

  /**
   * The dashboard's reason to exist: work that will not move unless somebody
   * does something about it. Unassigned first (nobody owns it), then open work
   * ranked by priority. Four rows, because a list of everything is a backlog,
   * not an alert.
   */
  const needsAttention = useMemo(() => {
    const open = issues.filter((issue) => OPEN_STATUSES.has(issue.status))
    return [...open]
      .sort((a, b) => {
        const unassigned = Number(!b.assignee) - Number(!a.assignee)
        if (unassigned !== 0) return unassigned
        return priorityRank(b.priority) - priorityRank(a.priority)
      })
      .slice(0, 5)
  }, [issues])

  const unassignedCount = useMemo(
    () => issues.filter((issue) => OPEN_STATUSES.has(issue.status) && !issue.assignee).length,
    [issues]
  )

  const myOpenItems = useMemo(
    () =>
      issues.filter(
        (issue) => OPEN_STATUSES.has(issue.status) && issue.assignee?.id === currentUser?.id
      ),
    [issues, currentUser?.id]
  )

  const sprintDaysLeft = useMemo(() => {
    if (!activeSprint?.endDate) return null
    const end = new Date(activeSprint.endDate).getTime()
    const days = Math.ceil((end - Date.now()) / 86_400_000)
    return Number.isFinite(days) ? days : null
  }, [activeSprint?.endDate])

  if (isLoading) {
    return (
      <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
        <Skeleton className="h-[4.75rem] w-full" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-view-in space-y-4 px-4 py-4 sm:px-6 sm:py-5">
      {/*
        One bordered strip rather than four floating cards with tinted icon
        squares. The figures sit on a shared baseline so they can be compared,
        and each is a link to the view that explains it — a number you cannot
        act on does not belong on a dashboard.
      */}
      <MetricRow>
        <Metric
          label="Open"
          value={openIssues}
          hint={`${totalIssues} total in project`}
          icon={Inbox}
        />
        <Metric label="In flight" value={inProgress} hint="In progress or review" icon={Zap} />
        <Metric
          label="Unassigned"
          value={unassignedCount}
          hint={unassignedCount > 0 ? 'Nobody owns these' : 'Everything has an owner'}
          tone={unassignedCount > 0 ? 'warning' : 'default'}
          icon={UserPlus}
        />
        <Metric
          label="Assigned to me"
          value={myOpenItems.length}
          hint={currentUser?.name ?? undefined}
          icon={ListChecks}
        />
        <Metric
          label="Complete"
          value={`${progress}%`}
          hint={`${doneIssues} of ${totalIssues} done`}
          tone={progress >= 80 ? 'success' : 'default'}
        />
      </MetricRow>

      {/* Flow, as one honest bar. A donut of six slices takes 260px of height
          to say what a 6px bar and a legend say better. */}
      {statusSegments.length > 0 ? (
        <Panel>
          <PanelHeader
            title="Flow"
            description="Where every work item in this project currently sits"
          />
          <PanelBody className="space-y-2.5">
            <MeterBar
              segments={statusSegments.map((segment) => ({
                label: segment.label,
                value: segment.value,
                className: segment.className,
              }))}
              ariaLabel={statusSegments
                .map((segment) => `${segment.label}: ${segment.value}`)
                .join(', ')}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {statusSegments.map((segment) => (
                <div key={segment.status} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn('size-1.5 rounded-full', segment.className)}
                  />
                  <span className="text-[12px] text-muted-foreground">{segment.label}</span>
                  <span className="text-[12px] font-medium tabular-nums text-foreground">
                    {segment.value}
                  </span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Needs attention */}
          <Panel>
            <PanelHeader
              title="Needs attention"
              description="Unowned and high-priority work, most urgent first"
              actions={
                needsAttention.length > 0 ? (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {needsAttention.length} of {openIssues}
                  </span>
                ) : null
              }
            />
            {needsAttention.length === 0 ? (
              <EmptyState
                size="sm"
                icon={CircleSlash}
                title="Nothing is waiting"
                description="Every open item has an owner and no high-priority work is unattended."
              />
            ) : (
              <ul className="divide-y divide-border">
                {needsAttention.map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => openWorkItem(issue.id)}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <TypeIcon type={issue.workItemType} />
                      <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                        {issue.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {issue.title}
                      </span>
                      {!issue.assignee ? (
                        <span className="hidden shrink-0 rounded-sm bg-warning-bg px-1.5 py-px text-[11px] font-medium text-warning sm:inline">
                          Unassigned
                        </span>
                      ) : null}
                      <span className="hidden shrink-0 items-center sm:flex">
                        <PriorityIndicator priority={issue.priority} showLabel={false} />
                      </span>
                      <span className="hidden shrink-0 items-center md:flex">
                        <StatusBadge status={issue.status} variant="dot" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Recently updated */}
          <Panel>
            <PanelHeader
              title={currentProject ? 'Recently updated' : 'Recent work items'}
              description="The last things anyone touched"
            />
            {recentIssues.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Inbox}
                title="No work items yet"
                description="Once work is created it will show up here, most recently changed first."
                action={
                  currentProjectPermissions.includes('workitem:create') ? (
                    <Button size="sm" onClick={() => setCreateIssueOpen(true)}>
                      Create a work item
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {recentIssues.slice(0, 6).map((issue) => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => openWorkItem(issue.id)}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      {issue.project ? (
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: issue.project.color }}
                        />
                      ) : (
                        <TypeIcon type={issue.workItemType ?? 'task'} />
                      )}
                      <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                        {issue.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                        {issue.title}
                      </span>
                      <span className="hidden shrink-0 items-center md:flex">
                        <StatusBadge status={issue.status} variant="dot" />
                      </span>
                      {issue.assignee ? (
                        <Avatar className="size-5 shrink-0">
                          <AvatarImage src={issue.assignee.avatar || undefined} />
                          <AvatarFallback className="bg-primary-muted text-[9px] font-semibold text-primary">
                            {issue.assignee.name
                              .split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <span className="size-5 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          {currentProject ? (
            <Panel>
              <PanelHeader title="Active sprint" icon={CalendarClock} />
              <PanelBody className="space-y-3">
                {activeSprint ? (
                  <>
                    <div>
                      <p className="type-heading truncate text-foreground">{activeSprint.name}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {activeSprint.goal || 'No sprint goal has been set.'}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3">
                      <div>
                        <dt className="type-label">Scope</dt>
                        <dd className="mt-0.5 text-[13px] font-medium tabular-nums text-foreground">
                          {activeSprint._count?.issues ?? 0} items
                        </dd>
                      </div>
                      <div>
                        <dt className="type-label">Remaining</dt>
                        <dd
                          className={cn(
                            'mt-0.5 text-[13px] font-medium tabular-nums',
                            sprintDaysLeft != null && sprintDaysLeft <= 2
                              ? 'text-warning'
                              : 'text-foreground'
                          )}
                        >
                          {sprintDaysLeft == null
                            ? '—'
                            : sprintDaysLeft < 0
                              ? 'Overdue'
                              : `${sprintDaysLeft} ${sprintDaysLeft === 1 ? 'day' : 'days'}`}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <EmptyState
                    size="sm"
                    icon={CalendarClock}
                    title="No sprint running"
                    description="Start a sprint to give the team a scoped, time-boxed goal."
                  />
                )}
              </PanelBody>
            </Panel>
          ) : (
            <Panel>
              <PanelHeader title="Recent projects" icon={FolderOpen} />
              {recentProjects.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={FolderOpen}
                  title="No projects yet"
                  description="Projects group work items, sprints and teams."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {recentProjects.map((project) => (
                    <li
                      key={project.id}
                      className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-surface-hover"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white"
                        style={{ backgroundColor: project.color }}
                      >
                        {project.key.slice(0, 2)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {project.name}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {project._count.issues}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {/* Activity. Compact, because it is context rather than a task. */}
          <Panel>
            <PanelHeader title="Activity" description={`${users.length} people on this project`} />
            {activity.length === 0 ? (
              <EmptyState
                size="sm"
                icon={Inbox}
                title="Nothing has happened yet"
                description="Changes to work items will be recorded here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {activity.slice(0, 7).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 px-3.5 py-2">
                    <Avatar className="mt-px size-5 shrink-0">
                      <AvatarImage src={entry.user?.avatar || undefined} />
                      <AvatarFallback className="bg-surface-sunken text-[9px] font-semibold text-muted-foreground">
                        {(entry.user?.name ?? '?')
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-foreground">
                        <span className="font-medium">{entry.user?.name ?? 'Someone'}</span>{' '}
                        <span className="text-muted-foreground">
                          {(entry.action ?? entry.type ?? 'updated').replace(/_/g, ' ')}
                        </span>{' '}
                        {entry.issue ? (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {entry.issue.key}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
