'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Blocks,
  Building2,
  FolderKanban,
  Loader2,
  Shield,
  Users,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Metric, MetricRow } from '@/components/ui/metric'
import { PageBody, PageHeader } from '@/components/ui/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'

type AdminOverviewStats = {
  projects: number
  users: number
}

type AdminOverviewCard = {
  label: string
  value: number | string
  icon: typeof FolderKanban
  helper: string
}

const ACTION_CARDS = [
  {
    title: 'Projects and users',
    description: 'Create projects, onboard users, and manage organization-wide membership from Projects.',
    href: '/dashboard',
    icon: Users,
  },
  {
    title: 'Project configuration',
    description: 'Manage work item types, state machines, and planning field configuration in a dedicated admin workspace.',
    href: '/admin/panel',
    icon: Building2,
  },
  {
    title: 'Security and access',
    description: 'Review active sessions, enforce MFA, offboard users, and inspect the security audit timeline.',
    href: '/admin/security',
    icon: Shield,
  },
]

export default function AdminIndexPage() {
  const router = useRouter()
  const { currentProject, setCurrentUser, setProjects } = useAppStore()
  const [isLoading, setIsLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [stats, setStats] = useState<AdminOverviewStats>({ projects: 0, users: 0 })

  const statCards = useMemo<AdminOverviewCard[]>(
    () => [
      {
        label: 'Accessible Projects',
        value: stats.projects,
        icon: FolderKanban,
        helper: 'Projects available to the current admin account.',
      },
      {
        label: 'Active Users',
        value: stats.users,
        icon: Users,
        helper: 'Current active organization users returned by the admin user listing.',
      },
      {
        label: 'Admin Surfaces',
        value: 3,
        icon: Blocks,
        helper: 'Overview, Configuration, and Security.',
      },
      {
        label: 'Workspace Context',
        value: currentProject ? currentProject.name : 'No active workspace',
        icon: Building2,
        helper: currentProject
          ? 'Return to this project when you switch back to delivery work.'
          : 'Select a project from Projects when you need workspace context.',
      },
    ],
    [currentProject, stats.projects, stats.users]
  )

  useEffect(() => {
    const initialize = async () => {
      try {
        const [meRes, projectsRes, usersRes] = await Promise.all([
          fetch('/api/auth/me', { cache: 'no-store' }),
          fetch('/api/projects', { cache: 'no-store' }),
          fetch('/api/users', { cache: 'no-store' }),
        ])

        if (!meRes.ok) {
          router.replace('/login')
          return
        }

        const me = await meRes.json()
        setCurrentUser(me)

        if (me?.globalRole !== 'admin') {
          setAccessDenied(true)
          return
        }

        const projectList = projectsRes.ok ? await projectsRes.json() : []
        const userList = usersRes.ok ? await usersRes.json() : []

        setProjects(Array.isArray(projectList) ? projectList : [])
        setStats({
          projects: Array.isArray(projectList) ? projectList.filter((project) => !project.isArchived).length : 0,
          users: Array.isArray(userList) ? userList.length : 0,
        })
      } catch (error) {
        console.error('Failed to initialize admin overview:', error)
        router.replace('/login')
      } finally {
        setIsLoading(false)
      }
    }

    void initialize()
  }, [router, setCurrentUser, setProjects])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.95fr)]">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
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

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        title="Organization overview"
        description="A single place for project administration, delivery configuration, and account security."
        meta={<Badge variant="outline">System administrator</Badge>}
        actions={
          <Button size="sm" onClick={() => router.push('/dashboard')}>
            <FolderKanban />
            Open projects
          </Button>
        }
      />

      <PageBody className="space-y-4">
        <MetricRow>
          {statCards.map((item) => (
            <Metric
              key={item.label}
              label={item.label}
              value={item.value}
              hint={item.helper}
              icon={item.icon}
            />
          ))}
        </MetricRow>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
          <Panel>
            <PanelHeader
              title="Administration"
              description="Choose the area that matches the job you need to complete."
              icon={Blocks}
            />
            <PanelBody className="grid gap-3 md:grid-cols-3">
              {ACTION_CARDS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="group flex min-h-44 flex-col rounded-lg border border-border bg-card p-4 text-left outline-none transition-[border-color,background-color,box-shadow] hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-sunken text-muted-foreground transition-colors group-hover:text-primary">
                    <item.icon className="size-4" />
                  </span>
                  <span className="mt-4 text-sm font-semibold tracking-tight">{item.title}</span>
                  <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                  <span className="mt-auto flex items-center pt-4 text-xs font-medium text-primary">
                    Open
                    <ArrowRight className="ml-1 size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </PanelBody>
          </Panel>

          <Panel className="self-start">
            <PanelHeader title="Current workspace" icon={Building2} />
            <PanelBody>
              <div className="flex items-center gap-3">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: currentProject?.color || 'var(--muted-foreground)' }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {currentProject?.name || 'No active project'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currentProject
                      ? 'Configuration changes use this project unless you select another one.'
                      : 'Select a project before configuring project-level settings.'}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <Button variant="outline" size="sm" onClick={() => router.push('/admin/panel')}>
                  <Building2 />
                  Configure project
                </Button>
                <Button variant="ghost" size="sm" onClick={() => router.push('/')} disabled={!currentProject}>
                  Return to workspace
                </Button>
              </div>
            </PanelBody>
          </Panel>
        </div>
      </PageBody>
    </div>
  )
}
