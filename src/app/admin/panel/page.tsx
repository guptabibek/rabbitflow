'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'
import { AdminConfigPanel } from '@/components/project-management'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore, type Project } from '@/store/app-store'

export default function AdminPanelPage() {
  const router = useRouter()
  const projects = useAppStore((state) => state.projects)
  const currentProject = useAppStore((state) => state.currentProject)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const setCurrentProject = useAppStore((state) => state.setCurrentProject)
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId)
  const setProjects = useAppStore((state) => state.setProjects)
  const setUsers = useAppStore((state) => state.setUsers)
  const setIssues = useAppStore((state) => state.setIssues)
  const setLabels = useAppStore((state) => state.setLabels)
  const setIterations = useAppStore((state) => state.setIterations)
  const setStates = useAppStore((state) => state.setStates)
  const setAreas = useAppStore((state) => state.setAreas)
  const setTeams = useAppStore((state) => state.setTeams)
  const setWorkItemTypes = useAppStore((state) => state.setWorkItemTypes)
  const setProjectAccess = useAppStore((state) => state.setProjectAccess)
  const setCurrentUser = useAppStore((state) => state.setCurrentUser)

  const [isLoading, setIsLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const initializedRef = useRef(false)
  const latestProjectDataRequest = useRef(0)

  const availableProjects = useMemo(
    () => projects.filter((project) => !project.isArchived),
    [projects]
  )

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
      const requestId = latestProjectDataRequest.current + 1
      latestProjectDataRequest.current = requestId
      const bootstrapRes = await fetch(`/api/projects/bootstrap?projectId=${projectId}&pageSize=200`)

      if (bootstrapRes.ok) {
        const payload = await bootstrapRes.json()
        if (latestProjectDataRequest.current !== requestId) {
          return
        }
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
        return
      }

      if (latestProjectDataRequest.current !== requestId) {
        return
      }

      await fetchProjectDataLegacy(projectId)
    },
    [
      fetchProjectDataLegacy,
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

  const activateProject = useCallback(
    async (projectId: string) => {
      const response = await fetch('/api/projects/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      if (!response.ok) {
        throw new Error('Failed to switch project')
      }

      const nextProject =
        projects.find((project) => project.id === projectId) ?? currentProject ?? null

      if (nextProject) {
        setCurrentProject(nextProject)
        setActiveProjectId(nextProject.id)
      }
    },
    [currentProject, projects, setActiveProjectId, setCurrentProject]
  )

  useEffect(() => {
    if (initializedRef.current) {
      return
    }

    initializedRef.current = true
    let isCancelled = false

    const initialize = async () => {
      try {
        const [meRes, projectsRes] = await Promise.all([fetch('/api/auth/me'), fetch('/api/projects')])

        if (isCancelled) {
          return
        }

        if (!meRes.ok) {
          router.replace('/login')
          return
        }

        const me = await meRes.json()
        if (isCancelled) {
          return
        }
        setCurrentUser(me)

        if (me?.globalRole !== 'admin') {
          setAccessDenied(true)
          return
        }

        if (!projectsRes.ok) {
          return
        }

        const nextProjects: Project[] = await projectsRes.json()
        if (isCancelled) {
          return
        }
        setProjects(nextProjects)

        const activeRes = await fetch('/api/projects/active')
        const activePayload = activeRes.ok ? await activeRes.json() : { project: null }
        if (isCancelled) {
          return
        }
        const nextProject =
          nextProjects.find(
            (project) =>
              !project.isArchived &&
              (project.id === activePayload.project?.id || project.id === activeProjectId)
          ) ?? nextProjects.find((project) => !project.isArchived) ?? null

        if (!nextProject) {
          return
        }

        setCurrentProject(nextProject)
        setActiveProjectId(nextProject.id)

        if (nextProject.id !== activePayload.project?.id) {
          const response = await fetch('/api/projects/active', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: nextProject.id }),
          })

          if (!response.ok) {
            throw new Error('Failed to switch project')
          }
        }
      } catch (error) {
        console.error('Failed to initialize admin panel:', error)
        if (!isCancelled) {
          router.replace('/login')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void initialize()

    return () => {
      isCancelled = true
    }
  }, [activeProjectId, router, setActiveProjectId, setCurrentProject, setCurrentUser, setProjects])

  useEffect(() => {
    if (!currentProject?.id) return

    void fetchProjectData(currentProject.id)
  }, [currentProject?.id, fetchProjectData])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
        <Skeleton className="h-[640px] rounded-3xl" />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <Card className="rounded-3xl border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>
            This section is restricted to organization administrators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push('/dashboard')}>Return to dashboard</Button>
        </CardContent>
      </Card>
    )
  }

  if (availableProjects.length === 0) {
    return (
      <Card className="rounded-3xl border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>No active projects available</CardTitle>
          <CardDescription>
            Create or restore a project before opening configuration settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push('/dashboard')}>Go to main dashboard</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card/90 shadow-sm">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-2xl tracking-tight">Admin Panel</CardTitle>
                <CardDescription>
                  Configure work item types, state models, and planning fields without the project sidebar.
                </CardDescription>
              </div>
            </div>
            {currentProject ? (
              <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-xs">
                Active project: {currentProject.name}
              </Badge>
            ) : null}
          </div>

          <div className="w-full max-w-sm">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Configuration context
            </div>
            <Select
              value={currentProject?.id ?? ''}
              onValueChange={(projectId) => {
                void activateProject(projectId)
              }}
            >
              <SelectTrigger className="h-11 rounded-2xl">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {!currentProject ? (
        <Card className="rounded-3xl border-dashed border-border/70 bg-card/70 shadow-sm">
          <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <div>
              <p className="font-medium">Preparing the selected project</p>
              <p className="text-sm text-muted-foreground">
                Configuration options will appear once project data is loaded.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <AdminConfigPanel />
      )}
    </div>
  )
}