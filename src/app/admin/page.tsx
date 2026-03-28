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
    title: 'Projects And Users',
    description: 'Create projects, onboard users, and manage organization-wide membership from the main dashboard.',
    href: '/dashboard',
    icon: Users,
    accent: 'from-sky-500/20 via-sky-500/10 to-transparent',
  },
  {
    title: 'Admin Panel',
    description: 'Manage work item types, state machines, and planning field configuration in a dedicated admin workspace.',
    href: '/admin/panel',
    icon: Building2,
    accent: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
  },
  {
    title: 'Admin Security',
    description: 'Review active sessions, enforce MFA, offboard users, and inspect the security audit timeline.',
    href: '/admin/security',
    icon: Shield,
    accent: 'from-amber-500/20 via-amber-500/10 to-transparent',
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
        helper: 'Overview, Admin Panel, and Admin Security.',
      },
      {
        label: 'Workspace Context',
        value: currentProject ? currentProject.name : 'No active workspace',
        icon: Building2,
        helper: currentProject
          ? 'Return to this project when you switch back to delivery work.'
          : 'Select a project from the dashboard when you need workspace context.',
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
          <Button onClick={() => router.push('/dashboard')}>Return to dashboard</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {statCards.map((item) => (
          <Card key={item.label} className="rounded-3xl border-border/70 bg-card/90 shadow-sm">
            <CardContent className="flex items-center justify-between p-4 sm:p-6">
              <div className="min-w-0 pr-4">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div
                  className={`mt-2 font-semibold tracking-tight ${
                    typeof item.value === 'number' ? 'text-3xl' : 'truncate text-base'
                  }`}
                  title={String(item.value)}
                >
                  {item.value}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.helper}</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <item.icon className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.92fr)]">
        <Card className="overflow-hidden rounded-[28px] border-border/70 bg-card/92 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,_hsl(var(--primary)/0.15),_transparent_60%)] pb-5">
            <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">
              Organization Command Center
            </Badge>
            <CardTitle className="text-3xl tracking-tight">Run admin work outside the project shell</CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              Use this space for organization-level operations. Project work stays in the workspace. Security and configuration stay here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 sm:p-6 sm:grid-cols-2 lg:grid-cols-3">
            {ACTION_CARDS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => router.push(item.href)}
                className={`group rounded-[24px] border border-border/70 bg-gradient-to-br ${item.accent} p-5 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/75 text-foreground shadow-sm ring-1 ring-border/60">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="mt-5 space-y-2">
                  <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
                <div className="mt-6 flex items-center text-sm font-medium text-foreground">
                  Open section
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-border/70 bg-card/90 shadow-sm 2xl:self-start">
          <CardHeader>
            <CardTitle className="text-xl tracking-tight">Current context</CardTitle>
            <CardDescription>
              Keep project work and organization administration separate, while preserving a quick return path.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Active workspace
              </div>
              <div className="mt-2 text-base font-semibold">
                {currentProject ? currentProject.name : 'No active project selected'}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentProject
                  ? 'Return to workspace when you want to resume delivery work inside the selected project.'
                  : 'Open a project from the main dashboard to restore workspace context.'}
              </p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Recommended flow
              </div>
              <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    1
                  </div>
                  <p>Use Main Dashboard for organization-level project and user creation.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    2
                  </div>
                  <p>Use Admin Panel for schema, state, and planning configuration.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    3
                  </div>
                  <p>Use Admin Security for MFA, sessions, and offboarding controls.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => router.push('/dashboard')}>Open Main Dashboard</Button>
              <Button variant="outline" onClick={() => router.push('/admin/panel')}>
                Open Admin Panel
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}