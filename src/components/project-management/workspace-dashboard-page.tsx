'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { canonicalWorkspaceRoute } from '@/lib/domain/workspace-route'
import { useAppStore, type Project } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { RabbitFlowMark } from '@/components/brand/rabbitflow-mark'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/states'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowRight,
  FileText,
  FolderKanban,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { PROJECT_COLORS } from '@/lib/ui-tokens'
import { getApiErrorMessage } from '@/lib/utils'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from './confirm-destructive-dialog'
import { ProjectDirectorySkeleton } from './workspace-loading'

const PROJECT_ROLE_OPTIONS = ['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'] as const

type ProjectFormErrors = {
  name?: string
  key?: string
  submit?: string
}

type UserFormErrors = {
  name?: string
  email?: string
  password?: string
  project?: string
  submit?: string
}

export function WorkspaceDashboardPage() {
  const router = useRouter()
  const {
    currentUser,
    resetProjectContext,
    setCurrentProject,
    setCurrentUser,
    setProjects,
    setActiveProjectId,
  } = useAppStore()
  const [projects, setLocalProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pageActionError, setPageActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    key: '',
    description: '',
    color: '#6366f1',
  })
  const [editProjectId, setEditProjectId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    color: '#6366f1',
  })
  const [createUserForm, setCreateUserForm] = useState({
    name: '',
    email: '',
    password: '',
    assignToProject: false,
    projectId: '',
    projectRole: 'Dev' as (typeof PROJECT_ROLE_OPTIONS)[number],
  })
  const [isCreating, setIsCreating] = useState(false)
  const [createErrors, setCreateErrors] = useState<ProjectFormErrors>({})
  const [isUpdatingProject, setIsUpdatingProject] = useState(false)
  const [editErrors, setEditErrors] = useState<ProjectFormErrors>({})
  const [isDeletingProject, setIsDeletingProject] = useState(false)
  const projectDeletion = useDestructiveConfirm<Project>()
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [createUserErrors, setCreateUserErrors] = useState<UserFormErrors>({})
  const canCreateProject = currentUser?.globalRole === 'admin'

  const canManageProject = (project: Project) =>
    currentUser?.globalRole === 'admin' || project.currentUserRole === 'Admin'

  const openAdminPanel = async () => {
    const targetProject = projects.find((project) => !project.isArchived) ?? null
    if (!targetProject) {
      setPageActionError('Create a project before opening the admin panel.')
      return
    }

    setPageActionError(null)
    try {
      const res = await fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: targetProject.id }),
      })

      if (!res.ok) {
        setPageActionError(await getApiErrorMessage(res, 'The admin panel could not be opened.'))
        return
      }

      setCurrentProject(targetProject)
      setActiveProjectId(targetProject.id)
      router.push('/admin/panel')
      router.refresh()
    } catch {
      setPageActionError('The server could not be reached while opening the admin panel.')
    }
  }

  useEffect(() => {
    const init = async () => {
      setIsLoading(true)
      setLoadError(null)
      try {
        const [meRes, projectRes, clearActiveRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/projects'),
          fetch('/api/projects/active', { method: 'DELETE' }),
        ])

        if (meRes.status === 401 || meRes.status === 403) {
          router.replace('/login')
          return
        }

        if (!meRes.ok) {
          throw new Error(await getApiErrorMessage(meRes, 'Your account could not be loaded'))
        }

        const me = await meRes.json()
        setCurrentUser(me)
        resetProjectContext()

        if (!clearActiveRes.ok) {
          console.error('Failed to clear active project context')
        }

        if (!projectRes.ok) {
          throw new Error(await getApiErrorMessage(projectRes, 'Projects could not be loaded'))
        }

        const data = await projectRes.json()
        if (!Array.isArray(data)) {
          throw new Error('Projects returned malformed data')
        }
        setLocalProjects(data)
        setProjects(data)
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Projects could not be loaded')
      } finally {
        setIsLoading(false)
      }
    }

    void init()
  }, [reloadKey, resetProjectContext, router, setCurrentUser, setProjects])

  const handleSelectProject = async (project: Project) => {
    setPageActionError(null)
    try {
      const res = await fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      })

      if (!res.ok) {
        setPageActionError(await getApiErrorMessage(res, `${project.name} could not be opened.`))
        return
      }

      setCurrentProject(project)
      setActiveProjectId(project.id)
      router.push(canonicalWorkspaceRoute(project.id, 'dashboard'))
    } catch {
      setPageActionError(`The server could not be reached while opening ${project.name}.`)
    }
  }

  const handleCreateProject = async () => {
    const errors: ProjectFormErrors = {}
    if (!createForm.name.trim()) errors.name = 'Enter a project name.'
    if (!/^[A-Z]{2,10}$/.test(createForm.key)) {
      errors.key = 'Use 2–10 uppercase letters.'
    }
    if (errors.name || errors.key) {
      setCreateErrors(errors)
      return
    }

    setCreateErrors({})
    setIsCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          name: createForm.name.trim(),
          key: createForm.key.trim(),
          description: createForm.description.trim(),
        }),
      })

      if (!res.ok) {
        setCreateErrors({
          submit: await getApiErrorMessage(res, 'Project could not be created. Try again.'),
        })
        return
      }

      const project = await res.json()
      const nextProjects = [project, ...projects]
      setLocalProjects(nextProjects)
      setProjects(nextProjects)
      setShowCreate(false)
      setCreateForm({ name: '', key: '', description: '', color: '#6366f1' })
      setCreateErrors({})
      toast.success('Project created successfully')
      await handleSelectProject(project)
    } catch {
      setCreateErrors({ submit: 'The server could not be reached. Check your connection and try again.' })
    } finally {
      setIsCreating(false)
    }
  }

  const openEditProject = (project: Project) => {
    setEditErrors({})
    setEditProjectId(project.id)
    setEditForm({
      name: project.name,
      description: project.description || '',
      color: project.color,
    })
    setShowEditProject(true)
  }

  const handleUpdateProject = async () => {
    if (!editProjectId) {
      return
    }

    if (!editForm.name.trim()) {
      setEditErrors({ name: 'Enter a project name.' })
      return
    }

    setEditErrors({})
    setIsUpdatingProject(true)
    try {
      const response = await fetch(`/api/projects/${editProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          color: editForm.color,
        }),
      })

      if (!response.ok) {
        setEditErrors({
          submit: await getApiErrorMessage(response, 'Project changes could not be saved. Try again.'),
        })
        return
      }

      const updatedProject = await response.json()
      const nextProjects = projects.map((project) =>
        project.id === editProjectId ? { ...project, ...updatedProject } : project
      )

      setLocalProjects(nextProjects)
      setProjects(nextProjects)
      setShowEditProject(false)
      setEditProjectId(null)
      setEditErrors({})
      toast.success('Project updated successfully')
    } catch {
      setEditErrors({ submit: 'The server could not be reached. Your changes are still here.' })
    } finally {
      setIsUpdatingProject(false)
    }
  }

  const handleDeleteProject = async (targetProject: Project) => {
    setIsDeletingProject(true)
    try {
      const response = await fetch(`/api/projects/${targetProject.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        return getApiErrorMessage(response, 'Project could not be deleted. Try again.')
      }

      const nextProjects = projects.filter((project) => project.id !== targetProject.id)
      setLocalProjects(nextProjects)
      setProjects(nextProjects)
      setShowEditProject(false)
      setEditProjectId(null)
      toast.success('Project deleted successfully')
      return true
    } catch {
      return 'The server could not be reached. Check your connection and try again.'
    } finally {
      setIsDeletingProject(false)
    }
  }

  const handleCreateUser = async () => {
    const errors: UserFormErrors = {}
    if (!createUserForm.name.trim()) errors.name = 'Enter the user’s full name.'
    if (!createUserForm.email.trim()) {
      errors.email = 'Enter an email address.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createUserForm.email.trim())) {
      errors.email = 'Enter a valid email address.'
    }
    if (createUserForm.password.length < 8) {
      errors.password = 'Use at least 8 characters.'
    }

    if (errors.name || errors.email || errors.password) {
      setCreateUserErrors(errors)
      return
    }

    const availableProjects = projects.filter((project) => !project.isArchived)
    const targetProjectId = createUserForm.projectId || availableProjects[0]?.id || ''

    if (createUserForm.assignToProject && !targetProjectId) {
      setCreateUserErrors({ project: 'Create a project before assigning this user.' })
      return
    }

    setCreateUserErrors({})
    setIsCreatingUser(true)
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createUserForm.name.trim(),
          email: createUserForm.email.trim().toLowerCase(),
          password: createUserForm.password,
          addToProject: createUserForm.assignToProject,
          projectId: createUserForm.assignToProject ? targetProjectId : undefined,
          projectRole: createUserForm.assignToProject ? createUserForm.projectRole : undefined,
        }),
      })

      if (!response.ok) {
        setCreateUserErrors({
          submit: await getApiErrorMessage(response, 'User could not be created. Try again.'),
        })
        return
      }

      const payload = await response.json().catch(() => ({}))

      setShowCreateUser(false)
      setCreateUserForm({
        name: '',
        email: '',
        password: '',
        assignToProject: false,
        projectId: '',
        projectRole: 'Dev',
      })
      setCreateUserErrors({})
      const baseMessage = createUserForm.assignToProject
        ? 'User created, assigned to project, and must reset password on first login.'
        : 'User created and must reset password on first login.'

      if (payload?.emailDelivery?.status === 'queued') {
        toast.success(`${baseMessage} Onboarding email queued.`)
      } else if (payload?.emailDelivery?.status === 'failed') {
        toast.warning(`${baseMessage} ${payload.emailDelivery.message}`)
      } else if (payload?.emailDelivery?.status === 'skipped') {
        toast.warning(`${baseMessage} ${payload.emailDelivery.message}`)
      } else {
        toast.success(baseMessage)
      }
    } catch {
      setCreateUserErrors({ submit: 'The server could not be reached. The entered details are still here.' })
    } finally {
      setIsCreatingUser(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    resetProjectContext()
    router.replace('/login')
  }

  const filteredProjects = projects.filter(
    (project) =>
      !project.isArchived &&
      (project.name.toLowerCase().includes(search.toLowerCase()) ||
        project.key.toLowerCase().includes(search.toLowerCase()))
  )

  if (isLoading) {
    return <ProjectDirectorySkeleton />
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="h-12 shrink-0 border-b border-border" />
        <main id="main-content" className="flex flex-1 items-center justify-center px-4">
          <ErrorState
            title="Projects did not load"
            description="Your session is still available. Retry the project list request."
            detail={loadError}
            headingLevel={1}
            onRetry={() => setReloadKey((value) => value + 1)}
            retryLabel="Retry projects"
          />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/*
        The same 48px chrome as the workspace shell. The hub used to have its
        own 64px bar with its own brand lockup, so signing in and picking a
        project felt like crossing between two different products.
      */}
      <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <RabbitFlowMark className="size-6 shrink-0 object-contain" />
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">RabbitFlow</span>
        </div>

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
                  {(currentUser?.name || 'U')
                    .split(' ')
                    .map((segment) => segment[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
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
              <p className="truncate text-xs text-muted-foreground">{currentUser?.email}</p>
            </div>
            {canCreateProject ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Organization</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void openAdminPanel()}>
                  <Settings />
                  Admin panel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/admin/security')}>
                  <Shield />
                  Security
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowCreateUser(true)}
                  data-testid="dashboard-new-user-button"
                >
                  <UserPlus />
                  New user
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleLogout}
              data-testid="dashboard-logout-button"
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/*
        Left-aligned, not a centred hero. This is a workspace switcher, and a
        marketing-page headline over a search box told the user nothing they
        could act on. The four equal-weight buttons that sat beside the search
        — three of them administrative — have moved into the account menu,
        leaving one primary action on the page.
      */}
      <PageHeader
        title="Projects"
        description="Open a project to work in it. Each project has its own board, backlog, sprints and members."
        meta={
          projects.length > 0 ? (
            <Badge variant="count">{projects.length}</Badge>
          ) : null
        }
        actions={
          canCreateProject ? (
            <Button
              size="sm"
              onClick={() => setShowCreate(true)}
              data-testid="dashboard-new-project-button"
            >
              <Plus />
              New project
            </Button>
          ) : null
        }
      />

      <main className="w-full flex-1 px-4 py-4 sm:px-6 sm:py-5">
        {pageActionError ? (
          <div className="mb-4" data-testid="dashboard-page-action-error">
            <InlineAlert
              tone="danger"
              title="The action did not complete."
              action={
                <Button variant="ghost" size="xs" onClick={() => setPageActionError(null)}>
                  Dismiss
                </Button>
              }
            >
              {pageActionError}
            </InlineAlert>
          </div>
        ) : null}
        {/*
          Search is worth its row only once a list stops being scannable. Below
          that it stays mounted but visually hidden, so keyboard and assistive
          users — and the e2e suite — can still reach it.
        */}
        <div className={projects.length > 3 ? 'mb-4 max-w-sm' : 'sr-only'}>
          <Input
            placeholder="Search projects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8"
            aria-label="Search projects"
            icon={<Search />}
            data-testid="dashboard-project-search-input"
          />
        </div>

        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              /*
                A card the size of the information in it. The previous one was
                356x260 for a name, a description and two counts, and it opened
                with the avatar and an overflow menu rather than the project's
                own name — the least important thing in the strongest position.
              */
              <div
                key={project.id}
                className="group relative flex flex-col rounded-lg border border-border bg-card transition-colors hover:border-border-strong hover:bg-surface-hover"
                data-testid={`dashboard-project-card-${project.id}`}
              >
                <div className="flex items-start gap-2.5 p-3.5 pb-2">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                    style={{ backgroundColor: project.color }}
                  >
                    {project.key.slice(0, 2)}
                  </span>

                  <div className="min-w-0 flex-1">
                    {/*
                      The whole card is the target, via a stretched link on the
                      title: the name is what a screen reader announces, and a
                      pointer can still click anywhere.
                    */}
                    <h3 className="type-heading truncate text-foreground">
                      <button
                        type="button"
                        onClick={() => handleSelectProject(project)}
                        className="after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring"
                      >
                        {project.name}
                      </button>
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {project.description || 'No description'}
                    </p>
                  </div>

                  {canManageProject(project) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="relative z-10 -mr-1 -mt-1 shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={`Actions for ${project.name}`}
                          data-testid={`dashboard-project-actions-${project.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditProject(project)
                          }}
                          data-testid={`dashboard-project-edit-${project.id}`}
                        >
                          <Pencil />
                          Edit project
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(event) => {
                            event.stopPropagation()
                            projectDeletion.request(project)
                          }}
                          data-testid={`dashboard-project-delete-${project.id}`}
                        >
                          <Trash2 />
                          Delete project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                <div className="mt-auto flex items-center gap-2.5 border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
                  <span className="font-mono text-foreground">{project.key}</span>
                  <span className="flex items-center gap-1">
                    <FileText className="size-3" aria-hidden="true" />
                    <span className="tabular-nums">{project._count?.issues ?? 0}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" aria-hidden="true" />
                    <span className="tabular-nums">{project._count?.members ?? 0}</span>
                  </span>
                  {project.currentUserRole ? (
                    <span className="ml-auto rounded-sm bg-surface-sunken px-1.5 py-px font-medium">
                      {project.currentUserRole}
                    </span>
                  ) : null}
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            size="lg"
            icon={FolderKanban}
            title={search ? `No projects match "${search}"` : 'No projects yet'}
            description={
              search
                ? 'Check the spelling, or search by project key instead of name.'
                : canCreateProject
                  ? 'A project is the container for work items, sprints, teams and reports. Create one to get started.'
                  : 'You are not a member of any project yet. Ask an administrator to add you to one.'
            }
            action={
              search ? (
                <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : canCreateProject ? (
                <Button
                  size="sm"
                  onClick={() => setShowCreate(true)}
                  data-testid="dashboard-empty-create-project-button"
                >
                  <Plus />
                  Create your first project
                </Button>
              ) : undefined
            }
          />
        )}
      </main>

      <Dialog
        open={canCreateProject && showCreate}
        onOpenChange={(open) => {
          setShowCreate(open)
          if (!open && !isCreating) setCreateErrors({})
        }}
      >
        <DialogContent className="max-w-md">
          <div data-testid="dashboard-create-project-dialog" />
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {createErrors.submit ? (
              <div data-testid="dashboard-create-project-error">
                <InlineAlert tone="danger" title="Project was not created.">
                  {createErrors.submit}
                </InlineAlert>
              </div>
            ) : null}
            <div>
              <Label htmlFor="create-project-name">Project Name</Label>
              <Input
                id="create-project-name"
                value={createForm.name}
                onChange={(event) => {
                  setCreateForm((state) => ({ ...state, name: event.target.value }))
                  setCreateErrors((state) => ({ ...state, name: undefined, submit: undefined }))
                }}
                placeholder="My Awesome Project"
                className="mt-1.5"
                aria-invalid={Boolean(createErrors.name)}
                aria-describedby={createErrors.name ? 'create-project-name-error' : undefined}
                data-testid="dashboard-create-project-name-input"
              />
              {createErrors.name ? (
                <p id="create-project-name-error" className="mt-1 text-xs text-danger">
                  {createErrors.name}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="create-project-key">Project Key</Label>
              <Input
                id="create-project-key"
                value={createForm.key}
                onChange={(event) => {
                  setCreateForm((state) => ({
                    ...state,
                    key: event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, '')
                      .slice(0, 10),
                  }))
                  setCreateErrors((state) => ({ ...state, key: undefined, submit: undefined }))
                }}
                placeholder="MAP"
                maxLength={10}
                className="mt-1.5 font-mono uppercase"
                aria-invalid={Boolean(createErrors.key)}
                aria-describedby={
                  createErrors.key
                    ? 'create-project-key-help create-project-key-error'
                    : 'create-project-key-help'
                }
                data-testid="dashboard-create-project-key-input"
              />
              <p id="create-project-key-help" className="mt-1 text-xs text-muted-foreground">
                2-10 uppercase letters, used in work item keys like `MAP-123`.
              </p>
              {createErrors.key ? (
                <p id="create-project-key-error" className="mt-1 text-xs text-danger">
                  {createErrors.key}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={createForm.description}
                onChange={(event) => {
                  setCreateForm((state) => ({ ...state, description: event.target.value }))
                  setCreateErrors((state) => ({ ...state, submit: undefined }))
                }}
                placeholder="Brief project description..."
                rows={3}
                className="mt-1.5"
                data-testid="dashboard-create-project-description-input"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-7 w-7 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      createForm.color === color
                        ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setCreateForm((state) => ({ ...state, color }))
                      setCreateErrors((state) => ({ ...state, submit: undefined }))
                    }}
                    aria-label={`Use ${color} for this project`}
                    data-testid={`dashboard-create-project-color-${color.replace('#', '')}`}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleCreateProject}
              disabled={isCreating}
              data-testid="dashboard-create-project-submit-button"
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditProject}
        onOpenChange={(open) => {
          setShowEditProject(open)
          if (!open && !isUpdatingProject && !isDeletingProject) {
            setEditProjectId(null)
            setEditErrors({})
          }
        }}
      >
        <DialogContent className="max-w-md">
          <div data-testid="dashboard-edit-project-dialog" />
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {editErrors.submit ? (
              <div data-testid="dashboard-edit-project-error">
                <InlineAlert tone="danger" title="Changes were not saved.">
                  {editErrors.submit}
                </InlineAlert>
              </div>
            ) : null}
            <div>
              <Label htmlFor="edit-project-name">Project Name</Label>
              <Input
                id="edit-project-name"
                value={editForm.name}
                onChange={(event) => {
                  setEditForm((state) => ({ ...state, name: event.target.value }))
                  setEditErrors((state) => ({ ...state, name: undefined, submit: undefined }))
                }}
                placeholder="Project name"
                className="mt-1.5"
                aria-invalid={Boolean(editErrors.name)}
                aria-describedby={editErrors.name ? 'edit-project-name-error' : undefined}
                data-testid="dashboard-edit-project-name-input"
              />
              {editErrors.name ? (
                <p id="edit-project-name-error" className="mt-1 text-xs text-danger">
                  {editErrors.name}
                </p>
              ) : null}
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(event) => {
                  setEditForm((state) => ({ ...state, description: event.target.value }))
                  setEditErrors((state) => ({ ...state, submit: undefined }))
                }}
                placeholder="Brief project description..."
                rows={3}
                className="mt-1.5"
                data-testid="dashboard-edit-project-description-input"
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROJECT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-7 w-7 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      editForm.color === color
                        ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setEditForm((state) => ({ ...state, color }))
                      setEditErrors((state) => ({ ...state, submit: undefined }))
                    }}
                    aria-label={`Use ${color} for this project`}
                    data-testid={`dashboard-edit-project-color-${color.replace('#', '')}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  const project = projects.find((candidate) => candidate.id === editProjectId)
                  if (project) projectDeletion.request(project)
                }}
                disabled={isUpdatingProject || isDeletingProject}
                data-testid="dashboard-delete-project-button"
              >
                {isDeletingProject ? 'Deleting...' : 'Delete Project'}
              </Button>
              <Button
                className="flex-1"
                onClick={handleUpdateProject}
                disabled={isUpdatingProject || isDeletingProject}
                data-testid="dashboard-edit-project-submit-button"
              >
                {isUpdatingProject ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canCreateProject && showCreateUser}
        onOpenChange={(open) => {
          setShowCreateUser(open)
          if (!open && !isCreatingUser) {
            setCreateUserForm({
              name: '',
              email: '',
              password: '',
              assignToProject: false,
              projectId: '',
              projectRole: 'Dev',
            })
            setCreateUserErrors({})
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {createUserErrors.submit ? (
              <div data-testid="dashboard-create-user-error">
                <InlineAlert tone="danger" title="User was not created.">
                  {createUserErrors.submit}
                </InlineAlert>
              </div>
            ) : null}
            <div>
              <Label htmlFor="create-user-name">Full Name</Label>
              <Input
                id="create-user-name"
                value={createUserForm.name}
                onChange={(event) => {
                  setCreateUserForm((state) => ({ ...state, name: event.target.value }))
                  setCreateUserErrors((state) => ({ ...state, name: undefined, submit: undefined }))
                }}
                placeholder="Jane Doe"
                className="mt-1.5"
                aria-invalid={Boolean(createUserErrors.name)}
                aria-describedby={createUserErrors.name ? 'create-user-name-error' : undefined}
                data-testid="dashboard-create-user-name-input"
              />
              {createUserErrors.name ? (
                <p id="create-user-name-error" className="mt-1 text-xs text-danger">
                  {createUserErrors.name}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="create-user-email">Email</Label>
              <Input
                id="create-user-email"
                type="email"
                value={createUserForm.email}
                onChange={(event) => {
                  setCreateUserForm((state) => ({ ...state, email: event.target.value }))
                  setCreateUserErrors((state) => ({ ...state, email: undefined, submit: undefined }))
                }}
                placeholder="jane@example.com"
                className="mt-1.5"
                aria-invalid={Boolean(createUserErrors.email)}
                aria-describedby={createUserErrors.email ? 'create-user-email-error' : undefined}
                data-testid="dashboard-create-user-email-input"
              />
              {createUserErrors.email ? (
                <p id="create-user-email-error" className="mt-1 text-xs text-danger">
                  {createUserErrors.email}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="create-user-password">Temporary Password</Label>
              <Input
                id="create-user-password"
                type="password"
                value={createUserForm.password}
                onChange={(event) => {
                  setCreateUserForm((state) => ({ ...state, password: event.target.value }))
                  setCreateUserErrors((state) => ({ ...state, password: undefined, submit: undefined }))
                }}
                placeholder="Minimum 8 characters"
                className="mt-1.5"
                aria-invalid={Boolean(createUserErrors.password)}
                aria-describedby={
                  createUserErrors.password
                    ? 'create-user-password-help create-user-password-error'
                    : 'create-user-password-help'
                }
                data-testid="dashboard-create-user-password-input"
              />
              <p id="create-user-password-help" className="mt-1 text-xs text-muted-foreground">
                The user will be forced to reset password on first login.
              </p>
              {createUserErrors.password ? (
                <p id="create-user-password-error" className="mt-1 text-xs text-danger">
                  {createUserErrors.password}
                </p>
              ) : null}
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs">
              <input
                type="checkbox"
                checked={createUserForm.assignToProject}
                onChange={(event) => {
                  setCreateUserForm((state) => ({
                    ...state,
                    assignToProject: event.target.checked,
                  }))
                  setCreateUserErrors((state) => ({ ...state, project: undefined, submit: undefined }))
                }}
              />
              Assign user to a project now
            </label>
            {createUserForm.assignToProject && (
              <>
                <div>
                  <Label>Project</Label>
                  <Select
                    value={
                      createUserForm.projectId ||
                      projects.find((project) => !project.isArchived)?.id ||
                      ''
                    }
                    onValueChange={(value) => {
                      setCreateUserForm((state) => ({ ...state, projectId: value }))
                      setCreateUserErrors((state) => ({ ...state, project: undefined, submit: undefined }))
                    }}
                  >
                    <SelectTrigger
                      className="mt-1.5"
                      aria-invalid={Boolean(createUserErrors.project)}
                      aria-describedby={createUserErrors.project ? 'create-user-project-error' : undefined}
                    >
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects
                        .filter((project) => !project.isArchived)
                        .map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name} ({project.key})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {createUserErrors.project ? (
                    <p id="create-user-project-error" className="mt-1 text-xs text-danger">
                      {createUserErrors.project}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label>Project Role</Label>
                  <Select
                    value={createUserForm.projectRole}
                    onValueChange={(value) => {
                      setCreateUserForm((state) => ({
                        ...state,
                        projectRole: value as (typeof PROJECT_ROLE_OPTIONS)[number],
                      }))
                      setCreateUserErrors((state) => ({ ...state, submit: undefined }))
                    }}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <Button
              className="w-full"
              onClick={handleCreateUser}
              disabled={isCreatingUser}
              data-testid="dashboard-create-user-submit-button"
            >
              {isCreatingUser
                ? 'Creating...'
                : createUserForm.assignToProject
                  ? 'Create User & Assign'
                  : 'Create User'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={projectDeletion.isOpen}
        onOpenChange={projectDeletion.onOpenChange}
        title={`Delete ${projectDeletion.target?.name ?? 'this project'}?`}
        description="All work items, sprints, teams, documents, reports, automation rules, and project history will be permanently removed. This cannot be undone."
        confirmLabel="Delete project"
        onConfirm={() =>
          projectDeletion.target ? handleDeleteProject(projectDeletion.target) : false
        }
      />
    </div>
  )
}
