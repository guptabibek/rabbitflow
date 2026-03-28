'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAppStore, type Issue, type WorkItemType, type User } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
} from '@dnd-kit/core'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from 'recharts'
import {
  KanbanSquare,
  List,
  Plus,
  Layers,
  Flag,
  Star,
  CheckCircle2,
  Bug,
  CircleDot,
  PackageCheck,
  Rocket,
  Zap,
  Minus,
  Calendar,
  Target,
  TrendingDown,
  Hash,
  Users,
  AlertTriangle,
  Activity,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'
import { format, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { PIE_COLORS as PIE_COLORS_TOKENS } from '@/lib/ui-tokens'
import type { Iteration } from '@/store/app-store'

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const BOARD_COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'bg-status-todo-bar' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-status-in-progress-bar' },
  { id: 'in_review', label: 'In Review', color: 'bg-status-in-review-bar' },
  { id: 'done', label: 'Done', color: 'bg-status-done-bar' },
] as const

const TYPE_ICONS: Record<string, React.ElementType> = {
  epic: Layers,
  feature: Flag,
  story: Star,
  task: CheckCircle2,
  bug: Bug,
  issue: CircleDot,
  design_doc: Rocket,
  release_item: PackageCheck,
}
const TYPE_COLORS: Record<string, string> = {
  epic: 'text-type-epic',
  feature: 'text-type-feature',
  story: 'text-type-story',
  task: 'text-type-task',
  bug: 'text-type-bug',
  issue: 'text-type-issue',
  design_doc: 'text-type-design-doc',
  release_item: 'text-type-release-item',
}
const TYPE_BG: Record<string, string> = {
  epic: 'bg-type-epic-bg',
  feature: 'bg-type-feature-bg',
  story: 'bg-type-story-bg',
  task: 'bg-type-task-bg',
  bug: 'bg-type-bug-bg',
  issue: 'bg-type-issue-bg',
  design_doc: 'bg-type-design-doc-bg',
  release_item: 'bg-type-release-item-bg',
}
const STATUS_BADGE: Record<string, string> = {
  backlog: 'bg-status-backlog-bg text-status-backlog', todo: 'bg-status-todo-bg text-status-todo',
  in_progress: 'bg-status-in-progress-bg text-status-in-progress', in_review: 'bg-status-in-review-bg text-status-in-review',
  done: 'bg-status-done-bg text-status-done', cancelled: 'bg-status-cancelled-bg text-status-cancelled',
}
const PIE_COLORS = PIE_COLORS_TOKENS
const ALL_TEAMS_VALUE = '__all_teams__'

function normalizeIterationStatus(value: string | null | undefined): 'planning' | 'active' | 'completed' {
  const normalized = value?.trim().toLowerCase()

  if (!normalized || normalized === 'planned' || normalized === 'planning') {
    return 'planning'
  }

  if (normalized === 'active') {
    return 'active'
  }

  if (normalized === 'closed' || normalized === 'completed') {
    return 'completed'
  }

  return 'planning'
}

function getComparableDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  date.setHours(0, 0, 0, 0)
  return date
}

function isSprintCurrentByDate(sprint: Iteration, today: Date) {
  const startDate = getComparableDate(sprint.startDate)
  const endDate = getComparableDate(sprint.endDate)

  if (startDate && endDate) {
    return startDate <= today && endDate >= today
  }

  if (startDate) {
    return startDate <= today
  }

  if (endDate) {
    return endDate >= today
  }

  return false
}

