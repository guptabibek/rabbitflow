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
import { format, differenceInDays } from 'date-fns'
import { toast } from 'sonner'
import { PIE_COLORS as PIE_COLORS_TOKENS } from '@/lib/ui-tokens'

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
    <div ref={setNodeRef} className={`flex-1 min-w-[260px] max-w-[340px] rounded-xl border transition-all duration-150 ${isOver ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-lg' : 'bg-muted/10 border-border/50'}`}>
      <div className="p-3.5 border-b flex items-center gap-2.5">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] tabular-nums">{count}</Badge>
      </div>
      <ScrollArea className="h-[calc(100vh-400px)]">
        <div className="p-2.5 min-h-[80px]">
          {children}
          {count === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/40">
              <div className="h-8 w-8 rounded-lg border-2 border-dashed border-muted-foreground/20 flex items-center justify-center mb-2">
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
    value === 'active' || value === 'Active'
  const isClosedStatus = (value: string | null | undefined) =>
    value === 'completed' || value === 'Closed'

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

    const activeSprint = sprints.find((sprint) => isActiveStatus(sprint.status))
    return activeSprint?.id || sprints[0]?.id || null
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
      if (res.ok) {
        const updated = await res.json()
        setSprintIssues((prev) => prev.filter((i) => i.id !== issueId))
        updateIssue(issueId, updated)
        if (resolvedSelectedSprintId) {
          void fetchSprintIssues(resolvedSelectedSprintId)
        }
        toast.success(`${issue.key} removed from sprint`)
      }
    } catch { toast.error('Failed to remove from sprint') }
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
      if (res.ok) {
        toast.success('Capacity updated')
        capacityLoadedRef.current = null
        analyticsLoadedRef.current = null
        capacityRequestRef.current = null
        analyticsRequestRef.current = null
        setCapacitySprintId(null)
        setAnalyticsSprintId(null)
        void fetchSprintCapacity(resolvedSelectedSprintId)
        void fetchSprintAnalytics(resolvedSelectedSprintId)
      } else {
        toast.error('Failed to update capacity')
      }
    } catch {
      toast.error('Network error')
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

  return (
    <div className="flex flex-col h-full">
      {/* ═══ Sprint Header ═══════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 px-6 py-5 border-b bg-gradient-to-r from-background via-background to-muted/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {sprintTeams.length > 1 ? (
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="w-[180px] h-10">
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
              <SelectTrigger className="w-[240px] h-10 font-semibold text-base">
                <SelectValue placeholder="Select Sprint" />
              </SelectTrigger>
              <SelectContent>
                {sprints.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-2">
                      {s.name}
                      {isActiveStatus(s.status) && <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSprint && (
              <Badge variant={isActiveStatus(selectedSprint.status) ? 'default' : isClosedStatus(selectedSprint.status) ? 'secondary' : 'outline'} className="capitalize h-7 px-3">
                {selectedSprint.status}
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setSprintModalOpen(true)} className="gap-1.5">
            <Flag className="h-3.5 w-3.5" />Manage Sprints
          </Button>
        </div>
        {isAllTeamsMode ? (
          <p className="text-xs text-muted-foreground mb-3">
            All Teams view is aggregate only. Select a team to open team-specific sprint backlog, board, and planning.
          </p>
        ) : null}
        {selectedSprint && (
          <div className="flex items-start gap-8">
            <div className="flex-1 min-w-0 space-y-1.5">
              {selectedSprint.goal && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{selectedSprint.goal}</span>
                </p>
              )}
              {selectedSprint.startDate && selectedSprint.endDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(selectedSprint.startDate), 'MMM d')} – {format(new Date(selectedSprint.endDate), 'MMM d, yyyy')}
                  {daysRemaining !== null && <Badge variant="outline" className="h-5 text-[10px] tabular-nums ml-1">{daysRemaining}d left</Badge>}
                </p>
              )}
            </div>
            {totalDays && (
              <div className="w-44 shrink-0">
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className="text-muted-foreground">Timeline</span>
                  <span className="font-medium tabular-nums">{Math.round((daysPassed / totalDays) * 100)}%</span>
                </div>
                <Progress value={(daysPassed / totalDays) * 100} className="h-1.5" />
              </div>
            )}
            <div className="w-44 shrink-0">
              <div className="flex justify-between text-[11px] mb-1.5">
                <span className="text-muted-foreground">{analytics?.stats.completedItems ?? 0} / {analytics?.stats.totalItems ?? 0}</span>
                <span className="font-medium tabular-nums">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold tabular-nums">{analytics?.stats.totalPoints ?? 0}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Story Points</div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Workspace Body ════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="min-w-0 flex-1">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b px-6">
          <TabsList className="h-11 bg-transparent p-0 gap-6">
            {[
              { value: 'overview', icon: Activity, label: 'Overview' },
              { value: 'board', icon: KanbanSquare, label: 'Board' },
              { value: 'backlog', icon: List, label: 'Backlog' },
              { value: 'capacity', icon: Users, label: 'Capacity' },
            ].map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2.5 text-sm">
                <tab.icon className="h-3.5 w-3.5" /> {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {isAllTeamsMode ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div className="max-w-lg space-y-2">
              <h3 className="text-lg font-semibold">All Teams Planning View</h3>
              <p className="text-sm text-muted-foreground">
                Sprint backlog, board, and capacity are team-scoped. Select a team from the top switcher to inspect and manage a specific sprint.
              </p>
            </div>
          </div>
        ) : showNoSprintsEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
              <Zap className="h-10 w-10 text-primary/60" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No Sprints For This Team</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              Create a sprint for the selected team to start planning backlog and capacity.
            </p>
            <Button size="lg" onClick={() => setSprintModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />Create Sprint
            </Button>
          </div>
        ) : showLoadingSkeleton ? (
          <div className="flex-1 p-6 flex gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex-1 min-w-[240px]">
                <Skeleton className="h-11 w-full mb-4 rounded-xl" />
                <Skeleton className="h-28 w-full mb-2 rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : null}

        {/* ─── OVERVIEW TAB ──────────────────────────────────────── */}
        {!isAllTeamsMode && !showNoSprintsEmpty && !showLoadingSkeleton && loadedTabs.has('overview') && (
        <TabsContent value="overview" className="flex-1 overflow-auto p-6 mt-0">
          {analytics ? (
            <div className="space-y-6 max-w-5xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Total Items" value={analytics.stats.totalItems} icon={Hash} />
                <StatCard title="Completed" value={analytics.stats.completedItems} icon={CheckCircle2} accent="text-emerald-400" />
                <StatCard title="Remaining" value={analytics.stats.remainingItems} icon={TrendingDown} accent="text-amber-400" />
                <StatCard title="Story Points" value={`${analytics.stats.completedPoints} / ${analytics.stats.totalPoints}`} icon={Zap} accent="text-indigo-400" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {analytics.burndown.length > 1 && (
                  <Card className="lg:col-span-3">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingDown className="h-4 w-4 text-primary" />Sprint Burndown</CardTitle></CardHeader>
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
                <div className="lg:col-span-2 space-y-4">
                  {analytics.byType.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">By Type</CardTitle></CardHeader>
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
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">By Status</CardTitle></CardHeader>
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
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Team Capacity Summary</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/30"><div className="text-2xl font-bold tabular-nums">{capacityData.totals.memberCount}</div><div className="text-[11px] text-muted-foreground">Team Members</div></div>
                      <div className="text-center p-3 rounded-lg bg-muted/30"><div className="text-2xl font-bold tabular-nums">{Math.round(capacityData.totals.totalCapacity)}h</div><div className="text-[11px] text-muted-foreground">Total Capacity</div></div>
                      <div className="text-center p-3 rounded-lg bg-muted/30"><div className="text-2xl font-bold tabular-nums">{capacityData.totals.totalAssignedPoints}</div><div className="text-[11px] text-muted-foreground">Assigned Points</div></div>
                      <div className="text-center p-3 rounded-lg bg-muted/30"><div className="text-2xl font-bold tabular-nums">{capacityData.totals.totalAssignedItems}</div><div className="text-[11px] text-muted-foreground">Assigned Items</div></div>
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
          <div className="px-6 py-2.5 border-b bg-muted/20 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Group by:</span>
            <div className="flex gap-1">
              {(['none', 'assignee', 'priority', 'story'] as GroupBy[]).map((g) => (
                <Button key={g} variant={boardGroupBy === g ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2.5" onClick={() => setBoardGroupBy(g)}>
                  {g === 'none' ? 'None' : g === 'story' ? 'Story' : g.charAt(0).toUpperCase() + g.slice(1)}
                </Button>
              ))}
            </div>
            <div className="ml-auto text-xs text-muted-foreground tabular-nums">{sprintIssues.length} items / {analytics?.stats.totalPoints ?? 0} pts</div>
          </div>
          <div className="p-6">
            {boardGroupBy === 'none' ? (
              <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setDragActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
                <div className="flex gap-4 h-full">
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
                  <div key={group.key}>
                    <button className="flex items-center gap-2 mb-3 text-sm font-semibold hover:text-primary transition-colors" onClick={() => toggleGroup(`board-${group.key}`)}>
                      {collapsedGroups.has(`board-${group.key}`) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {group.label}<Badge variant="secondary" className="text-[10px] h-5">{group.issues.length}</Badge>
                    </button>
                    {!collapsedGroups.has(`board-${group.key}`) && (
                      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setDragActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
                        <div className="flex gap-4">
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
          <div className="px-6 py-2.5 border-b bg-muted/20 flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Group by:</span>
            <div className="flex gap-1">
              {(['none', 'story', 'status', 'assignee', 'priority'] as GroupBy[]).map((g) => (
                <Button key={g} variant={backlogGroupBy === g ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2.5" onClick={() => setBacklogGroupBy(g)}>
                  {g === 'none' ? 'None' : g === 'story' ? 'Story' : g.charAt(0).toUpperCase() + g.slice(1)}
                </Button>
              ))}
            </div>
            <div className="ml-auto text-xs text-muted-foreground tabular-nums">{sprintIssues.length} items / {analytics?.stats.totalPoints ?? 0} pts</div>
          </div>
          <ScrollArea className="h-[calc(100vh-360px)]">
            {backlogGroupBy === 'story' ? (
              <div className="divide-y">
                {storyBacklogData.storyGroups.map(({ parent, children }) => {
                  const ParentIcon = TYPE_ICONS[parent.workItemType] || CheckCircle2
                  const parentIconColor = TYPE_COLORS[parent.workItemType] || 'text-muted-foreground'
                  const treeKey = `bl-story-${parent.id}`
                  const isCollapsed = collapsedGroups.has(treeKey)
                  const hasChildren = children.length > 0

                  return (
                    <div key={parent.id}>
                      <div
                        className="px-6 py-3 flex items-center gap-4 hover:bg-muted/30 cursor-pointer group transition-colors"
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
                        <div className="border-t bg-muted/10">
                          {children.map((issue) => {
                            const Icon = TYPE_ICONS[issue.workItemType] || CheckCircle2
                            const iconColor = TYPE_COLORS[issue.workItemType] || 'text-muted-foreground'
                            return (
                              <div key={issue.id} className="pl-14 pr-6 py-2.5 flex items-center gap-3 hover:bg-muted/30 cursor-pointer group transition-colors" onClick={() => openWorkItem(issue.id)}>
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
                    <div className="px-6 py-2 border-y bg-muted/30 text-xs font-semibold text-muted-foreground">Standalone Work</div>
                    {storyBacklogData.standalone.map((issue) => {
                      const Icon = TYPE_ICONS[issue.workItemType] || CheckCircle2
                      const iconColor = TYPE_COLORS[issue.workItemType] || 'text-muted-foreground'
                      return (
                        <div key={issue.id} className="px-6 py-3 flex items-center gap-4 hover:bg-muted/30 cursor-pointer group transition-colors" onClick={() => openWorkItem(issue.id)}>
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
                <div key={group.key}>
                  {backlogGroupBy !== 'none' && (
                    <button className="w-full px-6 py-2 border-b bg-muted/30 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
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
                          <div key={issue.id} className="px-6 py-3 flex items-center gap-4 hover:bg-muted/30 cursor-pointer group transition-colors" onClick={() => openWorkItem(issue.id)}>
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

      <aside className="hidden xl:flex w-[360px] flex-col border-l bg-muted/10">
        <div className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur px-4 py-3">
          <h3 className="text-sm font-semibold">Sprint Planning Panel</h3>
          <p className="text-xs text-muted-foreground">
            Team capacity stays visible while you navigate sprint backlog and board.
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {isAllTeamsMode ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">All Teams Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sprintTeams.map((team) => {
                    const teamSprints = allSprints.filter((sprint) => sprint.teamId === team.id)
                    const activeCount = teamSprints.filter((sprint) => isActiveStatus(sprint.status)).length
                    return (
                      <div key={team.id} className="rounded border bg-background p-2.5">
                        <div className="text-sm font-medium">{team.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {teamSprints.length} sprint{teamSprints.length === 1 ? '' : 's'}
                          {activeCount > 0 ? `, ${activeCount} active` : ''}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ) : selectedSprint ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Capacity Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Available capacity</span>
                      <span className="font-medium tabular-nums">{Math.round(capacityData?.totals.totalCapacity ?? 0)}h</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Planned estimate</span>
                      <span className="font-medium tabular-nums">{Math.round(capacityData?.totals.totalAssignedEstimatedHours ?? 0)}h</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total available</span>
                      <span className={`font-medium tabular-nums ${(capacityData?.totals.totalCapacity ?? 0) - (capacityData?.totals.totalAssignedEstimatedHours ?? 0) < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {Math.round((capacityData?.totals.totalCapacity ?? 0) - (capacityData?.totals.totalAssignedEstimatedHours ?? 0))}h
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Team Member Capacity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-[minmax(0,1fr)_64px_64px_72px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Member</span>
                      <span className="text-right">Capacity</span>
                      <span className="text-right">Estimated</span>
                      <span className="text-right">Available</span>
                    </div>
                    {(capacityData?.capacities ?? []).map((entry) => {
                      const freeHours = entry.totalCapacity - entry.assignedEstimatedHours
                      const availableClass = freeHours < 0 ? 'text-red-500' : 'text-emerald-500'
                      return (
                        <div
                          key={entry.userId}
                          className="grid grid-cols-[minmax(0,1fr)_64px_64px_72px] items-center gap-2 rounded border bg-background p-2.5"
                        >
                          <span className="text-sm font-medium truncate" title={entry.user.name}>
                            {entry.user.name}
                          </span>
                          <span className="text-xs text-right tabular-nums">
                            {Math.round(entry.totalCapacity)}h
                          </span>
                          <span className="text-xs text-right tabular-nums">
                            {Math.round(entry.assignedEstimatedHours)}h
                          </span>
                          <span className={`text-xs text-right font-medium tabular-nums ${availableClass}`}>
                            {Math.round(freeHours)}h
                          </span>
                          <div className="col-span-4 text-[10px] text-muted-foreground">
                            Remaining estimate {Math.round(entry.assignedRemainingHours)}h, completed logged {Math.round(entry.assignedCompletedHours)}h
                          </div>
                        </div>
                      )
                    })}
                    {(capacityData?.capacities?.length ?? 0) === 0 ? (
                      <div className="text-xs text-muted-foreground">No capacity data yet.</div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Select a team and sprint to view planning insights.
                </CardContent>
              </Card>
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

  return (
    <div className="max-w-5xl">
      <div className="px-6 py-4 border-b bg-muted/20">
        <div className="grid grid-cols-4 gap-6">
          <div><div className="text-xs text-muted-foreground mb-0.5">Sprint Days</div><div className="text-lg font-bold tabular-nums">{data.totals.sprintDays}</div></div>
          <div><div className="text-xs text-muted-foreground mb-0.5">Total Capacity</div><div className="text-lg font-bold tabular-nums">{Math.round(data.totals.totalCapacity)}h</div></div>
          <div><div className="text-xs text-muted-foreground mb-0.5">Planned Hours</div><div className="text-lg font-bold tabular-nums">{Math.round(data.totals.totalAssignedEstimatedHours)}h</div></div>
          <div><div className="text-xs text-muted-foreground mb-0.5">Assigned Items</div><div className="text-lg font-bold tabular-nums">{data.totals.totalAssignedItems}</div></div>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Team Capacity</h3>
          <Button size="sm" onClick={handleSave} disabled={!isDirty} className="gap-1.5">Save Changes</Button>
        </div>

        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b">
          <div className="col-span-3">Team Member</div><div className="col-span-1 text-center">Role</div><div className="col-span-1 text-center">Hrs/Day</div>
          <div className="col-span-1 text-center">Days Off</div><div className="col-span-2 text-center">Capacity</div><div className="col-span-2 text-center">Planned</div>
          <div className="col-span-2 text-center">Status</div>
        </div>

        <div className="divide-y">
          {data.capacities.map((cap) => {
            const edited = editedCapacities[cap.userId] || { hoursPerDay: cap.hoursPerDay, daysOff: cap.daysOff }
            const availableDays = Math.max(0, data.totals.sprintDays - edited.daysOff)
            const totalCap = availableDays * edited.hoursPerDay
            const isOverloaded = cap.assignedEstimatedHours > totalCap
            const remainingCapacity = totalCap - cap.assignedEstimatedHours
            return (
              <div key={cap.userId} className={`grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors ${isOverloaded ? 'bg-red-500/5' : ''}`}>
                <div className="col-span-3 flex items-center gap-2.5">
                  <Avatar className="h-8 w-8"><AvatarImage src={cap.user.avatar || undefined} /><AvatarFallback className="text-xs bg-primary/10 text-primary">{cap.user.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <div><div className="text-sm font-medium">{cap.user.name}</div><div className="text-[11px] text-muted-foreground">{cap.user.email}</div></div>
                </div>
                <div className="col-span-1 text-center"><Badge variant="outline" className="text-[10px] h-5 capitalize">{cap.role}</Badge></div>
                <div className="col-span-1 flex justify-center">
                  <Input type="number" min={0} max={24} step={0.5} value={edited.hoursPerDay} onChange={(e) => handleChange(cap.userId, 'hoursPerDay', parseFloat(e.target.value) || 0)} className="h-7 w-16 text-xs text-center" />
                </div>
                <div className="col-span-1 flex justify-center">
                  <Input type="number" min={0} max={data.totals.sprintDays} value={edited.daysOff} onChange={(e) => handleChange(cap.userId, 'daysOff', parseInt(e.target.value) || 0)} className="h-7 w-16 text-xs text-center" />
                </div>
                <div className="col-span-2 text-center">
                  <span className="text-sm font-bold tabular-nums">{Math.round(totalCap)}h</span>
                  <div className="text-[10px] text-muted-foreground">{availableDays}d × {edited.hoursPerDay}h</div>
                </div>
                <div className="col-span-2 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{Math.round(cap.assignedEstimatedHours)}h</span>
                    <span className="text-[10px] text-muted-foreground">({cap.assignedItems})</span>
                  </div>
                  <Progress value={totalCap > 0 ? Math.min(100, (cap.assignedEstimatedHours / totalCap) * 100) : 0} className="h-1 mt-1" />
                </div>
                <div className="col-span-2 text-center">
                  {isOverloaded ? (
                    <div className="flex items-center justify-center gap-1.5 text-red-400"><AlertTriangle className="h-3.5 w-3.5" /><span className="text-sm font-medium">Overloaded</span></div>
                  ) : (
                    <span className="text-sm font-medium text-emerald-400 tabular-nums">{Math.round(remainingCapacity)}h remaining</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {data.capacities.length === 0 && (
          <div className="text-center py-12"><Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm font-medium text-muted-foreground mb-1">No team members</p><p className="text-xs text-muted-foreground">Add members to the project to plan capacity</p></div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   STAT CARD
   ═══════════════════════════════════════════════════════════════════════════ */

function StatCard({ title, value, icon: Icon, accent }: { title: string; value: string | number; icon: React.ElementType; accent?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between">
          <div><p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">{title}</p><p className="text-2xl font-bold tabular-nums">{value}</p></div>
          <div className="h-11 w-11 rounded-xl bg-muted/50 flex items-center justify-center"><Icon className={`h-5 w-5 ${accent || 'text-muted-foreground'}`} /></div>
        </div>
      </CardContent>
    </Card>
  )
}
