'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore, type Project } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  Plus,
  Search,
  Settings,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { PROJECT_COLORS } from '@/lib/ui-tokens'

const PROJECT_ROLE_OPTIONS = ['Admin', 'PM', 'Dev', 'QA', 'Viewer'] as const

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
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    key: '',
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
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const canCreateProject = currentUser?.globalRole === 'admin'

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-5xl px-6">
          <Skeleton className="h-10 w-64 mx-auto mb-2" />
          <Skeleton className="h-5 w-96 mx-auto mb-10" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <Skeleton key={index} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FolderKanban className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">RabbitFlow</h1>
              <p className="text-xs text-muted-foreground">Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
              <Avatar className="h-6 w-6">
                <AvatarImage src={currentUser?.avatar || undefined} />
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {(currentUser?.name || 'U')
                    .split(' ')
                    .map((segment) => segment[0])
                    .join('')
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{currentUser?.name || 'User'}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground"
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 text-center">
          <h2 className="mb-2 text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-lg text-muted-foreground">
            Select a project workspace or create a new one.
          </p>
        </div>

        <div className="mx-auto mb-8 flex max-w-2xl items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 pl-10"
            />
          </div>
          {canCreateProject ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => router.push('/admin/security')}
                className="h-11 gap-2 px-5"
              >
                <Shield className="h-4 w-4" />
                Admin Security
              </Button>
              <Button
                variant="outline"
                onClick={() => void openAdminPanel()}
                className="h-11 gap-2 px-5"
              >
                <Settings className="h-4 w-4" />
                Admin Panel
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateUser(true)}
                className="h-11 gap-2 px-5"
              >
                <UserPlus className="h-4 w-4" />
                New User
              </Button>
              <Button onClick={() => setShowCreate(true)} className="h-11 gap-2 px-5">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </div>
          ) : null}
        </div>

        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="group cursor-pointer border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => handleSelectProject(project)}
              >
                <CardContent className="p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ backgroundColor: project.color }}
                    >
                      {project.key.slice(0, 2)}
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground/0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="mb-1 text-base font-semibold transition-colors group-hover:text-primary">
                        {project.name}
                      </h3>
                      <p className="min-h-[40px] text-sm text-muted-foreground line-clamp-2">
                        {project.description || 'No description'}
                      </p>
                    </div>
                    {project.currentUserRole && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {project.currentUserRole}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {project._count?.issues ?? 0} items
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {project._count?.members ?? 0} members
                    </span>
                    <Badge variant="outline" className="h-5 text-[10px] font-mono">
                      {project.key}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted/50">
              <FolderKanban className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">
              {search ? 'No projects found' : 'No projects yet'}
            </h3>
            <p className="mx-auto mb-6 max-w-sm text-muted-foreground">
              {search
                ? 'Try a different search term.'
                : 'Create your first project to start tracking work items, sprints, and team delivery.'}
            </p>
            {!search && canCreateProject && (
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Project
              </Button>
            )}
          </div>
        )}
      </main>

      <Dialog open={canCreateProject && showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
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
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleCreateProject}
              disabled={isCreating || !createForm.name.trim() || createForm.key.length < 2}
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
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
