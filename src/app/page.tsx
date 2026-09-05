'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import type { Project, User as AppUser } from '@/store/app-store'
// Eager: the shell and the landing surfaces. Everything else is loaded on
// demand — see the dynamic() declarations below.
import {
  AppSidebar,
  BacklogView,
  CreateIssueDialog,
  DashboardView,
  FilterBar,
  KanbanBoard,
  ListView,
  UserProfile,
  CommandPalette,
  NotificationBell,
  ApprovalDashboard,
  LabelsManagement,
} from '@/components/project-management'
import { OnboardingChecklist } from '@/components/project-management/onboarding-checklist'
import { OnboardingConfigView } from '@/components/project-management/onboarding-config-view'
import { OnboardingProvider } from '@/hooks/use-onboarding'
import { useOnboardingEvents } from '@/hooks/use-onboarding-events'
import { WorkItemPage } from '@/components/project-management/work-item-page'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Building2,
  ChevronDown,
  LogOut,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Shield,
  Sun,
  User,
} from 'lucide-react'
import { fetchWithRetry, getApiErrorMessage, parseJsonResponse } from '@/lib/utils'
import { useViewRoute } from '@/hooks/use-view-route'
import dynamic from 'next/dynamic'

/**
 * Views reached only by explicit navigation are loaded on demand.
 *
 * All 27 were statically imported into this one client component, so a user
 * landing on the dashboard downloaded and parsed the code for Reports, SLA,
 * Imports and the 2,000-line work-item-type editor before seeing anything.
 * The result was a single 1.17 MB chunk.
 *
 * The shell, dashboard, board, list and backlog stay eager: they are the
 * landing surfaces, and deferring them would trade one delay for another.
 */
