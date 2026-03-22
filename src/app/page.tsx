'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useAppStore } from '@/store/app-store'
import {
  AppSidebar,
  BacklogView,
  AdminConfigPanel,
  AdminSecurityView,
  CreateIssueDialog,
  DashboardView,
  FilterBar,
  KanbanBoard,
  ListView,
  SprintManagement,
  SprintView,
  TeamManagement,
  UserProfile,
} from '@/components/project-management'
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
  ChevronDown,
  LogOut,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Sun,
  User,
} from 'lucide-react'

type ViewType =
  | 'dashboard'
  | 'backlog'
  | 'board'
  | 'sprints'
  | 'list'
  | 'admin-panel'
  | 'work-item-types'
  | 'teams'
  | 'admin-security'
  | 'settings'

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
  const [currentView, setCurrentView] = useState<ViewType>('dashboard')
  const [isInitialized, setIsInitialized] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

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
      const [
        issuesRes,
        labelsRes,
        iterationsRes,
        statesRes,
        usersRes,
        areasRes,
        teamsRes,
        workItemTypesRes,
        rbacRes,
      ] = await Promise.all([
        fetch(`/api/issues?projectId=${projectId}&pageSize=200`),
        fetch(`/api/labels?projectId=${projectId}`),
        fetch(`/api/iterations?projectId=${projectId}`),
        fetch(`/api/states?projectId=${projectId}`),
        fetch(`/api/users?projectId=${projectId}`),
        fetch(`/api/areas?projectId=${projectId}`),
        fetch(`/api/teams?projectId=${projectId}`),
        fetch(`/api/work-item-types?projectId=${projectId}`),
        fetch(`/api/rbac?projectId=${projectId}`),
      ])

      if (issuesRes.ok) setIssues(await issuesRes.json())
      if (labelsRes.ok) setLabels(await labelsRes.json())
      if (iterationsRes.ok) setIterations(await iterationsRes.json())
      if (statesRes.ok) setStates(await statesRes.json())
      if (usersRes.ok) setUsers(await usersRes.json())
      if (areasRes.ok) setAreas(await areasRes.json())
      if (teamsRes.ok) setTeams(await teamsRes.json())
      if (workItemTypesRes.ok) setWorkItemTypes(await workItemTypesRes.json())
      if (rbacRes.ok) {
        const access = await rbacRes.json()
        setProjectAccess({
          role: access.role ?? null,
          permissions: access.permissions ?? [],
        })
      }
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
        const bootstrapRes = await fetch(
          `/api/projects/bootstrap?projectId=${projectId}&pageSize=200`
        )

        if (bootstrapRes.ok) {
          const payload = await bootstrapRes.json()
          setIssues(payload.issues ?? [])
          setLabels(payload.labels ?? [])
          setIterations(payload.iterations ?? [])
          setStates(payload.states ?? [])
          setUsers(payload.users ?? [])
          setAreas(payload.areas ?? [])
          setTeams(payload.teams ?? [])
          setWorkItemTypes(payload.workItemTypes ?? [])
          setProjectAccess({
            role: payload.rbac?.role ?? null,
            permissions: payload.rbac?.permissions ?? [],
          })
        } else {
          await fetchProjectDataLegacy(projectId)
        }
      } catch (error) {
        console.error('Failed to fetch project data:', error)
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
      try {
        const [meRes, projectsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/projects'),
        ])

        if (!meRes.ok) {
          router.replace('/login')
          return
        }

        const me = await meRes.json()
        setCurrentUser(me)

        if (!projectsRes.ok) {
          router.replace('/dashboard')
          return
        }

        const availableProjects = await projectsRes.json()
        setProjects(availableProjects)

        if (!availableProjects.length) {
          resetProjectContext()
          router.replace('/dashboard')
          return
        }

        const persistedProjectId = useAppStore.getState().activeProjectId
        const activeRes = await fetch('/api/projects/active')
        const activePayload = activeRes.ok ? await activeRes.json() : { project: null }
        const resolvedActiveProject =
          availableProjects.find(
            (project: { id: string }) =>
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
        router.replace('/login')
      } finally {
        setIsLoading(false)
        setIsInitialized(true)
      }
    }

    initializeApp()
  }, [
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
    setCurrentView(view)
    if (view === 'board') setViewMode('board')
    else if (view === 'list') setViewMode('list')
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
      <div className="flex h-screen bg-background">
        <div className="flex w-52 flex-col border-r border-border bg-sidebar">
          <div className="border-b border-border p-3">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="space-y-1 p-2">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
          <div className="mt-3 p-2">
            <Skeleton className="mb-2 h-3.5 w-16" />
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex h-11 items-center justify-between border-b border-border px-4">
            <Skeleton className="h-6 w-44" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-full" />
            </div>
          </div>
          <div className="flex-1 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-8 w-56 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
            <div className="flex gap-3">
              {[1, 2, 3, 4].map((index) => (
                <div key={index} className="w-64 space-y-2">
                  <Skeleton className="h-9 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        role="complementary"
        aria-label="Project navigation"
        className={`${
          sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-52'
        } flex-shrink-0 border-r border-border bg-sidebar transition-all duration-200 ease-in-out max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40`}
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
        <header className="flex h-11 flex-shrink-0 items-center justify-between border-b border-border bg-background px-3">
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

          <div className="flex items-center gap-0.5">
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
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
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
                    {currentView === 'dashboard' && <DashboardView />}
                    {currentView === 'backlog' && <BacklogView />}
                    {currentView === 'board' && <KanbanBoard />}
                    {currentView === 'sprints' && <SprintView />}
                    {currentView === 'list' && <ListView />}
                    {(currentView === 'work-item-types' || currentView === 'admin-panel') && (
                      <AdminConfigPanel />
                    )}
                    {currentView === 'teams' && <TeamManagement mode="screen" />}
                    {currentView === 'admin-security' && <AdminSecurityView />}
                  </>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      <UserProfile open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </div>
  )
}
