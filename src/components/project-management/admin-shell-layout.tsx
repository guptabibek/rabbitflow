'use client'

import type { ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Blocks, Building2, FolderKanban, LayoutDashboard, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/app-store'

type AdminShellLayoutProps = {
  children: ReactNode
}

const NAV_ITEMS = [
  {
    href: '/admin',
    label: 'Overview',
    icon: Blocks,
    match: (pathname: string) => pathname === '/admin',
  },
  {
    href: '/admin/panel',
    label: 'Admin Panel',
    icon: Building2,
    match: (pathname: string) => pathname.startsWith('/admin/panel'),
  },
  {
    href: '/admin/security',
    label: 'Admin Security',
    icon: Shield,
    match: (pathname: string) => pathname.startsWith('/admin/security'),
  },
]

export function AdminShellLayout({ children }: AdminShellLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentProject } = useAppStore()

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.16),_transparent_32%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.65))]">
      <div className="flex min-h-screen w-full flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-border/70 bg-card/85 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.85)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">
                Organization Admin
              </Badge>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  Administrative Console
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Manage platform configuration and security outside the project workspace.
                </p>
              </div>
              {currentProject ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Workspace context</span>
                  <Badge variant="secondary" className="gap-1.5 rounded-full px-2.5 py-0.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: currentProject.color }}
                    />
                    {currentProject.name}
                  </Badge>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Main Dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/')}
                disabled={!currentProject}
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                Back To Workspace
              </Button>
            </div>
          </div>

          <nav className="mt-5 flex flex-wrap gap-2 border-t border-border/70 pt-4" aria-label="Organization admin navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = item.match(pathname)
              return (
                <Button
                  key={item.href}
                  variant={isActive ? 'default' : 'outline'}
                  className="min-w-[150px] justify-start"
                  onClick={() => router.push(item.href)}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              )
            })}
          </nav>
        </header>

        <main id="main-content" className="flex-1 py-6">
          {children}
        </main>
      </div>
    </div>
  )
}