'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdminConfigPanel } from '@/components/project-management'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { PageBody, PageHeader } from '@/components/ui/page-header'
import { useAppStore, type Project } from '@/store/app-store'

export default function AdminPanelPage() {
  const router = useRouter()
  const projects = useAppStore((state) => state.projects)
  const currentProject = useAppStore((state) => state.currentProject)
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
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null)
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

      // Guarded: a non-array here poisons every `issues.filter(...)` downstream
      // and takes the view down with it.
      if (issuesRes.ok) {
        const payload: unknown = await issuesRes.json()
        setIssues(Array.isArray(payload) ? payload : [])
      }
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
      if (projectId === currentProject?.id) return

      setSwitchingProjectId(projectId)
      try {
        const response = await fetch('/api/projects/active', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error || 'Failed to switch project')
        }

        const nextProject = projects.find((project) => project.id === projectId) ?? null

        if (!nextProject) {
          throw new Error('The selected project is no longer available')
        }

        setCurrentProject(nextProject)
        setActiveProjectId(nextProject.id)
        toast.success(`Configuration context changed to ${nextProject.name}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to switch project')
      } finally {
        setSwitchingProjectId(null)
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
              project.id === activePayload.project?.id
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
  }, [router, setActiveProjectId, setCurrentProject, setCurrentUser, setProjects])

  useEffect(() => {
    if (!currentProject?.id) return

    void fetchProjectData(currentProject.id)
  }, [currentProject?.id, fetchProjectData])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-2 h-4 w-[min(28rem,80%)]" />
        </div>
        <div className="px-4 py-4 sm:px-6">
          <Skeleton className="h-[680px] rounded-lg" />
        </div>
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
          <Button onClick={() => router.push('/dashboard')}>Return to Projects</Button>
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
          <Button onClick={() => router.push('/dashboard')}>Go to Projects</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        title="Project configuration"
        description="Define the work model, workflow rules, field schema, areas, and planning behavior for a project."
        meta={
          currentProject ? (
            <Badge variant="outline" className="gap-1.5">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              {currentProject.name}
            </Badge>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="hidden text-xs text-muted-foreground sm:inline">Project</span>
            <Select
              value={currentProject?.id ?? ''}
              onValueChange={(projectId) => void activateProject(projectId)}
              disabled={switchingProjectId !== null}
            >
              <SelectTrigger className="w-[min(17rem,55vw)]" aria-label="Configuration project">
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
            {switchingProjectId ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Switching project" />
            ) : null}
          </div>
        }
      />

      {!currentProject ? (
        <PageBody className="flex items-center justify-center">
          <Card className="w-full max-w-lg border-dashed">
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Preparing project configuration</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Workflows and schema will appear as soon as the project data is ready.
                </p>
              </div>
            </CardContent>
          </Card>
        </PageBody>
      ) : (
        <AdminConfigPanel />
      )}
    </div>
  )
}