function getDefaultSprintId(sprints: Iteration[]) {
  if (sprints.length === 0) {
    return null
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const explicitActiveSprint = sprints.find((sprint) => normalizeIterationStatus(sprint.status) === 'active')
  if (explicitActiveSprint) {
    return explicitActiveSprint.id
  }

  const currentSprint = sprints.find(
    (sprint) =>
      normalizeIterationStatus(sprint.status) !== 'completed' &&
      isSprintCurrentByDate(sprint, today)
  )
  if (currentSprint) {
    return currentSprint.id
  }

  const upcomingSprint = [...sprints]
    .filter((sprint) => normalizeIterationStatus(sprint.status) !== 'completed')
    .map((sprint) => ({ sprint, startDate: getComparableDate(sprint.startDate) }))
    .filter((entry) => entry.startDate && entry.startDate >= today)
    .sort((left, right) => left.startDate!.getTime() - right.startDate!.getTime())[0]?.sprint
  if (upcomingSprint) {
    return upcomingSprint.id
  }

  const latestPastSprint = [...sprints]
    .map((sprint) => ({
      sprint,
      anchorDate: getComparableDate(sprint.endDate) ?? getComparableDate(sprint.startDate),
    }))
    .filter((entry) => entry.anchorDate)
    .sort((left, right) => right.anchorDate!.getTime() - left.anchorDate!.getTime())[0]?.sprint
  if (latestPastSprint) {
    return latestPastSprint.id
  }

  return sprints[0]?.id ?? null
}

type GroupBy = 'none' | 'status' | 'assignee' | 'priority' | 'story'

type AnalyticsData = {
  stats: { totalItems: number; completedItems: number; remainingItems: number; totalPoints: number; completedPoints: number; remainingPoints: number }
  burndown: Array<{ date: string; remaining: number; ideal: number; completed: number }>
  byType: Array<{ name: string; value: number }>
  byStatus: Array<{ name: string; value: number }>
}

type CapacityEntry = {
  id: string | null; userId: string
  user: { id: string; name: string; email: string; avatar: string | null }
  role: string; hoursPerDay: number; daysOff: number; totalCapacity: number
  assignedPoints: number; assignedItems: number; notes: string | null
  assignedEstimatedHours: number
  assignedRemainingHours: number
  assignedCompletedHours: number
}

type CapacityData = {
  capacities: CapacityEntry[]
  totals: {
    totalCapacity: number
    totalAssignedPoints: number
    totalAssignedEstimatedHours: number
    totalAssignedRemainingHours: number
    totalAssignedCompletedHours: number
    totalAssignedItems: number
    sprintDays: number
    memberCount: number
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SPRINT CARD
   ═══════════════════════════════════════════════════════════════════════════ */

function SprintCardContent({ issue }: { issue: Issue }) {
  const Icon = TYPE_ICONS[issue.workItemType] || CheckCircle2
  const color = TYPE_COLORS[issue.workItemType] || 'text-muted-foreground'
  const bg = TYPE_BG[issue.workItemType] || 'bg-muted'

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className={`h-5 w-5 rounded flex items-center justify-center ${bg}`}>
            <Icon className={`h-3 w-3 ${color}`} />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground font-medium">{issue.key}</span>
        </div>
        {(issue.priority === 'high' || issue.priority === 'highest') && (
          <Badge variant="outline" className="h-4 text-[9px] px-1 border-red-500/40 text-red-400">
            {issue.priority === 'highest' ? '!!!' : '!!'}
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium leading-snug line-clamp-2 mb-3">{issue.title}</p>
      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {issue.labels.slice(0, 2).map((l) => (
            <span key={l.label.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{ backgroundColor: l.label.color + '20', color: l.label.color }}>
              {l.label.name}
            </span>
          ))}
          {issue.labels.length > 2 && <span className="text-[9px] text-muted-foreground">+{issue.labels.length - 2}</span>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {issue.assignee ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger>
                  <Avatar className="h-5 w-5 ring-1 ring-border">
                    <AvatarImage src={issue.assignee.avatar || undefined} />
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                      {issue.assignee.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs">{issue.assignee.name}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="h-5 w-5 rounded-full bg-muted border border-dashed border-muted-foreground/30" />
          )}
        </div>
        {issue.storyPoints != null && issue.storyPoints > 0 && (
          <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-mono tabular-nums">{issue.storyPoints} SP</Badge>
        )}
      </div>
    </>
  )
}

function DraggableCard({ issue, onClick }: { issue: Issue; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: issue.id, data: { status: issue.status } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}
      className={`p-3 rounded-lg border bg-card mb-2 cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:border-primary/30 ${isDragging ? 'opacity-30 shadow-xl ring-2 ring-primary/20 scale-95' : ''}`}>
      <SprintCardContent issue={issue} />
    </div>
  )
}

function DroppableColumn({ id, label, color, count, children }: { id: string; label: string; color: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'column' } })
  return (
    <div ref={setNodeRef} className={`flex h-full min-h-[26rem] w-[min(340px,78vw)] flex-shrink-0 flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-sm backdrop-blur transition-all duration-150 ${isOver ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/15 shadow-lg' : 'border-border/60 hover:border-border/90'}`}>
      <div className="flex items-center gap-2.5 border-b border-border/70 px-4 py-3.5">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] tabular-nums">{count}</Badge>
      </div>
      <ScrollArea className="h-[calc(100vh-26rem)] min-h-[22rem]">
        <div className="min-h-[8rem] space-y-3 p-3">
          {children}
          {count === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/20 py-10 text-muted-foreground/50">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/20 bg-background/70">
                <Plus className="h-3.5 w-3.5" />
              </div>
              <p className="text-[11px]">Drop items here</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SprintMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: React.ElementType
  tone?: 'default' | 'positive' | 'warning' | 'danger'
}) {
  const toneClasses =
    tone === 'positive'
      ? 'border-emerald-500/20 bg-emerald-500/[0.06]'
      : tone === 'warning'
        ? 'border-amber-500/20 bg-amber-500/[0.07]'
        : tone === 'danger'
          ? 'border-destructive/20 bg-destructive/[0.06]'
          : 'border-border/70 bg-card/80'

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm backdrop-blur ${toneClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <div className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</div>
          {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export function SprintView() {
  const openWorkItem = useAppStore((s) => s.openWorkItem)
  const {
    currentProject,
    iterations,
    teams,
    setSprintModalOpen,
    updateIssue,
    sprintViewSelectionByProject,
    setSprintViewSelection,
  } = useAppStore()

  const isActiveStatus = (value: string | null | undefined) =>
    normalizeIterationStatus(value) === 'active'
  const isClosedStatus = (value: string | null | undefined) =>
    normalizeIterationStatus(value) === 'completed'

  const projectSelection = currentProject
    ? sprintViewSelectionByProject[currentProject.id]
    : undefined

  const initialActiveTab: 'overview' | 'board' | 'backlog' | 'capacity' =
    projectSelection?.activeTab ?? 'backlog'
  const initialBoardGroupBy: GroupBy = projectSelection?.boardGroupBy ?? 'none'
  const initialBacklogGroupBy: GroupBy = projectSelection?.backlogGroupBy ?? 'story'

  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(
    projectSelection?.selectedSprintId ?? null
  )
  const [activeTab, setActiveTab] = useState<'overview' | 'board' | 'backlog' | 'capacity'>(
    initialActiveTab
  )
  const [loadedTabs, setLoadedTabs] = useState<Set<'overview' | 'board' | 'backlog' | 'capacity'>>(
    () => new Set([initialActiveTab])
  )
  const [sprintIssues, setSprintIssues] = useState<Issue[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsSprintId, setAnalyticsSprintId] = useState<string | null>(null)
  const [capacityData, setCapacityData] = useState<CapacityData | null>(null)
  const [capacitySprintId, setCapacitySprintId] = useState<string | null>(null)
  const analyticsRequestRef = useRef<string | null>(null)
  const capacityRequestRef = useRef<string | null>(null)
  const analyticsLoadedRef = useRef<string | null>(null)
  const capacityLoadedRef = useRef<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    projectSelection?.selectedTeamId ?? ALL_TEAMS_VALUE
  )
  const hasInitializedTeamSelection = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)
  const [boardGroupBy, setBoardGroupBy] = useState<GroupBy>(initialBoardGroupBy)
  const [backlogGroupBy, setBacklogGroupBy] = useState<GroupBy>(initialBacklogGroupBy)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const allSprints = useMemo(() =>
    iterations.filter((i) => i.iterationType === 'sprint').sort((a, b) => {
      if (isActiveStatus(a.status) && !isActiveStatus(b.status)) return -1
      if (isActiveStatus(b.status) && !isActiveStatus(a.status)) return 1
      return (a.startDate || '').localeCompare(b.startDate || '')
    }), [iterations])

  const sprintTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name)),
    [teams]
  )

  const sprints = useMemo(() => {
    if (selectedTeamId === ALL_TEAMS_VALUE) {
      return allSprints
    }

    return allSprints.filter((sprint) => sprint.teamId === selectedTeamId)
  }, [allSprints, selectedTeamId])

  const isAllTeamsMode = selectedTeamId === ALL_TEAMS_VALUE && sprintTeams.length > 1

  const resolvedSelectedSprintId = useMemo(() => {
    if (isAllTeamsMode) {
      return null
    }

    if (selectedSprintId && sprints.some((sprint) => sprint.id === selectedSprintId)) {
      return selectedSprintId
    }

    return getDefaultSprintId(sprints)
  }, [isAllTeamsMode, selectedSprintId, sprints])

  const selectedSprint = useMemo(
    () => sprints.find((sprint) => sprint.id === resolvedSelectedSprintId) ?? null,
    [resolvedSelectedSprintId, sprints]
  )

  useEffect(() => {
    if (selectedTeamId === ALL_TEAMS_VALUE) return

    const isValidTeam = sprintTeams.some((team) => team.id === selectedTeamId)
    if (!isValidTeam) {
      setSelectedTeamId(ALL_TEAMS_VALUE)
    }
  }, [selectedTeamId, sprintTeams])

  useEffect(() => {
    if (!hasInitializedTeamSelection.current) {
      hasInitializedTeamSelection.current = true
      return
    }

    setSelectedSprintId(null)
    setSprintIssues([])
    setAnalytics(null)
    setCapacityData(null)
    setAnalyticsSprintId(null)
    setCapacitySprintId(null)
    analyticsLoadedRef.current = null
    capacityLoadedRef.current = null
    analyticsRequestRef.current = null
    capacityRequestRef.current = null
  }, [selectedTeamId])

  useEffect(() => {
    if (!currentProject) {
      return
    }

    const savedSelection =
      useAppStore.getState().sprintViewSelectionByProject[currentProject.id]
    setSelectedTeamId(savedSelection?.selectedTeamId ?? ALL_TEAMS_VALUE)
    setSelectedSprintId(savedSelection?.selectedSprintId ?? null)
    setActiveTab(savedSelection?.activeTab ?? 'backlog')
    setBoardGroupBy(savedSelection?.boardGroupBy ?? 'none')
    setBacklogGroupBy(savedSelection?.backlogGroupBy ?? 'story')
    hasInitializedTeamSelection.current = false
  }, [currentProject?.id])

  useEffect(() => {
    if (!currentProject) {
      return
    }

    setSprintViewSelection(currentProject.id, {
      selectedTeamId,
      selectedSprintId,
      activeTab,
      boardGroupBy,
      backlogGroupBy,
    })
  }, [
    activeTab,
    backlogGroupBy,
    boardGroupBy,
    currentProject?.id,
    selectedSprintId,
    selectedTeamId,
    setSprintViewSelection,
  ])

  const daysRemaining = useMemo(() => {
    if (!selectedSprint?.endDate) return null
    return Math.max(0, differenceInDays(new Date(selectedSprint.endDate), new Date()))
  }, [selectedSprint])

  const totalDays = useMemo(() => {
    if (!selectedSprint?.startDate || !selectedSprint?.endDate) return null
    return Math.max(1, differenceInDays(new Date(selectedSprint.endDate), new Date(selectedSprint.startDate)))
  }, [selectedSprint])

  const daysPassed = useMemo(() => {
    if (totalDays === null || daysRemaining === null) return 0
    return totalDays - daysRemaining
  }, [totalDays, daysRemaining])

  const progressPercent = useMemo(() => {
    if (!analytics) return 0
    const { totalItems, completedItems } = analytics.stats
    return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
  }, [analytics])

  const boardColumns = useMemo(() =>
    BOARD_COLUMNS.map((col) => ({
      ...col,
      issues: sprintIssues.filter((i) => i.status === col.id).sort((a, b) => a.columnOrder - b.columnOrder),
    })), [sprintIssues])

  const storyBacklogData = useMemo(() => {
    const ordered = [...sprintIssues].sort((a, b) => a.columnOrder - b.columnOrder)
    const stories = ordered.filter((issue) => issue.workItemType === 'story')
    const storyIds = new Set(stories.map((issue) => issue.id))

    const childrenByParent = new Map<string, Issue[]>()
    ordered.forEach((issue) => {
      if (!issue.parentIssueId || !storyIds.has(issue.parentIssueId)) return
      const existing = childrenByParent.get(issue.parentIssueId) ?? []
      childrenByParent.set(issue.parentIssueId, [...existing, issue])
    })

    const storyGroups = stories.map((parent) => ({
      parent,
      children: childrenByParent.get(parent.id) ?? [],
    }))

    const standalone = ordered.filter((issue) => {
      if (issue.workItemType === 'story') return false
      if (!issue.parentIssueId) return true
      return !storyIds.has(issue.parentIssueId)
    })

    return { storyGroups, standalone }
  }, [sprintIssues])

  const fetchSprintIssues = useCallback(async (targetSprintId: string) => {
    if (!currentProject || !targetSprintId) return

    setIsLoading(true)
    try {
      const issuesRes = await fetch(
        `/api/issues?projectId=${currentProject.id}&iterationId=${targetSprintId}`,
        { cache: 'no-store' }
      )

      if (!issuesRes.ok) {
        const errorPayload = await issuesRes.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to load sprint backlog')
        return
      }

      setSprintIssues(await issuesRes.json())
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to fetch sprint issues:', error)
      toast.error('Failed to fetch sprint data')
    } finally {
      setIsLoading(false)
    }
  }, [currentProject])

  const fetchSprintAnalytics = useCallback(async (targetSprintId: string) => {
    if (
      !targetSprintId ||
      analyticsLoadedRef.current === targetSprintId ||
      analyticsRequestRef.current === targetSprintId
    ) {
      return
    }

    analyticsRequestRef.current = targetSprintId

    try {
      const analyticsRes = await fetch(`/api/sprints/${targetSprintId}/analytics`, {
        cache: 'no-store',
      })

      if (!analyticsRes.ok) {
        const errorPayload = await analyticsRes.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to load sprint analytics')
        return
      }

      setAnalytics(await analyticsRes.json())
      setAnalyticsSprintId(targetSprintId)
      analyticsLoadedRef.current = targetSprintId
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to fetch sprint analytics:', error)
      toast.error('Failed to load sprint analytics')
    } finally {
      if (analyticsRequestRef.current === targetSprintId) {
        analyticsRequestRef.current = null
      }
    }
  }, [])

  const fetchSprintCapacity = useCallback(async (targetSprintId: string) => {
    if (
      !targetSprintId ||
      capacityLoadedRef.current === targetSprintId ||
      capacityRequestRef.current === targetSprintId
    ) {
      return
    }

    capacityRequestRef.current = targetSprintId

    try {
      const capacityRes = await fetch(`/api/sprints/${targetSprintId}/capacity`, {
        cache: 'no-store',
      })

      if (!capacityRes.ok) {
        const errorPayload = await capacityRes.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to load sprint capacity')
        return
      }

      setCapacityData(await capacityRes.json())
      setCapacitySprintId(targetSprintId)
      capacityLoadedRef.current = targetSprintId
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      console.error('Failed to fetch sprint capacity:', error)
      toast.error('Failed to load sprint capacity')
    } finally {
      if (capacityRequestRef.current === targetSprintId) {
        capacityRequestRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!currentProject || !resolvedSelectedSprintId) {
      setSprintIssues([])
      setAnalytics(null)
      setCapacityData(null)
      setAnalyticsSprintId(null)
      setCapacitySprintId(null)
      analyticsLoadedRef.current = null
      capacityLoadedRef.current = null
      analyticsRequestRef.current = null
      capacityRequestRef.current = null
      return
    }

    setAnalytics(null)
    setCapacityData(null)
    setAnalyticsSprintId(null)
    setCapacitySprintId(null)
    analyticsLoadedRef.current = null
    capacityLoadedRef.current = null
    analyticsRequestRef.current = null
    capacityRequestRef.current = null

    const timer = window.setTimeout(() => {
      void Promise.all([
        fetchSprintIssues(resolvedSelectedSprintId),
        fetchSprintCapacity(resolvedSelectedSprintId),
      ])
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    currentProject,
    fetchSprintAnalytics,
    fetchSprintCapacity,
    fetchSprintIssues,
    resolvedSelectedSprintId,
  ])

  useEffect(() => {
    setLoadedTabs((previous) => {
      if (previous.has(activeTab)) return previous
      const next = new Set(previous)
      next.add(activeTab)
      return next
    })
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'overview' || !resolvedSelectedSprintId) return
    void fetchSprintAnalytics(resolvedSelectedSprintId)
  }, [activeTab, fetchSprintAnalytics, resolvedSelectedSprintId])

  useEffect(() => {
    if (activeTab !== 'capacity' || !resolvedSelectedSprintId) return
    void fetchSprintCapacity(resolvedSelectedSprintId)
  }, [activeTab, fetchSprintCapacity, resolvedSelectedSprintId])

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragActiveId(null)
    const { active, over } = event
    if (!over) return
    const issueId = active.id as string
    let newStatus: string
    if (over.data.current?.type === 'column') { newStatus = over.id as string }
    else { const oi = sprintIssues.find((i) => i.id === over.id); newStatus = oi?.status || (over.id as string) }
    const issue = sprintIssues.find((i) => i.id === issueId)
    if (!currentProject || !issue) return
    const beforeItemId = over.data.current?.type === 'column' ? null : (over.id as string)

    if (issue.status === newStatus && beforeItemId === null) return

    try {
      const res = await fetch('/api/board', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          itemId: issueId,
          toStatus: newStatus,
          beforeItemId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to move card')
      } else {
        const updated = await res.json()
        setSprintIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updated } : i)))
        updateIssue(issueId, updated)
        if (resolvedSelectedSprintId) {
          void fetchSprintIssues(resolvedSelectedSprintId)
        }
      }
    } catch {
      toast.error('Failed to move card')
    }
  }

  const handleRemoveFromSprint = async (issueId: string) => {
    const issue = sprintIssues.find((i) => i.id === issueId)
    if (!issue) return
    try {
      const res = await fetch(`/api/issues/${issueId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ iterationId: null, version: issue.version }) })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to remove from sprint'))
      }

      const updated = await res.json()
      setSprintIssues((prev) => prev.filter((i) => i.id !== issueId))
      updateIssue(issueId, updated)
      if (resolvedSelectedSprintId) {
        void fetchSprintIssues(resolvedSelectedSprintId)
      }
      toast.success(`${issue.key} removed from sprint`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove from sprint')
    }
  }

  const handleRemoveParentLink = async (issueId: string) => {
    const issue = sprintIssues.find((i) => i.id === issueId)
    if (!issue || !issue.parentIssueId) return

    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentIssueId: null, version: issue.version }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to remove parent link')
        return
      }

      const updated = await res.json()
      setSprintIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updated } : i)))
      updateIssue(issueId, updated)
      if (resolvedSelectedSprintId) {
        void fetchSprintIssues(resolvedSelectedSprintId)
      }
      toast.success('Parent link removed')
    } catch {
      toast.error('Failed to remove parent link')
    }
  }

  const handleCapacitySave = useCallback(async (entries: Array<{ userId: string; hoursPerDay: number; daysOff: number }>) => {
    if (!resolvedSelectedSprintId) return
    try {
      const res = await fetch(`/api/sprints/${resolvedSelectedSprintId}/capacity`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capacities: entries }) })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update capacity'))
      }

      toast.success('Capacity updated')
      capacityLoadedRef.current = null
      analyticsLoadedRef.current = null
      capacityRequestRef.current = null
      analyticsRequestRef.current = null
      setCapacitySprintId(null)
      setAnalyticsSprintId(null)
      void fetchSprintCapacity(resolvedSelectedSprintId)
      void fetchSprintAnalytics(resolvedSelectedSprintId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update capacity')
    }
  }, [fetchSprintAnalytics, fetchSprintCapacity, resolvedSelectedSprintId])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  const groupIssues = (issues: Issue[], groupBy: GroupBy): Array<{ key: string; label: string; issues: Issue[] }> => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All Items', issues }]
    const groups: Record<string, { label: string; issues: Issue[] }> = {}
    issues.forEach((issue) => {
      let key: string, label: string
      switch (groupBy) {
        case 'status': key = issue.status; label = issue.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); break
        case 'assignee': key = issue.assignee?.id || 'unassigned'; label = issue.assignee?.name || 'Unassigned'; break
        case 'priority': key = issue.priority; label = issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1); break
        case 'story':
          if (issue.parentIssue) {
            key = issue.parentIssue.id
            label = `${issue.parentIssue.key} - ${issue.parentIssue.title}`
          } else if (issue.workItemType === 'story') {
            key = issue.id
            label = `${issue.key} - ${issue.title}`
          } else {
            key = 'ungrouped'
            label = 'Standalone Work'
          }
          break
        default: key = 'all'; label = 'All'
      }
      if (!groups[key]) groups[key] = { label, issues: [] }
      groups[key].issues.push(issue)
    })
    return Object.entries(groups).map(([key, val]) => ({ key, ...val }))
  }

  const showNoSprintsEmpty = !isAllTeamsMode && sprints.length === 0
  const showLoadingSkeleton =
    !isAllTeamsMode &&
    Boolean(resolvedSelectedSprintId) &&
    isLoading &&
    sprintIssues.length === 0

  const dragActiveIssue = dragActiveId ? sprintIssues.find((i) => i.id === dragActiveId) : null
  const selectedTeamName =
    selectedTeamId === ALL_TEAMS_VALUE
      ? 'All Teams'
      : sprintTeams.find((team) => team.id === selectedTeamId)?.name ?? 'Team'
  const totalCapacityHours = Math.round(capacityData?.totals.totalCapacity ?? 0)
  const plannedHours = Math.round(capacityData?.totals.totalAssignedEstimatedHours ?? 0)
  const netAvailabilityHours = totalCapacityHours - plannedHours
  const assignedItemsCount = capacityData?.totals.totalAssignedItems ?? sprintIssues.length
  const assignedPoints = capacityData?.totals.totalAssignedPoints ?? analytics?.stats.totalPoints ?? 0
  const capacityUtilizationPercent =
    totalCapacityHours > 0
      ? Math.min(100, Math.round((plannedHours / totalCapacityHours) * 100))
      : plannedHours > 0
        ? 100
        : 0
  const overloadedMembers =
    capacityData?.capacities.filter((entry) => entry.assignedEstimatedHours > entry.totalCapacity).length ?? 0
  const sprintDateLabel =
    selectedSprint?.startDate && selectedSprint?.endDate
      ? `${format(new Date(selectedSprint.startDate), 'MMM d')} - ${format(new Date(selectedSprint.endDate), 'MMM d, yyyy')}`
      : 'Sprint dates not set'
  const capacityTone: 'default' | 'positive' | 'warning' | 'danger' =
    netAvailabilityHours < 0
      ? 'danger'
      : capacityUtilizationPercent >= 90
        ? 'warning'
        : 'positive'

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.06),_transparent_38%),linear-gradient(to_bottom,_hsl(var(--background)),_hsl(var(--background)))]">
      <div className="sticky top-0 z-20 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="space-y-5 px-4 py-4 md:px-6 xl:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {selectedSprint?.name ?? (isAllTeamsMode ? 'Cross-team sprint planning' : 'Sprint planning')}
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    {sprintDateLabel}
                  </span>
                  {selectedSprint?.goal ? (
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="max-w-[42rem] truncate">{selectedSprint.goal}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
              {sprintTeams.length > 1 ? (
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="h-11 w-full rounded-xl border-border/70 bg-background/80 sm:w-[200px]">
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TEAMS_VALUE}>All Teams</SelectItem>
                    {sprintTeams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Select
                value={resolvedSelectedSprintId || ''}
                onValueChange={setSelectedSprintId}
                disabled={isAllTeamsMode || sprints.length === 0}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-border/70 bg-background/80 text-sm font-semibold sm:w-[250px]">
                  <SelectValue placeholder="Select Sprint" />
                </SelectTrigger>
                <SelectContent>
                  {sprints.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        {s.name}
                        {isActiveStatus(s.status) ? <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSprintModalOpen(true)}
                className="h-11 gap-2 rounded-xl border-border/70 bg-background/80 px-4"
              >
                <Flag className="h-3.5 w-3.5" />
                Manage Sprints
              </Button>
            </div>
          </div>

          {isAllTeamsMode ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              All Teams is an aggregate planning mode. Select a team to manage a sprint backlog, delivery board, and capacity plan.
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 border-r border-border/60">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border/70 bg-background/65 px-4 md:px-6">
              <div className="overflow-x-auto">
                <TabsList className="h-auto w-max min-w-full justify-start gap-2 bg-transparent p-0 py-1">
                  {[
                    { value: 'overview', icon: Activity, label: 'Overview' },
                    { value: 'board', icon: KanbanSquare, label: 'Board' },
                    { value: 'backlog', icon: List, label: 'Backlog' },
                    { value: 'capacity', icon: Users, label: 'Capacity' },
                  ].map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="h-10 rounded-xl border border-transparent px-4 text-sm font-medium text-muted-foreground data-[state=active]:border-border/70 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                    >
                      <span className="inline-flex items-center gap-2">
                        <tab.icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            {isAllTeamsMode ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center md:p-12">
                <div className="max-w-xl rounded-3xl border border-border/70 bg-card/70 px-8 py-10 shadow-sm">
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Users className="h-8 w-8" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight">All Teams Planning View</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Team-specific backlog, board, and capacity editing are intentionally scoped. Choose a team above to enter a production planning workspace for that sprint.
                  </p>
                </div>
              </div>
            ) : showNoSprintsEmpty ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center md:px-10">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary shadow-inner">
                  <Zap className="h-9 w-9" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">No sprints for this team</h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  Create a sprint to start planning backlog, delivery sequencing, and team capacity for {selectedTeamName}.
                </p>
                <Button size="lg" onClick={() => setSprintModalOpen(true)} className="mt-8 gap-2 rounded-xl px-5">
                  <Plus className="h-4 w-4" />
                  Create Sprint
                </Button>
              </div>
            ) : showLoadingSkeleton ? (
              <div className="flex-1 p-4 md:p-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
                      <Skeleton className="mb-4 h-8 w-32 rounded-xl" />
                      <Skeleton className="mb-3 h-28 w-full rounded-2xl" />
                      <Skeleton className="h-28 w-full rounded-2xl" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ─── OVERVIEW TAB ──────────────────────────────────────── */}
            {!isAllTeamsMode && !showNoSprintsEmpty && !showLoadingSkeleton && loadedTabs.has('overview') && (
              <TabsContent value="overview" className="mt-0 flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6">
                {analytics ? (
                  <div className="mx-auto max-w-6xl space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard title="Total Items" value={analytics.stats.totalItems} icon={Hash} />
                      <StatCard title="Completed" value={analytics.stats.completedItems} icon={CheckCircle2} accent="text-emerald-400" />
                      <StatCard title="Remaining" value={analytics.stats.remainingItems} icon={TrendingDown} accent="text-amber-400" />
                      <StatCard title="Story Points" value={`${analytics.stats.completedPoints} / ${analytics.stats.totalPoints}`} icon={Zap} accent="text-indigo-400" />
                    </div>

                    <div className="grid gap-4 xl:grid-cols-5">
                      {analytics.burndown.length > 1 && (
                        <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm xl:col-span-3">
                          <CardHeader className="border-b border-border/60 pb-3">
                            <CardTitle className="flex items-center gap-2 text-sm font-medium">
                              <TrendingDown className="h-4 w-4 text-primary" />
                              Sprint Burndown
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={260}>
                              <AreaChart data={analytics.burndown}>
                                <defs><linearGradient id="burndownGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                                <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                                <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }} />
                                <Area type="monotone" dataKey="ideal" stroke="#94a3b8" fill="none" strokeDasharray="6 3" strokeWidth={1.5} name="Ideal" />
                                <Area type="monotone" dataKey="remaining" stroke="#6366f1" fill="url(#burndownGrad)" strokeWidth={2} name="Remaining" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      )}
                      <div className="space-y-4 xl:col-span-2">
                        {analytics.byType.length > 0 && (
                          <Card className="border-border/70 bg-card/80 shadow-sm">
                            <CardHeader className="border-b border-border/60 pb-3"><CardTitle className="text-sm font-medium">By Type</CardTitle></CardHeader>
                            <CardContent><div className="space-y-2.5">
                              {analytics.byType.map((t, idx) => {
                                const pct = analytics.stats.totalItems > 0 ? Math.round((t.value / analytics.stats.totalItems) * 100) : 0
                                return (<div key={t.name} className="flex items-center gap-3">
                                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                                  <span className="text-xs capitalize flex-1">{t.name}</span><span className="text-xs text-muted-foreground tabular-nums">{t.value}</span>
                                  <div className="w-16"><Progress value={pct} className="h-1" /></div>
                                </div>)
                              })}
                            </div></CardContent>
                          </Card>
                        )}
                        {analytics.byStatus.length > 0 && (
                          <Card className="border-border/70 bg-card/80 shadow-sm">
                            <CardHeader className="border-b border-border/60 pb-3"><CardTitle className="text-sm font-medium">By Status</CardTitle></CardHeader>
                            <CardContent><div className="space-y-2.5">
                              {analytics.byStatus.map((s) => {
                                const pct = analytics.stats.totalItems > 0 ? Math.round((s.value / analytics.stats.totalItems) * 100) : 0
                                return (<div key={s.name}><div className="flex justify-between text-xs mb-1"><span className="capitalize">{s.name.replace(/_/g, ' ')}</span><span className="text-muted-foreground tabular-nums">{s.value} ({pct}%)</span></div><Progress value={pct} className="h-1.5" /></div>)
                              })}
                            </div></CardContent>
                          </Card>
                        )}
                      </div>
                    </div>

                    {capacityData && (
                      <Card className="border-border/70 bg-card/80 shadow-sm">
                        <CardHeader className="border-b border-border/60 pb-3"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Capacity Signals</CardTitle></CardHeader>
                        <CardContent>
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4"><div className="text-2xl font-semibold tabular-nums">{capacityData.totals.memberCount}</div><div className="mt-1 text-xs text-muted-foreground">Team members contributing capacity</div></div>
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4"><div className="text-2xl font-semibold tabular-nums">{overloadedMembers}</div><div className="mt-1 text-xs text-muted-foreground">Members currently over capacity</div></div>
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4"><div className={`text-2xl font-semibold tabular-nums ${netAvailabilityHours < 0 ? 'text-destructive' : 'text-emerald-500'}`}>{Math.round(netAvailabilityHours)}h</div><div className="mt-1 text-xs text-muted-foreground">Net availability remaining</div></div>
                            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4"><div className="text-2xl font-semibold tabular-nums">{Math.round(capacityData.totals.totalAssignedCompletedHours)}h</div><div className="mt-1 text-xs text-muted-foreground">Logged hours inside the sprint</div></div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64"><p className="text-muted-foreground text-sm">Loading analytics...</p></div>
                )}
              </TabsContent>
            )}

            {/* ─── BOARD TAB ──────────────────────────────────────────── */}
            {!isAllTeamsMode && !showNoSprintsEmpty && !showLoadingSkeleton && loadedTabs.has('board') && (
              <TabsContent value="board" className="flex-1 overflow-auto mt-0">
                <div className="border-b border-border/70 bg-background/70 px-4 py-3 md:px-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Group by</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(['none', 'assignee', 'priority', 'story'] as GroupBy[]).map((g) => (
                          <Button key={g} variant={boardGroupBy === g ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setBoardGroupBy(g)}>
                            {g === 'none' ? 'None' : g === 'story' ? 'Story' : g.charAt(0).toUpperCase() + g.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-7 rounded-full px-3 font-mono">{sprintIssues.length} items</Badge>
                      <Badge variant="outline" className="h-7 rounded-full px-3 font-mono">{analytics?.stats.totalPoints ?? 0} pts</Badge>
                    </div>
                  </div>
                </div>
                <div className="p-4 md:p-6">
                  {boardGroupBy === 'none' ? (
                    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setDragActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
                      <div className="flex gap-4 overflow-x-auto pb-3">
                        {boardColumns.map((col) => (
                          <DroppableColumn key={col.id} id={col.id} label={col.label} color={col.color} count={col.issues.length}>
                            {col.issues.map((issue) => (<DraggableCard key={issue.id} issue={issue} onClick={() => openWorkItem(issue.id)} />))}
                          </DroppableColumn>
                        ))}
                      </div>
                      <DragOverlay>{dragActiveIssue && (<div className="p-3 rounded-lg border bg-card shadow-2xl w-[280px] rotate-1 opacity-95"><SprintCardContent issue={dragActiveIssue} /></div>)}</DragOverlay>
                    </DndContext>
                  ) : (
                    <div className="space-y-6">
                      {groupIssues(sprintIssues, boardGroupBy).map((group) => (
                        <div key={group.key} className="rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
                          <button className="mb-4 flex items-center gap-2 text-sm font-semibold transition-colors hover:text-primary" onClick={() => toggleGroup(`board-${group.key}`)}>
                            {collapsedGroups.has(`board-${group.key}`) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {group.label}<Badge variant="secondary" className="text-[10px] h-5">{group.issues.length}</Badge>
                          </button>
                          {!collapsedGroups.has(`board-${group.key}`) && (
                            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setDragActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
                              <div className="flex gap-4 overflow-x-auto pb-2">
                                {BOARD_COLUMNS.map((col) => {
                                  const colIssues = group.issues.filter((i) => i.status === col.id).sort((a, b) => a.columnOrder - b.columnOrder)
                                  return (<DroppableColumn key={col.id} id={col.id} label={col.label} color={col.color} count={colIssues.length}>
                                    {colIssues.map((issue) => (<DraggableCard key={issue.id} issue={issue} onClick={() => openWorkItem(issue.id)} />))}
                                  </DroppableColumn>)
                                })}
                              </div>
                              <DragOverlay>{dragActiveIssue && (<div className="p-3 rounded-lg border bg-card shadow-2xl w-[280px] rotate-1 opacity-95"><SprintCardContent issue={dragActiveIssue} /></div>)}</DragOverlay>
                            </DndContext>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {sprintIssues.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                      <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3"><KanbanSquare className="h-6 w-6 text-muted-foreground/40" /></div>
                      <p className="text-muted-foreground font-medium mb-1">No items in this sprint</p>
                      <p className="text-xs text-muted-foreground">Assign work items from the backlog</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {/* ─── BACKLOG TAB ────────────────────────────────────────── */}
            {!isAllTeamsMode && !showNoSprintsEmpty && !showLoadingSkeleton && loadedTabs.has('backlog') && (
              <TabsContent value="backlog" className="flex-1 overflow-auto mt-0">
                <div className="border-b border-border/70 bg-background/70 px-4 py-3 md:px-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Group by</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(['none', 'story', 'status', 'assignee', 'priority'] as GroupBy[]).map((g) => (
                          <Button key={g} variant={backlogGroupBy === g ? 'secondary' : 'ghost'} size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => setBacklogGroupBy(g)}>
                            {g === 'none' ? 'None' : g === 'story' ? 'Story' : g.charAt(0).toUpperCase() + g.slice(1)}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-7 rounded-full px-3 font-mono">{sprintIssues.length} items</Badge>
                      <Badge variant="outline" className="h-7 rounded-full px-3 font-mono">{analytics?.stats.totalPoints ?? 0} pts</Badge>
                    </div>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-24rem)] min-h-[22rem]">
                  {backlogGroupBy === 'story' ? (
                    <div className="divide-y divide-border/70">
                      {storyBacklogData.storyGroups.map(({ parent, children }) => {
                        const ParentIcon = TYPE_ICONS[parent.workItemType] || CheckCircle2
                        const parentIconColor = TYPE_COLORS[parent.workItemType] || 'text-muted-foreground'
                        const treeKey = `bl-story-${parent.id}`
                        const isCollapsed = collapsedGroups.has(treeKey)
                        const hasChildren = children.length > 0

                        return (
                          <div key={parent.id}>
                            <div
                              className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/20 md:px-6"
                              onClick={() => openWorkItem(parent.id)}
                            >
                              <button
                                type="button"
                                className="h-5 w-5 flex items-center justify-center text-muted-foreground"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (hasChildren) toggleGroup(treeKey)
                                }}
                                aria-label={hasChildren ? (isCollapsed ? 'Expand child tasks' : 'Collapse child tasks') : 'No child tasks'}
                                aria-expanded={hasChildren ? !isCollapsed : undefined}
                              >
                                {hasChildren ? (
                                  isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <span className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <ParentIcon className={`h-4 w-4 shrink-0 ${parentIconColor}`} />
                              <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{parent.key}</span>
                              <span className="flex-1 text-sm truncate font-semibold">{parent.title}</span>
                              <Badge className={`text-[10px] capitalize ${STATUS_BADGE[parent.status] || ''}`}>{parent.status.replace(/_/g, ' ')}</Badge>
                              <Badge variant="secondary" className="text-[10px] h-5">{children.length} child{children.length === 1 ? '' : 'ren'}</Badge>
                              <div className="w-10 text-right shrink-0">
                                {parent.storyPoints != null && parent.storyPoints > 0 ? <Badge variant="outline" className="text-[10px] font-mono">{parent.storyPoints}</Badge> : <span className="text-muted-foreground/30">-</span>}
                              </div>
                              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" aria-label="Remove from sprint"
                                onClick={(e) => { e.stopPropagation(); handleRemoveFromSprint(parent.id) }}><Minus className="h-3 w-3" /></Button>
                            </div>

                            {hasChildren && !isCollapsed ? (
                              <div className="border-t border-border/60 bg-muted/10">
                                {children.map((issue) => {
                                  const Icon = TYPE_ICONS[issue.workItemType] || CheckCircle2
                                  const iconColor = TYPE_COLORS[issue.workItemType] || 'text-muted-foreground'
                                  return (
                                    <div key={issue.id} className="group flex items-center gap-3 py-3 pl-14 pr-4 transition-colors hover:bg-muted/20 md:pr-6" onClick={() => openWorkItem(issue.id)}>
                                      <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
                                      <span className="font-mono text-[11px] text-muted-foreground w-20 shrink-0">{issue.key}</span>
                                      <span className="flex-1 text-xs truncate font-medium">{issue.title}</span>
                                      <Badge className={`text-[10px] capitalize ${STATUS_BADGE[issue.status] || ''}`}>{issue.status.replace(/_/g, ' ')}</Badge>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100"
                                        aria-label="Remove parent link"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          void handleRemoveParentLink(issue.id)
                                        }}
                                      >
                                        Unlink
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" aria-label="Remove from sprint"
                                        onClick={(event) => { event.stopPropagation(); void handleRemoveFromSprint(issue.id) }}><Minus className="h-3 w-3" /></Button>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}

                      {storyBacklogData.standalone.length > 0 ? (
                        <div>
                          <div className="border-y border-border/60 bg-muted/20 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground md:px-6">Standalone Work</div>
                          {storyBacklogData.standalone.map((issue) => {
                            const Icon = TYPE_ICONS[issue.workItemType] || CheckCircle2
                            const iconColor = TYPE_COLORS[issue.workItemType] || 'text-muted-foreground'
                            return (
                              <div key={issue.id} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/20 md:px-6" onClick={() => openWorkItem(issue.id)}>
                                <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                                <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{issue.key}</span>
                                <span className="flex-1 text-sm truncate font-medium">{issue.title}</span>
                                <Badge className={`text-[10px] capitalize ${STATUS_BADGE[issue.status] || ''}`}>{issue.status.replace(/_/g, ' ')}</Badge>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" aria-label="Remove from sprint"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveFromSprint(issue.id) }}><Minus className="h-3 w-3" /></Button>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    groupIssues(sprintIssues, backlogGroupBy).map((group) => (
                      <div key={group.key} className="border-b border-border/60 last:border-b-0">
                        {backlogGroupBy !== 'none' && (
                          <button className="flex w-full items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground md:px-6"
                            onClick={() => toggleGroup(`bl-${group.key}`)}>
                            {collapsedGroups.has(`bl-${group.key}`) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {group.label}<Badge variant="secondary" className="text-[10px] h-4 ml-1">{group.issues.length}</Badge>
                            <span className="ml-auto tabular-nums">{group.issues.reduce((s, i) => s + (i.storyPoints || 0), 0)} pts</span>
                          </button>
                        )}
                        {!collapsedGroups.has(`bl-${group.key}`) && (
                          <div className="divide-y">
                            {group.issues.map((issue) => {
                              const Icon = TYPE_ICONS[issue.workItemType] || CheckCircle2
                              const iconColor = TYPE_COLORS[issue.workItemType] || 'text-muted-foreground'
                              return (
                                <div key={issue.id} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/20 md:px-6" onClick={() => openWorkItem(issue.id)}>
                                  <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                                  <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{issue.key}</span>
                                  <span className="flex-1 text-sm truncate font-medium">{issue.title}</span>
                                  <Badge className={`text-[10px] capitalize ${STATUS_BADGE[issue.status] || ''}`}>{issue.status.replace(/_/g, ' ')}</Badge>
                                  <div className="w-24 shrink-0">
                                    {issue.assignee ? (
                                      <div className="flex items-center gap-1.5">
                                        <Avatar className="h-5 w-5"><AvatarImage src={issue.assignee.avatar || undefined} /><AvatarFallback className="text-[8px]">{issue.assignee.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                                        <span className="text-xs truncate">{issue.assignee.name.split(' ')[0]}</span>
                                      </div>
                                    ) : <span className="text-xs text-muted-foreground">Unassigned</span>}
                                  </div>
                                  <div className="w-10 text-right shrink-0">
                                    {issue.storyPoints != null && issue.storyPoints > 0 ? <Badge variant="outline" className="text-[10px] font-mono">{issue.storyPoints}</Badge> : <span className="text-muted-foreground/30">-</span>}
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" aria-label="Remove from sprint"
                                    onClick={(e) => { e.stopPropagation(); handleRemoveFromSprint(issue.id) }}><Minus className="h-3 w-3" /></Button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {sprintIssues.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <List className="h-8 w-8 text-muted-foreground/30 mb-3" /><p className="text-muted-foreground font-medium mb-1">Sprint backlog is empty</p><p className="text-xs text-muted-foreground">Go to the Backlog view and assign items</p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            )}

            {/* ─── CAPACITY TAB ────────────────────────────────────────── */}
            {!isAllTeamsMode && !showNoSprintsEmpty && !showLoadingSkeleton && loadedTabs.has('capacity') && (
              <TabsContent value="capacity" className="flex-1 overflow-auto mt-0">
                <CapacityTab
                  key={`capacity-${selectedSprint?.id ?? 'none'}-${capacityData?.capacities.map((entry) => `${entry.userId}:${entry.hoursPerDay}:${entry.daysOff}`).join('|') ?? 'empty'}`}
                  data={capacityData}
                  onSave={handleCapacitySave}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>

        <aside className="hidden xl:flex w-[360px] flex-col bg-muted/10">
          <div className="sticky top-0 z-10 border-b border-border/70 bg-background/90 px-5 py-4 backdrop-blur">
            <h3 className="text-sm font-semibold tracking-tight">Sprint Planning Panel</h3>
          </div>

          <ScrollArea className="h-full w-full">
            <div className="flex flex-col gap-4 p-4">
              {isAllTeamsMode ? (
                <Card className="border-border/60 shadow-none bg-transparent sm:bg-card/50">
                  <CardHeader className="py-3 px-4 border-b border-border/40">
                    <CardTitle className="text-sm font-semibold">All Teams Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {sprintTeams.map((team) => {
                      const teamSprints = allSprints.filter((s) => s.teamId === team.id);
                      const activeCount = teamSprints.filter((s) => isActiveStatus(s.status)).length;
                      return (
                        <div key={team.id} className="flex items-center justify-between px-4 py-2 hover:bg-muted/30 border-b border-border/40 last:border-0 transition-colors">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium truncate">{team.name}</div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>{teamSprints.length} Sprints</span>
                              {activeCount > 0 && <span className="text-emerald-600 font-medium">• {activeCount} Active</span>}
                            </div>
                          </div>
                          <div className="h-6 w-6 rounded-md bg-secondary/50 flex items-center justify-center text-[10px]">→</div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ) : selectedSprint ? (
                <div className="space-y-4">
                  {/* Planning Health - Compressed Header */}
                  <Card className="overflow-hidden border-border/60 shadow-none bg-card/50">
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border/40">
                      <div className="p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Utilization</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums">{capacityUtilizationPercent}%</span>
                          <Progress value={capacityUtilizationPercent} className="h-1 flex-1" />
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Availability</p>
                        <p className={`text-sm font-bold tabular-nums ${netAvailabilityHours < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                          {netAvailabilityHours}h
                        </p>
                      </div>
                      <div className="p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">At-Risk</p>
                        <p className="text-sm font-bold tabular-nums">{overloadedMembers}</p>
                      </div>
                      <div className="p-3">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Items</p>
                        <p className="text-sm font-bold tabular-nums">{assignedItemsCount}</p>
                      </div>
                    </div>
                  </Card>

                  {/* Team Load Table */}
                  <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
                    {/* Header Row */}
                    <div className="grid grid-cols-[1fr_80px_100px] items-center bg-muted/50 px-4 py-1.5 border-b border-border/60">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">Member</span>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground text-center">Load</span>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground text-right">Balance</span>
                    </div>

                    <div className="divide-y divide-border/40">
                      {(capacityData?.capacities ?? []).map((entry) => {
                        const freeHours = entry.totalCapacity - entry.assignedEstimatedHours;
                        const isOverloaded = freeHours < 0;
                        const loadPercentage = entry.totalCapacity > 0 ? (entry.assignedEstimatedHours / entry.totalCapacity) * 100 : 0;

                        return (
                          <div key={entry.userId} className="group relative grid grid-cols-[1fr_80px_100px] items-center px-4 py-2 hover:bg-muted/40 transition-colors">
                            {isOverloaded && <div className="absolute left-0 top-0 h-full w-0.5 bg-destructive" />}

                            {/* Name & Quick Stats */}
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[13px] font-medium">{entry.user.name}</span>
                                {isOverloaded && <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />}
                              </div>
                              <div className="text-[10px] text-muted-foreground flex gap-2">
                                <span>Rem: <b className="text-foreground/70">{Math.round(entry.assignedRemainingHours)}h</b></span>
                                <span>Log: <b className="text-foreground/70">{Math.round(entry.assignedCompletedHours)}h</b></span>
                              </div>
                            </div>

                            {/* Load Progress */}
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-[11px] font-bold tabular-nums ${isOverloaded ? 'text-destructive' : ''}`}>
                                {Math.round(loadPercentage)}%
                              </span>
                              <Progress value={loadPercentage} className="h-1 w-12 sm:w-16" />
                            </div>

                            {/* Balance */}
                            <div className="text-right">
                              <span className={`text-xs font-bold tabular-nums ${isOverloaded ? 'text-destructive' : 'text-emerald-600'}`}>
                                {isOverloaded ? '' : '+'}{Math.round(freeHours)}h
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {(capacityData?.capacities?.length ?? 0) === 0 && (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No member data found.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Selection State stays relatively the same but with smaller padding */
                <div className="flex h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/5 p-4 text-center">
                  <Calendar className="h-4 w-4 text-muted-foreground mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">Select team/sprint for insights</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CAPACITY TAB
   ═══════════════════════════════════════════════════════════════════════════ */

function CapacityTab({ data, onSave }: { data: CapacityData | null; onSave: (entries: Array<{ userId: string; hoursPerDay: number; daysOff: number }>) => void }) {
  const initialEditedCapacities = useMemo(() => {
    const initial: Record<string, { hoursPerDay: number; daysOff: number }> = {}
    data?.capacities.forEach((capacity) => {
      initial[capacity.userId] = {
        hoursPerDay: capacity.hoursPerDay,
        daysOff: capacity.daysOff,
      }
    })
    return initial
  }, [data])

  const [editedCapacities, setEditedCapacities] = useState<Record<string, { hoursPerDay: number; daysOff: number }>>(initialEditedCapacities)
  const [isDirty, setIsDirty] = useState(false)

  const handleChange = (userId: string, field: 'hoursPerDay' | 'daysOff', value: number) => {
    setEditedCapacities((prev) => ({ ...prev, [userId]: { ...prev[userId], [field]: value } }))
    setIsDirty(true)
  }

  const handleSave = () => {
    const entries = Object.entries(editedCapacities).map(([userId, v]) => ({ userId, hoursPerDay: v.hoursPerDay, daysOff: v.daysOff }))
    onSave(entries)
    setIsDirty(false)
  }

  if (!data) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground text-sm">Loading capacity data...</p></div>

  const overloadedMembers = data.capacities.filter((cap) => cap.assignedEstimatedHours > cap.totalCapacity).length
  const totalCapacityHours = Math.round(data.totals.totalCapacity)
  const totalPlannedHours = Math.round(data.totals.totalAssignedEstimatedHours)
  const averageLoadPercent = totalCapacityHours > 0 ? Math.round((totalPlannedHours / totalCapacityHours) * 100) : 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 md:py-6">
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Users className="h-4.5 w-4.5 text-primary" />Capacity Planning</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust working hours and time off per team member. Capacity, plan, and risk signals update without changing sprint business rules.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!isDirty} className="h-10 gap-1.5 rounded-xl px-4">
          Save Changes
        </Button>
      </div>

      <div className="space-y-4">
        {data.capacities.map((cap) => {
          const edited = editedCapacities[cap.userId] || { hoursPerDay: cap.hoursPerDay, daysOff: cap.daysOff }
          const availableDays = Math.max(0, data.totals.sprintDays - edited.daysOff)
          const totalCap = availableDays * edited.hoursPerDay
          const isOverloaded = cap.assignedEstimatedHours > totalCap
          const remainingCapacity = totalCap - cap.assignedEstimatedHours
          const loadPercent = totalCap > 0 ? Math.min(100, Math.round((cap.assignedEstimatedHours / totalCap) * 100)) : 0
          return (
            <Card key={cap.userId} className={` overflow-hidden border-border/70 bg-card/80 shadow-sm py-2 ${isOverloaded ? 'border-destructive/30 bg-destructive/[0.03]' : ''}`}>
              <CardContent className="p-1 md:p-1">
                <div className="group flex items-center justify-between gap-4 border-b border-border/40 px-2 py-1.5 transition-colors hover:bg-muted/30 last:border-0">
                  {/* User Information */}
                  <div className="flex flex-1 items-center gap-3 min-w-0">
                    <Avatar className="h-7 w-7 ring-1 ring-border/50">
                      <AvatarImage src={cap.user.avatar || undefined} />
                      <AvatarFallback className="bg-primary/10 text-[9px] font-medium text-primary">
                        {cap.user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-[13px] font-medium text-foreground tracking-tight">
                        {cap.user.name}
                      </span>
                      <Badge variant="outline" className="h-4 rounded px-1 text-[9px] font-bold uppercase tracking-wide opacity-60">
                        {cap.role}
                      </Badge>
                      {isOverloaded && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive animate-pulse" title="Overloaded" />
                      )}
                    </div>

                    {/* Email hidden on smaller screens, shown on hover/large screens to save space */}
                    <span className="hidden xl:inline truncate text-[11px] text-muted-foreground/60 max-w-[150px]">
                      {cap.user.email}
                    </span>
                  </div>

                  {/* Input Actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter">H/Day</span>
                      <Input
                        type="number"
                        value={edited.hoursPerDay}
                        onChange={(e) => handleChange(cap.userId, 'hoursPerDay', parseFloat(e.target.value) || 0)}
                        className="h-7 w-11 border-border/50 bg-background/50 px-1 text-center text-xs focus-visible:ring-1 focus-visible:ring-primary/30"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-tighter">Off</span>
                      <Input
                        type="number"
                        value={edited.daysOff}
                        onChange={(e) => handleChange(cap.userId, 'daysOff', parseInt(e.target.value) || 0)}
                        className="h-7 w-11 border-border/50 bg-background/50 px-1 text-center text-xs focus-visible:ring-1 focus-visible:ring-primary/30"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {data.capacities.length === 0 && (
        <div className="rounded-3xl border border-dashed border-border/80 bg-muted/20 py-14 text-center"><Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" /><p className="text-sm font-medium text-muted-foreground">No team members</p><p className="mt-1 text-xs text-muted-foreground">Add members to the project to plan capacity</p></div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({ title, value, icon: Icon, accent }: { title: string; value: string | number; icon: React.ElementType; accent?: string }) {
  return (
    <Card className="overflow-hidden border-border/70 bg-card/80 shadow-sm">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div><p className="mb-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p><p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p></div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-muted/30"><Icon className={`h-5 w-5 ${accent || 'text-muted-foreground'}`} /></div>
        </div>
      </CardContent>
    </Card>
  )
}
