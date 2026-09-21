'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
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
import { useWorkspaceFilterRoute } from '@/hooks/use-workspace-filter-route'
import { WorkItemPage } from '@/components/project-management/work-item-page'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ErrorState, InlineAlert } from '@/components/ui/states'
import { PageHeader } from '@/components/ui/page-header'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
  Check,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  Plus,
  PanelLeftClose,
  RefreshCw,
  Shield,
  Sun,
  User,
} from 'lucide-react'
import { fetchWithRetry, getApiErrorMessage, parseJsonResponse } from '@/lib/utils'
import { useViewRoute } from '@/hooks/use-view-route'
import {
  canonicalWorkspaceRoute,
  isWorkspaceView,
  type WorkspaceView,
} from '@/lib/domain/workspace-route'
import dynamic from 'next/dynamic'
import { WorkspaceShellSkeleton } from '@/components/project-management/workspace-loading'

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

type ViewType = WorkspaceView

/** Guards legacy query links naming a view that does not exist. */
function isViewType(value: string): value is ViewType {
  return isWorkspaceView(value)
}

/**
 * The name and section for every destination, so the top bar can say where
 * you are. The shell previously showed only the project name regardless of
 * what was on screen: twenty-seven views, one label, and no way back up.
 */
const VIEW_META: Record<ViewType, { label: string; section?: string }> = {
  dashboard: { label: 'Overview' },
  backlog: { label: 'Backlog', section: 'Plan' },
  board: { label: 'Board', section: 'Plan' },
  list: { label: 'Work items', section: 'Plan' },
  sprints: { label: 'Sprints', section: 'Plan' },
  roadmap: { label: 'Roadmap', section: 'Plan' },
  calendar: { label: 'Calendar', section: 'Plan' },
  portfolio: { label: 'Portfolio', section: 'Track' },
  'dependency-graph': { label: 'Dependencies', section: 'Track' },
  objectives: { label: 'Goals', section: 'Track' },
  approvals: { label: 'Approvals', section: 'Track' },
  activity: { label: 'Activity', section: 'Track' },
  reports: { label: 'Reports', section: 'Analyse' },
  documents: { label: 'Documents', section: 'Analyse' },
  retrospectives: { label: 'Retros', section: 'Analyse' },
  teams: { label: 'Teams', section: 'Settings' },
  webhooks: { label: 'Webhooks', section: 'Settings' },
  automations: { label: 'Automations', section: 'Settings' },
  imports: { label: 'Import', section: 'Settings' },
  'recurring-tasks': { label: 'Recurring tasks', section: 'Settings' },
  'test-plans': { label: 'Test plans', section: 'Settings' },
  sla: { label: 'SLA policies', section: 'Settings' },
  'api-tokens': { label: 'API tokens', section: 'Settings' },
  branding: { label: 'Branding', section: 'Settings' },
  acl: { label: 'ACL rules', section: 'Settings' },
  'onboarding-config': { label: 'Onboarding', section: 'Settings' },
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

export function WorkspaceApp({
  routeProjectId,
  routeView,
}: {
  routeProjectId?: string
  routeView?: WorkspaceView
}) {
  const router = useRouter()
  const {
    projects,
    currentProject,
    currentProjectPermissions,
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
    setTypeStateMappings,
    setStateTransitions,
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

  useWorkspaceFilterRoute()

  const { theme, setTheme } = useTheme()
  const { trackAction } = useOnboardingEvents()
  // App Router segments are canonical. The hook also reads legacy `?view=`
  // links until initialization can replace them with a project-aware path.
  const { view: currentView, setView: setCurrentView } = useViewRoute<ViewType>({
    defaultView: 'dashboard',
    isValidView: isViewType,
    initialView: routeView,
    routeProjectId,
    buildCanonicalPath: canonicalWorkspaceRoute,
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
  /**
   * Desktop collapse is now a rail, not a disappearance, so it no longer needs
   * to be forced on at narrow widths — below md the sidebar is a drawer
   * instead, which is a different control entirely.
   */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobileNavOpen, setMobileNavOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [appLoadError, setAppLoadError] = useState<string | null>(null)
  const [projectDataError, setProjectDataError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [isLabelsManagementOpen, setLabelsManagementOpen] = useState(false)
  const [onboardingActionError, setOnboardingActionError] = useState<string | null>(null)

  /**
   * Narrow laptops get the rail so the board keeps its columns; the drawer
   * takes over below md and is driven by its own state. Only ever set on
   * mount and on a genuine crossing of the breakpoint, so a user who expands
   * the rail does not have it collapsed again by an unrelated resize.
   */
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1180px)')
    const apply = (matches: boolean) => {
      if (window.innerWidth >= 768) setSidebarCollapsed(matches)
    }

    apply(query.matches)
    const onChange = (event: MediaQueryListEvent) => apply(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const fetchProjectDataLegacy = useCallback(
    async (projectId: string) => {
      // The segmented fallback predates workflow topology. Clear any previous
      // project's graph so move controls fail closed instead of offering
      // transitions that this project may reject.
      setTypeStateMappings([])
      setStateTransitions([])

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
      setStateTransitions,
      setStates,
      setTeams,
      setTypeStateMappings,
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
            setTypeStateMappings(
              Array.isArray(payload.typeStateMappings) ? payload.typeStateMappings : []
            )
            setStateTransitions(
              Array.isArray(payload.stateTransitions) ? payload.stateTransitions : []
            )
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
      setStateTransitions,
      setStates,
      setTeams,
      setTypeStateMappings,
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
        const requestedProject = routeProjectId
          ? availableProjects.find((project) => project.id === routeProjectId) ?? null
          : null
        const resolvedActiveProject = routeProjectId
          ? requestedProject
          : availableProjects.find(
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
    routeProjectId,
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

  // Root and `?view=` links remain valid during the rollout. Once the active
  // project is known, replace them with a durable project-aware route so a
  // copied link opens the same workspace for another authorised user.
  useEffect(() => {
    if (!isInitialized || !currentProject || routeProjectId) return
    router.replace(
      canonicalWorkspaceRoute(currentProject.id, currentView, window.location.search)
    )
  }, [currentProject, currentView, isInitialized, routeProjectId, router])

  useEffect(() => {
    if (currentView === 'board') setViewMode('board')
    else if (currentView === 'list') setViewMode('list')
  }, [currentView, setViewMode])

  const handleViewChange = (view: ViewType) => {
    // The mobile drawer covers most of the screen. Leaving it open after a
    // selection meant the chosen view loaded behind it and the user had to
    // dismiss the scrim manually to see what they had picked.
    setMobileNavOpen(false)

    closeWorkItem()
    setCreateIssueOpen(false)
    setSprintModalOpen(false)
    setLabelsManagementOpen(false)
    setCurrentView(view, { projectId: currentProject?.id ?? routeProjectId })
    if (view === 'board') {
      setViewMode('board')
      trackAction('view_board')
    } else if (view === 'list') {
      setViewMode('list')
    }
    if (view === 'reports') trackAction('view_reports')
  }

  const handleOnboardingNavigate = (viewOrAction: string) => {
    setOnboardingActionError(null)
    const target = resolveOnboardingTarget(viewOrAction)

    if (!target) {
      setOnboardingActionError('This checklist action is not configured. Ask a project administrator to update the onboarding step.')
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
    setCurrentView(mode, { projectId: currentProject?.id ?? routeProjectId })
  }

  const isCreateScreenVisible = useAppStore((state) => state.isCreateIssueOpen)

  useEffect(() => {
    const handleQuickCreate = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'c' ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !currentProject ||
        !currentProjectPermissions.includes('workitem:create') ||
        isCreateScreenVisible ||
        isSprintModalOpen ||
        isLabelsManagementOpen ||
        isProfileOpen ||
        Boolean(openWorkItemId)
      ) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || Boolean(target.closest('input, textarea, select, [role="textbox"]')))
      ) {
        return
      }

      event.preventDefault()
      setCreateIssueOpen(true)
    }

    window.addEventListener('keydown', handleQuickCreate)
    return () => window.removeEventListener('keydown', handleQuickCreate)
  }, [
    currentProject,
    currentProjectPermissions,
    isCreateScreenVisible,
    isLabelsManagementOpen,
    isProfileOpen,
    isSprintModalOpen,
    openWorkItemId,
    setCreateIssueOpen,
  ])

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
      setCurrentView(currentView, { projectId })
    } catch {
      console.error('Failed to change project')
    }
  }

  if (!isInitialized) {
    return <WorkspaceShellSkeleton />
  }

  if (appLoadError && !currentProject) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card">
          <ErrorState
            title="This workspace did not load"
            description="Your session is fine — the workspace data could not be fetched. Retrying usually resolves it."
            detail={appLoadError}
            action={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReloadKey((value) => value + 1)}
                  data-testid="home-init-retry-button"
                >
                  <RefreshCw />
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Sign out
                </Button>
              </>
            }
          />
          <span className="sr-only" data-testid="home-init-error">
            {appLoadError}
          </span>
        </div>
      </div>
    )
  }

  const viewMeta = VIEW_META[currentView] ?? { label: 'Overview' }

  const projectMenu = currentProject ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="max-w-[15rem] gap-1.5 px-1.5 font-medium"
          aria-label={`Current project: ${currentProject.name}. Switch project`}
          data-testid="workspace-project-switcher"
        >
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold text-white"
            style={{ backgroundColor: currentProject.color }}
          >
            {currentProject.key.slice(0, 2)}
          </span>
          <span className="truncate">{currentProject.name}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Switch project</DropdownMenuLabel>
        {projects
          .filter((project) => !project.isArchived)
          .map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => handleProjectChange(project.id)}
              className="gap-2"
            >
              <span
                aria-hidden="true"
                className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-bold text-white"
                style={{ backgroundColor: project.color }}
              >
                {project.key.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.id === currentProject.id ? (
                <Check className="size-3.5 text-primary" />
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {project.currentUserRole}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleBackToDashboard} className="gap-2">
          <LayoutGrid className="size-3.5" />
          All projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  return (
    <OnboardingProvider>
    <div className="flex h-dvh overflow-hidden bg-background">
      {/*
        Desktop: a resident column that collapses to a 52px rail rather than
        to nothing, so navigation is never more than one click away.
      */}
      <aside
        aria-label="Project navigation"
        className="hidden shrink-0 border-r border-sidebar-border md:block"
      >
        <AppSidebar
          currentView={currentView}
          onViewChange={handleViewChange}
          collapsed={sidebarCollapsed}
        />
      </aside>

      {/*
        Below md the same navigation becomes a drawer. Previously it was the
        desktop sidebar pinned over the content with a hand-rolled scrim, which
        trapped focus behind it and could not be dismissed with Escape.
      */}
      <Sheet open={isMobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[13.5rem] overflow-hidden bg-sidebar p-0 md:hidden"
        >
          <SheetTitle className="sr-only">Project navigation</SheetTitle>
          <AppSidebar
            currentView={currentView}
            onViewChange={handleViewChange}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-2 sm:px-3"
          data-testid="workspace-toolbar"
        >
          <div className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu />
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden md:inline-flex"
                  aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-pressed={sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((value) => !value)}
                >
                  {sidebarCollapsed ? <PanelLeft /> : <PanelLeftClose />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </TooltipContent>
            </Tooltip>

            {/*
              Project → section → view. The shell used to show the project name
              alone, so nothing on screen distinguished the Board from the
              Backlog from SLA Policies except the content itself.
            */}
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
              {projectMenu}
              {currentProject ? (
                <>
                  <ChevronRight
                    className="hidden size-3 shrink-0 text-muted-foreground/50 sm:block"
                    aria-hidden="true"
                  />
                  {viewMeta.section ? (
                    <>
                      <span className="hidden text-[13px] text-muted-foreground lg:inline">
                        {viewMeta.section}
                      </span>
                      <ChevronRight
                        className="hidden size-3 shrink-0 text-muted-foreground/50 lg:block"
                        aria-hidden="true"
                      />
                    </>
                  ) : null}
                  <span
                    aria-current="page"
                    className="hidden truncate text-[13px] font-medium text-foreground sm:inline"
                  >
                    {viewMeta.label}
                  </span>
                </>
              ) : null}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <CommandPalette />
            <NotificationBell />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  onClick={toggleTheme}
                >
                  {theme === 'dark' ? <Sun /> : <Moon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-1 sm:pr-2"
                  aria-label="Account menu"
                  data-testid="account-menu-trigger"
                >
                  <Avatar className="size-6">
                    <AvatarImage src={currentUser?.avatar || undefined} />
                    <AvatarFallback className="bg-primary-muted text-[10px] font-semibold text-primary">
                      {(currentUser?.name || 'User')
                        .split(' ')
                        .map((segment) => segment[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[9rem] truncate sm:inline">
                    {currentUser?.name || 'User'}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 pb-1.5 pt-1.5">
                  <p className="truncate text-[13px] font-medium">{currentUser?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {currentUser?.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                  <User />
                  Profile settings
                </DropdownMenuItem>
                {currentUser?.globalRole === 'admin' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Organization</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => router.push('/admin/panel')}>
                      <Building2 />
                      Admin panel
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/admin/security')}>
                      <Shield />
                      Security
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="relative flex flex-1 flex-col overflow-hidden">
          {openWorkItemId ? (
            <div className="absolute inset-0 z-20 bg-background">
              <WorkItemPage
                issueId={openWorkItemId}
                embedded
                onClose={closeWorkItem}
              />
            </div>
          ) : null}

          {/*
            Keep the workspace subtree mounted behind an open item. The view's
            own scroll containers and board position then retain their DOM
            state, so closing an item returns to the exact place it was opened.
          */}
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              openWorkItemId && 'invisible pointer-events-none'
            )}
            aria-hidden={openWorkItemId ? true : undefined}
            inert={openWorkItemId ? true : undefined}
          >
              {!isCreateScreenVisible &&
                !isSprintModalOpen &&
                (currentView === 'backlog' || currentView === 'board' || currentView === 'list') && (
                <FilterBar
                  onViewModeChange={handleViewModeChange}
                  showViewModeToggle={currentView === 'board' || currentView === 'list'}
                />
                )}

              {/*
                A partial sync failure is not a reason to take the whole view
                away — the previously loaded data is still useful. This says
                what is stale and offers the fix, in the product's own warning
                tone rather than hard-coded amber that ignored dark mode.
              */}
              {projectDataError ? (
                <div className="shrink-0 px-4 pt-3 sm:px-6" data-testid="home-project-data-error">
                  <InlineAlert
                    tone="warning"
                    title="Some project data is out of date."
                    action={
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => currentProject && void fetchProjectData(currentProject.id)}
                        data-testid="home-project-data-retry-button"
                      >
                        Retry sync
                      </Button>
                    }
                  >
                    {projectDataError}
                  </InlineAlert>
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
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
                        {/*
                          The overview is the one workspace surface that earns a
                          full page header: it is where someone lands, and it is
                          the only view whose title is not already answered by
                          the toolbar underneath it. The board, list and backlog
                          get their identity from the breadcrumb plus their own
                          filter bar, so a second title there would be a third
                          horizontal band saying nothing new.
                        */}
                        <PageHeader
                          title={currentProject?.name ?? 'Overview'}
                          description={
                            currentProject?.description ||
                            'Everything that needs a decision in this project, in one place.'
                          }
                          meta={
                            currentProject ? (
                              <>
                                <Badge variant="outline" className="font-mono">
                                  {currentProject.key}
                                </Badge>
                                {currentProject.currentUserRole ? (
                                  <Badge variant="secondary">
                                    {currentProject.currentUserRole}
                                  </Badge>
                                ) : null}
                              </>
                            ) : null
                          }
                          actions={
                            currentProject ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewChange('board')}
                                >
                                  Open board
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => setCreateIssueOpen(true)}
                                  title="Create work item (C)"
                                >
                                  <Plus />
                                  New work item
                                </Button>
                              </>
                            ) : null
                          }
                        />
                        <div className="px-4 pt-4 sm:px-6">
                          {onboardingActionError ? (
                            <InlineAlert
                              className="mb-3"
                              tone="danger"
                              title="Checklist action unavailable."
                              action={<Button size="sm" variant="outline" onClick={() => setOnboardingActionError(null)}>Dismiss</Button>}
                            >
                              {onboardingActionError}
                            </InlineAlert>
                          ) : null}
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
          </div>
        </main>
      </div>

      <UserProfile open={isProfileOpen} onOpenChange={setIsProfileOpen} />
      <LabelsManagement open={isLabelsManagementOpen} onOpenChange={setLabelsManagementOpen} />
    </div>
    </OnboardingProvider>
  )
}
