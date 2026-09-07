'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, type Project } from '@/store/app-store'
import { Button } from '@/components/ui/button'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import { EmptyState } from '@/components/ui/states'
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

const PROJECT_ROLE_OPTIONS = ['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'] as const

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
  const [isUpdatingProject, setIsUpdatingProject] = useState(false)
  const [isDeletingProject, setIsDeletingProject] = useState(false)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const canCreateProject = currentUser?.globalRole === 'admin'

  const canManageProject = (project: Project) =>
    currentUser?.globalRole === 'admin' || project.currentUserRole === 'Admin'

  const openAdminPanel = async () => {
    const targetProject = projects.find((project) => !project.isArchived) ?? null
    if (!targetProject) {
      toast.error('Create a project before opening the admin panel')
      return
    }

    try {
      const res = await fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: targetProject.id }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to open admin panel')
        return
      }

      setCurrentProject(targetProject)
      setActiveProjectId(targetProject.id)
      router.push('/admin/panel')
      router.refresh()
    } catch {
      toast.error('Failed to open admin panel')
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const [meRes, projectRes, clearActiveRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/projects'),
          fetch('/api/projects/active', { method: 'DELETE' }),
        ])

        if (!meRes.ok) {
          router.replace('/login')
          return
        }

        const me = await meRes.json()
        setCurrentUser(me)
        resetProjectContext()

        if (!clearActiveRes.ok) {
          console.error('Failed to clear active project context')
        }

        if (projectRes.ok) {
          const data = await projectRes.json()
          setLocalProjects(data)
          setProjects(data)
        }
      } catch {
        router.replace('/login')
      } finally {
        setIsLoading(false)
      }
    }

    void init()
  }, [resetProjectContext, router, setCurrentUser, setProjects])

  const handleSelectProject = async (project: Project) => {
    try {
      const res = await fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to switch project')
        return
      }

      setCurrentProject(project)
      setActiveProjectId(project.id)
      router.push('/')
      router.refresh()
    } catch {
      toast.error('Failed to switch project')
    }
  }

  const handleCreateProject = async () => {
    if (!createForm.name.trim() || !createForm.key.trim()) {
      return
    }

    setIsCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to create project')
        return
      }

      const project = await res.json()
      const nextProjects = [project, ...projects]
      setLocalProjects(nextProjects)
      setProjects(nextProjects)
      setShowCreate(false)
      setCreateForm({ name: '', key: '', description: '', color: '#6366f1' })
      toast.success('Project created successfully')
      await handleSelectProject(project)
    } catch {
      toast.error('Network error')
    } finally {
      setIsCreating(false)
    }
  }

  const openEditProject = (project: Project) => {
    setEditProjectId(project.id)
    setEditForm({
      name: project.name,
      description: project.description || '',
      color: project.color,
    })
    setShowEditProject(true)
  }

  const handleUpdateProject = async () => {
    if (!editProjectId || !editForm.name.trim()) {
      return
    }

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
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to update project')
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
      toast.success('Project updated successfully')
    } catch {
      toast.error('Network error')
    } finally {
      setIsUpdatingProject(false)
    }
  }

  /*
    `projectId` lets the card menu delete without first opening the edit dialog.
    Called with no argument it falls back to the dialog's own target, which is
    how the Delete button inside the edit dialog still works.
  */
  const handleDeleteProject = async (projectId?: string) => {
    const targetId = projectId ?? editProjectId
    if (!targetId) {
      return
    }

    const targetProject = projects.find((project) => project.id === targetId)
    if (!targetProject || !confirm(`Delete project "${targetProject.name}"?`)) {
      return
    }

    setIsDeletingProject(true)
    try {
      const response = await fetch(`/api/projects/${targetId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete project')
        return
      }

      const nextProjects = projects.filter((project) => project.id !== targetId)
      setLocalProjects(nextProjects)
      setProjects(nextProjects)
      setShowEditProject(false)
      setEditProjectId(null)
      toast.success('Project deleted successfully')
    } catch {
      toast.error('Network error')
    } finally {
      setIsDeletingProject(false)
    }
  }

  const handleCreateUser = async () => {
    if (
      !createUserForm.name.trim() ||
      !createUserForm.email.trim() ||
      createUserForm.password.length < 8
    ) {
      return
    }

    const availableProjects = projects.filter((project) => !project.isArchived)
    const targetProjectId = createUserForm.projectId || availableProjects[0]?.id || ''

    if (createUserForm.assignToProject && !targetProjectId) {
      toast.error('No active project available for assignment')
      return
    }

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
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to create user')
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
      toast.error('Network error')
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
    return (
      <div className="min-h-dvh bg-background">
        <div className="h-12 border-b border-border" />
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3.5 w-72" />
          <Skeleton className="mt-5 h-8 w-full max-w-sm" />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <Skeleton key={index} className="h-[7.5rem] w-full" />
            ))}
          </div>
        </div>
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
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary">
            <FolderKanban className="size-3.5 text-primary-foreground" aria-hidden="true" />
          </div>
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
                            void handleDeleteProject(project.id)
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

      <Dialog open={canCreateProject && showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <div data-testid="dashboard-create-project-dialog" />
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Project Name</Label>
              <Input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((state) => ({ ...state, name: event.target.value }))
                }
                placeholder="My Awesome Project"
                className="mt-1.5"
                data-testid="dashboard-create-project-name-input"
              />
            </div>
            <div>
              <Label>Project Key</Label>
              <Input
                value={createForm.key}
                onChange={(event) =>
                  setCreateForm((state) => ({
                    ...state,
                    key: event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, '')
                      .slice(0, 10),
                  }))
                }
                placeholder="MAP"
                maxLength={10}
                className="mt-1.5 font-mono uppercase"
                data-testid="dashboard-create-project-key-input"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                2-10 uppercase letters, used in work item keys like `MAP-123`.
              </p>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((state) => ({ ...state, description: event.target.value }))
                }
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
                    onClick={() => setCreateForm((state) => ({ ...state, color }))}
                    data-testid={`dashboard-create-project-color-${color.replace('#', '')}`}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleCreateProject}
              disabled={isCreating || !createForm.name.trim() || createForm.key.length < 2}
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
          }
        }}
      >
        <DialogContent className="max-w-md">
          <div data-testid="dashboard-edit-project-dialog" />
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Project Name</Label>
              <Input
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((state) => ({ ...state, name: event.target.value }))
                }
                placeholder="Project name"
                className="mt-1.5"
                data-testid="dashboard-edit-project-name-input"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(event) =>
                  setEditForm((state) => ({ ...state, description: event.target.value }))
                }
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
                    onClick={() => setEditForm((state) => ({ ...state, color }))}
                    data-testid={`dashboard-edit-project-color-${color.replace('#', '')}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1"
                // Wrapped, not passed directly: `handleDeleteProject` takes an
                // optional id, and a bare reference would hand it the click
                // event as the project to delete.
                onClick={() => void handleDeleteProject()}
                disabled={isUpdatingProject || isDeletingProject}
                data-testid="dashboard-delete-project-button"
              >
                {isDeletingProject ? 'Deleting...' : 'Delete Project'}
              </Button>
              <Button
                className="flex-1"
                onClick={handleUpdateProject}
                disabled={isUpdatingProject || isDeletingProject || !editForm.name.trim()}
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
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Full Name</Label>
              <Input
                value={createUserForm.name}
                onChange={(event) =>
                  setCreateUserForm((state) => ({ ...state, name: event.target.value }))
                }
                placeholder="Jane Doe"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={createUserForm.email}
                onChange={(event) =>
                  setCreateUserForm((state) => ({ ...state, email: event.target.value }))
                }
                placeholder="jane@example.com"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Temporary Password</Label>
              <Input
                type="password"
                value={createUserForm.password}
                onChange={(event) =>
                  setCreateUserForm((state) => ({ ...state, password: event.target.value }))
                }
                placeholder="Minimum 8 characters"
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                The user will be forced to reset password on first login.
              </p>
            </div>
            <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs">
              <input
                type="checkbox"
                checked={createUserForm.assignToProject}
                onChange={(event) =>
                  setCreateUserForm((state) => ({
                    ...state,
                    assignToProject: event.target.checked,
                  }))
                }
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
                    onValueChange={(value) =>
                      setCreateUserForm((state) => ({ ...state, projectId: value }))
                    }
                  >
                    <SelectTrigger className="mt-1.5">
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
                </div>
                <div>
                  <Label>Project Role</Label>
                  <Select
                    value={createUserForm.projectRole}
                    onValueChange={(value) =>
                      setCreateUserForm((state) => ({
                        ...state,
                        projectRole: value as (typeof PROJECT_ROLE_OPTIONS)[number],
                      }))
                    }
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
              disabled={
                isCreatingUser ||
                !createUserForm.name.trim() ||
                !createUserForm.email.trim() ||
                createUserForm.password.length < 8 ||
                (createUserForm.assignToProject &&
                  projects.filter((project) => !project.isArchived).length === 0)
              }
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
    </div>
  )
}