function ViewSkeleton() {
  return (
    <div className="space-y-4 p-6" role="status" aria-label="Loading view">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

const ReportsView = dynamic(() => import('@/components/project-management/reports-view').then((m) => ({ default: m.ReportsView })), {
  loading: () => <ViewSkeleton />,
})
const SprintView = dynamic(() => import('@/components/project-management/sprint-view').then((m) => ({ default: m.SprintView })), {
  loading: () => <ViewSkeleton />,
})
const SprintManagement = dynamic(() => import('@/components/project-management/sprint-management').then((m) => ({ default: m.SprintManagement })), {
  loading: () => <ViewSkeleton />,
})
const TeamManagement = dynamic(() => import('@/components/project-management/team-management').then((m) => ({ default: m.TeamManagement })), {
  loading: () => <ViewSkeleton />,
})
const DocumentsView = dynamic(() => import('@/components/project-management/documents-view').then((m) => ({ default: m.DocumentsView })), {
  loading: () => <ViewSkeleton />,
})
const ObjectivesView = dynamic(() => import('@/components/project-management/objectives-view').then((m) => ({ default: m.ObjectivesView })), {
  loading: () => <ViewSkeleton />,
})
const RetrospectivesView = dynamic(() => import('@/components/project-management/retrospectives-view').then((m) => ({ default: m.RetrospectivesView })), {
  loading: () => <ViewSkeleton />,
})
const WebhookManagement = dynamic(() => import('@/components/project-management/webhook-management').then((m) => ({ default: m.WebhookManagement })), {
  loading: () => <ViewSkeleton />,
})
const ImportWizard = dynamic(() => import('@/components/project-management/import-wizard').then((m) => ({ default: m.ImportWizard })), {
  loading: () => <ViewSkeleton />,
})
const AutomationRuleBuilder = dynamic(() => import('@/components/project-management/automation-rule-builder').then((m) => ({ default: m.AutomationRuleBuilder })), {
  loading: () => <ViewSkeleton />,
})
const TestPlanManager = dynamic(() => import('@/components/project-management/test-plan-manager').then((m) => ({ default: m.TestPlanManager })), {
  loading: () => <ViewSkeleton />,
})
const SlaDashboard = dynamic(() => import('@/components/project-management/sla-dashboard').then((m) => ({ default: m.SlaDashboard })), {
  loading: () => <ViewSkeleton />,
})
const ApiTokenManagement = dynamic(() => import('@/components/project-management/api-token-management').then((m) => ({ default: m.ApiTokenManagement })), {
  loading: () => <ViewSkeleton />,
})
const RecurringTaskManager = dynamic(() => import('@/components/project-management/recurring-task-manager').then((m) => ({ default: m.RecurringTaskManager })), {
  loading: () => <ViewSkeleton />,
})
const RoadmapView = dynamic(() => import('@/components/project-management/roadmap-view').then((m) => ({ default: m.RoadmapView })), {
  loading: () => <ViewSkeleton />,
})
const PortfolioView = dynamic(() => import('@/components/project-management/portfolio-view').then((m) => ({ default: m.PortfolioView })), {
  loading: () => <ViewSkeleton />,
})
const CalendarView = dynamic(() => import('@/components/project-management/calendar-view').then((m) => ({ default: m.CalendarView })), {
  loading: () => <ViewSkeleton />,
})
const DependencyGraphView = dynamic(() => import('@/components/project-management/dependency-graph-view').then((m) => ({ default: m.DependencyGraphView })), {
  loading: () => <ViewSkeleton />,
})
const ActivityFeedView = dynamic(() => import('@/components/project-management/activity-feed-view').then((m) => ({ default: m.ActivityFeedView })), {
  loading: () => <ViewSkeleton />,
})
const BrandingStudio = dynamic(() => import('@/components/project-management/branding-studio').then((m) => ({ default: m.BrandingStudio })), {
  loading: () => <ViewSkeleton />,
})
const AclManagement = dynamic(() => import('@/components/project-management/acl-management').then((m) => ({ default: m.AclManagement })), {
  loading: () => <ViewSkeleton />,
})

type ViewType =
  | 'dashboard'
  | 'backlog'
  | 'board'
  | 'sprints'
  | 'list'
  | 'reports'
  | 'roadmap'
  | 'portfolio'
  | 'calendar'
  | 'dependency-graph'
  | 'activity'
  | 'teams'
  | 'settings'
  | 'documents'
  | 'objectives'
  | 'retrospectives'
  | 'approvals'
  | 'webhooks'
  | 'automations'
  | 'imports'
  | 'recurring-tasks'
  | 'test-plans'
  | 'sla'
  | 'api-tokens'
  | 'branding'
  | 'acl'
  | 'onboarding-config'

const ALL_VIEWS: readonly ViewType[] = [
  'dashboard', 'backlog', 'board', 'sprints', 'list', 'reports', 'roadmap',
  'portfolio', 'calendar', 'dependency-graph', 'activity', 'teams', 'settings',
  'documents', 'objectives', 'retrospectives', 'approvals', 'webhooks',
  'automations', 'imports', 'recurring-tasks', 'test-plans', 'sla', 'api-tokens',
  'branding', 'acl', 'onboarding-config',
] as const

/** Guards against a hand-edited ?view= naming something that does not exist. */
function isViewType(value: string): value is ViewType {
  return (ALL_VIEWS as readonly string[]).includes(value)
}

type OnboardingActionTarget = ViewType | '__create_issue' | '__manage_labels'

const ONBOARDING_TARGET_ALIASES: Record<string, OnboardingActionTarget> = {
  dashboard: 'dashboard',
  home: 'dashboard',
  backlog: 'backlog',
  board: 'board',
  kanban: 'board',
  'kanban-board': 'board',
  sprints: 'sprints',
  sprint: 'sprints',
  iterations: 'sprints',
  list: 'list',
  reports: 'reports',
  report: 'reports',
  roadmap: 'roadmap',
  portfolio: 'portfolio',
  calendar: 'calendar',
  'dependency-graph': 'dependency-graph',
  dependencies: 'dependency-graph',
  activity: 'activity',
  teams: 'teams',
  team: 'teams',
  members: 'teams',
  documents: 'documents',
  objectives: 'objectives',
  retrospectives: 'retrospectives',
  retros: 'retrospectives',
  approvals: 'approvals',
  webhooks: 'webhooks',
  automations: 'automations',
  imports: 'imports',
  'recurring-tasks': 'recurring-tasks',
  'test-plans': 'test-plans',
  sla: 'sla',
  branding: 'branding',
  acl: 'acl',
  '__create_issue': '__create_issue',
  'create-issue': '__create_issue',
  create_issue: '__create_issue',
  'new-issue': '__create_issue',
  new_issue: '__create_issue',
  'new-work-item': '__create_issue',
  new_work_item: '__create_issue',
  '__manage_labels': '__manage_labels',
  labels: '__manage_labels',
  'manage-labels': '__manage_labels',
  manage_labels: '__manage_labels',
  'label-management': '__manage_labels',
  label_management: '__manage_labels',
}

function resolveOnboardingTarget(target: string | null | undefined): OnboardingActionTarget | null {
  if (!target) return null

  const baseTarget = target.trim().toLowerCase().split(/[?#]/)[0]?.replace(/^\/+|\/+$/g, '')
  if (!baseTarget) return null

  const directMatch = ONBOARDING_TARGET_ALIASES[baseTarget]
  if (directMatch) return directMatch

  const segments = baseTarget.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const lastSegment = segments[segments.length - 1]
  return ONBOARDING_TARGET_ALIASES[lastSegment] ?? null
}

export default function HomePage() {
  const router = useRouter()
  const {
    projects,
    currentProject,
    currentUser,
    activeProjectId,
    setActiveProjectId,
    setCurrentProject,
    setProjects,
    setUsers,
    setIssues,
    setLabels,
    setIterations,
    setStates,
    setAreas,
    setTeams,
    setWorkItemTypes,
    setProjectAccess,
    setCurrentUser,
    setCreateIssueOpen,
    setSprintModalOpen,
    resetProjectContext,
    viewMode,
    setViewMode,
    isSprintModalOpen,
    isLoading,
    setIsLoading,
    openWorkItemId,
    closeWorkItem,
  } = useAppStore()

  const { theme, setTheme } = useTheme()
  const { trackAction } = useOnboardingEvents()
  // Backed by `?view=` so every workspace view is linkable and browser
  // back/forward work. Previously all 27 views shared one useState and the URL
  // read `/` regardless of what was on screen.
  const { view: currentView, setView: setCurrentView } = useViewRoute<ViewType>({
    defaultView: 'dashboard',
    isValidView: isViewType,
    onExternalChange: (view) => {
      // History navigation must dismiss whatever overlay was open, or Back
      // appears to do nothing while a dialog covers the view behind it.
      closeWorkItem()
      setCreateIssueOpen(false)
      setSprintModalOpen(false)
      setLabelsManagementOpen(false)
      if (view === 'board') setViewMode('board')
      else if (view === 'list') setViewMode('list')
    },
  })
  const [isInitialized, setIsInitialized] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [appLoadError, setAppLoadError] = useState<string | null>(null)
  const [projectDataError, setProjectDataError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [isLabelsManagementOpen, setLabelsManagementOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setSidebarCollapsed(true)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const fetchProjectDataLegacy = useCallback(
    async (projectId: string) => {
      const requests = [
        {
          label: 'issues',
          request: () =>
            fetchWithRetry(`/api/issues?projectId=${projectId}&pageSize=200&includeTotal=true`, {
              timeoutMs: 8_000,
              retries: 1,
            }),
          apply: (payload: unknown, response?: Response) =>
            setIssues(Array.isArray(payload) ? payload : [], {
              total: Number(response?.headers.get('x-total-count')) || undefined,
              pageSize: 200,
            }),
        },
        {
          label: 'labels',
          request: () => fetchWithRetry(`/api/labels?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown, _response?: Response) => setLabels(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'iterations',
          request: () => fetchWithRetry(`/api/iterations?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => setIterations(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'states',
          request: () => fetchWithRetry(`/api/states?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => setStates(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'users',
          request: () => fetchWithRetry(`/api/users?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => setUsers(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'areas',
          request: () => fetchWithRetry(`/api/areas?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => setAreas(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'teams',
          request: () => fetchWithRetry(`/api/teams?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => setTeams(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'work item types',
          request: () => fetchWithRetry(`/api/work-item-types?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => setWorkItemTypes(Array.isArray(payload) ? payload : []),
        },
        {
          label: 'access rules',
          request: () => fetchWithRetry(`/api/rbac?projectId=${projectId}`, { timeoutMs: 8_000, retries: 1 }),
          apply: (payload: unknown) => {
            const access = payload as { role?: string | null; permissions?: string[] } | null
            setProjectAccess({
              role: access?.role ?? null,
              permissions: Array.isArray(access?.permissions) ? access.permissions : [],
            })
          },
        },
      ]

      const results = await Promise.allSettled(
        requests.map(async (entry) => {
          const response = await entry.request()
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, `Failed to load ${entry.label}`))
          }

          const payload = await parseJsonResponse<unknown>(response, null)
          if (payload === null) {
            throw new Error(`${entry.label} returned malformed data`)
          }

          entry.apply(payload, response)
        })
      )

      const failed = results.filter((result) => result.status === 'rejected')
      if (failed.length === requests.length) {
        throw new Error('Project data could not be loaded')
      }

      setProjectDataError(
        failed.length > 0 ? 'Some project data is delayed or unavailable. Showing the latest successful slices.' : null
      )
    },
    [
      setAreas,
      setIssues,
      setIterations,
      setLabels,
      setProjectAccess,
      setStates,
      setTeams,
      setUsers,
      setWorkItemTypes,
    ]
  )

  const fetchProjectData = useCallback(
    async (projectId: string) => {
      setIsLoading(true)
      try {
        const bootstrapRes = await fetchWithRetry(
          `/api/projects/bootstrap?projectId=${projectId}&pageSize=200`,
          { timeoutMs: 10_000, retries: 1 }
        )

        if (bootstrapRes.ok) {
          const payload = await parseJsonResponse<Record<string, unknown> | null>(bootstrapRes, null)

          if (payload) {
            setIssues(Array.isArray(payload.issues) ? payload.issues : [], {
              // The true project-wide count, so views can say "showing X of Y"
              // rather than presenting a capped page as the whole backlog.
              total: typeof payload.issueTotal === 'number' ? payload.issueTotal : undefined,
              pageSize:
                typeof payload.issuePageSize === 'number' ? payload.issuePageSize : undefined,
            })
            setLabels(Array.isArray(payload.labels) ? payload.labels : [])
            setIterations(Array.isArray(payload.iterations) ? payload.iterations : [])
            setStates(Array.isArray(payload.states) ? payload.states : [])
            setUsers(Array.isArray(payload.users) ? payload.users : [])
            setAreas(Array.isArray(payload.areas) ? payload.areas : [])
            setTeams(Array.isArray(payload.teams) ? payload.teams : [])
            setWorkItemTypes(Array.isArray(payload.workItemTypes) ? payload.workItemTypes : [])
            const rbac = (payload.rbac ?? null) as { role?: string | null; permissions?: string[] } | null
            setProjectAccess({
              role: rbac?.role ?? null,
              permissions: Array.isArray(rbac?.permissions) ? rbac.permissions : [],
            })
            setProjectDataError(null)
            return
          }
        } else {
          setProjectDataError(await getApiErrorMessage(bootstrapRes, 'Project bootstrap failed. Falling back to segmented loading.'))
        }

        await fetchProjectDataLegacy(projectId)
      } catch (error) {
        console.error('Failed to fetch project data:', error)
        setProjectDataError('Project data is temporarily unavailable. Retrying the segmented fallback.')
        await fetchProjectDataLegacy(projectId)
      } finally {
        setIsLoading(false)
      }
    },
    [
      setAreas,
      setIssues,
      setIsLoading,
      setIterations,
      setLabels,
      setProjectAccess,
      setStates,
      setTeams,
      setUsers,
      setWorkItemTypes,
      fetchProjectDataLegacy,
    ]
  )

  const selectProject = useCallback(
    async (projectId: string | null) => {
      if (!projectId) {
        resetProjectContext()
        router.replace('/dashboard')
        return
      }

      const response = await fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        throw new Error('Failed to switch project')
      }

      const project =
        projects.find((candidate) => candidate.id === projectId) ?? currentProject

      if (project) {
        setCurrentProject(project)
        setActiveProjectId(project.id)
      }
    },
    [currentProject, projects, resetProjectContext, router, setActiveProjectId, setCurrentProject]
  )

  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true)
      setAppLoadError(null)

      try {
        const meRes = await fetchWithRetry('/api/auth/me', {
          timeoutMs: 8_000,
          retries: 1,
          cache: 'no-store',
        })

        if (!meRes.ok) {
          if (meRes.status === 401) {
            router.replace('/login')
            return
          }

          setAppLoadError(await getApiErrorMessage(meRes, 'Failed to restore your session'))
          return
        }

        const me = await parseJsonResponse<AppUser | null>(meRes, null)
        if (!me) {
          setAppLoadError('Session restore returned malformed data')
          return
        }

        setCurrentUser(me)

        const projectsRes = await fetchWithRetry('/api/projects', {
          timeoutMs: 8_000,
          retries: 1,
          cache: 'no-store',
        })

        if (!projectsRes.ok) {
          setAppLoadError(await getApiErrorMessage(projectsRes, 'Failed to load projects'))
          return
        }

        const availableProjects = await parseJsonResponse<Project[] | null>(projectsRes, null)
        if (!availableProjects || !Array.isArray(availableProjects)) {
          setAppLoadError('Projects returned malformed data')
          return
        }

        setProjects(availableProjects)

        if (!availableProjects.length) {
          resetProjectContext()
          router.replace('/dashboard')
          return
        }

        const persistedProjectId = useAppStore.getState().activeProjectId
        const activeRes = await fetchWithRetry('/api/projects/active', {
          timeoutMs: 6_000,
          retries: 1,
          cache: 'no-store',
        })
        const activePayload = activeRes.ok
          ? await parseJsonResponse<{ project?: { id?: string | null } | null }>(activeRes, { project: null })
          : { project: null }
        const resolvedActiveProject =
          availableProjects.find(
            (project) =>
              project.id === activePayload.project?.id || project.id === persistedProjectId
          ) ?? null

        if (!resolvedActiveProject) {
          resetProjectContext()
          router.replace('/dashboard')
          return
        }

        setCurrentProject(resolvedActiveProject)
        setActiveProjectId(resolvedActiveProject.id)

        if (resolvedActiveProject.id !== activePayload.project?.id) {
          await fetch('/api/projects/active', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: resolvedActiveProject.id }),
          })
        }
      } catch (error) {
        console.error('Failed to initialize app:', error)
        setAppLoadError(
          error instanceof Error ? error.message : 'Failed to initialize the application'
        )
      } finally {
        setIsLoading(false)
        setIsInitialized(true)
      }
    }

    initializeApp()
  }, [
    reloadKey,
    resetProjectContext,
    router,
    setActiveProjectId,
    setCurrentProject,
    setCurrentUser,
    setIsLoading,
    setProjects,
  ])

  useEffect(() => {
    if (currentProject && isInitialized) {
      fetchProjectData(currentProject.id)
    }
  }, [currentProject, fetchProjectData, isInitialized])

  useEffect(() => {
    if (currentView === 'board') setViewMode('board')
    else if (currentView === 'list') setViewMode('list')
  }, [currentView, setViewMode])

  const handleViewChange = (view: ViewType) => {
    closeWorkItem()
    setCreateIssueOpen(false)
    setSprintModalOpen(false)
    setLabelsManagementOpen(false)
    setCurrentView(view)
    if (view === 'board') {
      setViewMode('board')
      trackAction('view_board')
    } else if (view === 'list') {
      setViewMode('list')
    }
    if (view === 'reports') trackAction('view_reports')
  }

  const handleOnboardingNavigate = (viewOrAction: string) => {
    const target = resolveOnboardingTarget(viewOrAction)

    if (!target) {
      toast.error('This onboarding action is not configured for the current workspace view.')
      return
    }

    if (target === '__create_issue') {
      closeWorkItem()
      setSprintModalOpen(false)
      setLabelsManagementOpen(false)
      setCreateIssueOpen(true)
      return
    }

    if (target === '__manage_labels') {
      closeWorkItem()
      setCreateIssueOpen(false)
      setSprintModalOpen(false)
      setLabelsManagementOpen(true)
      return
    }

    handleViewChange(target)
  }

  const handleViewModeChange = (mode: 'board' | 'list') => {
    setViewMode(mode)
    setCurrentView(mode)
  }

  const isCreateScreenVisible = useAppStore((state) => state.isCreateIssueOpen)

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    resetProjectContext()
    router.replace('/login')
  }

  const handleBackToDashboard = async () => {
    await fetch('/api/projects/active', { method: 'DELETE' })
    resetProjectContext()
    router.push('/dashboard')
  }

  const handleProjectChange = async (projectId: string) => {
    try {
      await selectProject(projectId)
    } catch {
      console.error('Failed to change project')
    }
  }

  if (!isInitialized) {
    return (
      <div className="flex h-dvh bg-background">
        <div className="hidden w-52 flex-col border-r border-border bg-sidebar md:flex">
          <div className="border-b border-border p-3">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="space-y-1 p-2">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <div className="mt-4 px-2">
            <Skeleton className="mb-2 h-3 w-12" />
            <div className="space-y-1">
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <Skeleton className="h-6 w-44" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
          </div>
          <div className="flex-1 p-4 sm:p-6">
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="mb-6 h-32 rounded-xl" />
            <div className="grid gap-6 md:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (appLoadError && !currentProject) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Workspace failed to initialize</h1>
          <p className="mt-2 text-sm text-muted-foreground" data-testid="home-init-error">
            {appLoadError}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={() => setReloadKey((value) => value + 1)} data-testid="home-init-retry-button">
              Retry
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <OnboardingProvider>
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        role="complementary"
        aria-label="Project navigation"
        className={`${
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-52'
        } flex-shrink-0 border-r border-border bg-sidebar transition-all duration-200 ease-in-out max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-xl`}
      >
        <AppSidebar currentView={currentView} onViewChange={handleViewChange} />
      </aside>

      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
          aria-hidden="true"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border bg-background px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </Button>

            {currentProject && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-7 max-w-[280px] gap-1.5 px-2 text-[13px] font-medium">
                    <div
                      className="flex h-4.5 w-4.5 items-center justify-center rounded text-[9px] font-bold text-white"
                      style={{ backgroundColor: currentProject.color }}
                    >
                      {currentProject.key.slice(0, 2)}
                    </div>
                    <span className="truncate">{currentProject.name}</span>
                    <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Switch Project
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {projects
                    .filter((project) => !project.isArchived)
                    .map((project) => (
                      <DropdownMenuItem
                        key={project.id}
                        onClick={() => handleProjectChange(project.id)}
                        className="gap-2"
                      >
                        <div
                          className="h-4 w-4 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <span className="truncate">{project.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {project.currentUserRole}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleBackToDashboard} className="gap-2">
                    <User className="h-4 w-4" />
                    Dashboard
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center gap-1">
            <CommandPalette />
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-7 gap-1.5 px-1.5">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={currentUser?.avatar || undefined} />
                    <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                      {(currentUser?.name || 'User')
                        .split(' ')
                        .map((segment) => segment[0])
                        .join('')
                        .toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-[13px] sm:inline">
                    {currentUser?.name || 'User'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="space-y-1">
                  <div className="text-sm font-medium">{currentUser?.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {currentUser?.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                  <User className="mr-2 h-4 w-4" />
                  Profile Settings
                </DropdownMenuItem>
                {currentUser?.globalRole === 'admin' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Organization Admin
                    </DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => router.push('/admin/panel')}>
                      <Building2 className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/admin/security')}>
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Security
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-500">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="flex flex-1 flex-col overflow-hidden">
          {openWorkItemId ? (
            <WorkItemPage
              issueId={openWorkItemId}
              embedded
              onClose={closeWorkItem}
            />
          ) : (
            <>
              {!isCreateScreenVisible &&
                !isSprintModalOpen &&
                (currentView === 'backlog' || currentView === 'board' || currentView === 'list') && (
                <FilterBar
                  onViewModeChange={handleViewModeChange}
                  showViewModeToggle={currentView === 'board' || currentView === 'list'}
                />
                )}

              {projectDataError ? (
                <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" data-testid="home-project-data-error">
                  <span>{projectDataError}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-amber-300 bg-white/80 text-amber-900 hover:bg-white"
                    onClick={() => currentProject && void fetchProjectData(currentProject.id)}
                    data-testid="home-project-data-retry-button"
                  >
                    Retry sync
                  </Button>
                </div>
              ) : null}

              <div className="flex-1 overflow-auto">
                {isCreateScreenVisible ? (
                  <CreateIssueDialog
                    mode="screen"
                    onClose={() => setCreateIssueOpen(false)}
                  />
                ) : isSprintModalOpen ? (
                  <SprintManagement />
                ) : (
                  <>
                    {currentView === 'dashboard' && (
                      <>
                        <div className="px-6 pt-6">
                          <OnboardingChecklist onNavigate={handleOnboardingNavigate} />
                        </div>
                        <DashboardView />
                      </>
                    )}
                    {currentView === 'backlog' && <BacklogView />}
                    {currentView === 'board' && <KanbanBoard />}
                    {currentView === 'sprints' && <SprintView />}
                    {currentView === 'list' && <ListView />}
                    {currentView === 'roadmap' && <RoadmapView />}
                    {currentView === 'portfolio' && <PortfolioView />}
                    {currentView === 'calendar' && <CalendarView />}
                    {currentView === 'dependency-graph' && <DependencyGraphView />}
                    {currentView === 'activity' && <ActivityFeedView />}
                    {currentView === 'reports' && <ReportsView />}
                    {currentView === 'teams' && <TeamManagement mode="screen" />}
                    {currentView === 'documents' && <DocumentsView />}
                    {currentView === 'onboarding-config' && <OnboardingConfigView />}
                    {currentView === 'objectives' && <ObjectivesView />}
                    {currentView === 'retrospectives' && <RetrospectivesView />}
                    {currentView === 'approvals' && <ApprovalDashboard />}
                    {currentView === 'webhooks' && <WebhookManagement />}
                    {currentView === 'automations' && <AutomationRuleBuilder />}
                    {currentView === 'imports' && <ImportWizard />}
                    {currentView === 'recurring-tasks' && <RecurringTaskManager />}
                    {currentView === 'test-plans' && <TestPlanManager />}
                    {currentView === 'sla' && <SlaDashboard />}
                    {currentView === 'api-tokens' && <ApiTokenManagement />}
                    {currentView === 'branding' && <BrandingStudio />}
                    {currentView === 'acl' && <AclManagement />}
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <UserProfile open={isProfileOpen} onOpenChange={setIsProfileOpen} />
      <LabelsManagement open={isLabelsManagementOpen} onOpenChange={setLabelsManagementOpen} />
    </div>
    </OnboardingProvider>
  )
}
