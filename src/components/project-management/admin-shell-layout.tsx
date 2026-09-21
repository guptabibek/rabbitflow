'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  Blocks,
  ChevronsUpDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserProfile } from '@/components/project-management/user-profile'
import { RabbitFlowMark } from '@/components/brand/rabbitflow-mark'
import { useAppStore, type User } from '@/store/app-store'
import { cn } from '@/lib/utils'

type AdminShellLayoutProps = {
  children: ReactNode
  initialUser: User
}

const NAV_ITEMS = [
  {
    href: '/admin',
    label: 'Overview',
    description: 'Organization summary',
    icon: Blocks,
    match: (pathname: string) => pathname === '/admin',
  },
  {
    href: '/admin/panel',
    label: 'Configuration',
    description: 'Types, workflows and fields',
    icon: Settings2,
    match: (pathname: string) => pathname.startsWith('/admin/panel'),
  },
  {
    href: '/admin/security',
    label: 'Security',
    description: 'Identity, sessions and audit',
    icon: ShieldCheck,
    match: (pathname: string) => pathname.startsWith('/admin/security'),
  },
]

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .map((segment) => segment[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  )
}

export function AdminShellLayout({ children, initialUser }: AdminShellLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const currentProject = useAppStore((state) => state.currentProject)
  const storedUser = useAppStore((state) => state.currentUser)
  const currentUser = storedUser ?? initialUser
  const setCurrentProject = useAppStore((state) => state.setCurrentProject)
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId)
  const setCurrentUser = useAppStore((state) => state.setCurrentUser)
  const resetProjectContext = useAppStore((state) => state.resetProjectContext)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  useEffect(() => {
    if (!storedUser || storedUser.id !== initialUser.id) {
      setCurrentUser(initialUser)
    }
  }, [initialUser, setCurrentUser, storedUser])

  useEffect(() => {
    if (currentProject || isSigningOut) return

    const controller = new AbortController()

    const hydrateWorkspaceContext = async () => {
      try {
        const response = await fetch('/api/projects/active', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return

        const payload = await response.json()
        if (!payload.project) return

        setCurrentProject(payload.project)
        setActiveProjectId(payload.project.id)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Failed to hydrate admin workspace context:', error)
      }
    }

    void hydrateWorkspaceContext()
    return () => controller.abort()
  }, [currentProject, isSigningOut, setActiveProjectId, setCurrentProject])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleLogout = async () => {
    setIsSigningOut(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Sign out failed')

      resetProjectContext()
      setCurrentUser(null)
      router.replace('/login')
      router.refresh()
    } catch {
      toast.error('Could not sign out. Please try again.')
      setIsSigningOut(false)
    }
  }

  const accountMenuContent = (
    <DropdownMenuContent align="end" className="w-64" portalled={false}>
      <div className="px-2 pb-1.5 pt-1.5">
        <p className="truncate text-[13px] font-medium">{currentUser.name}</p>
        <p className="truncate text-xs text-foreground">{currentUser.email}</p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setIsProfileOpen(true)}>
        <UserRound />
        Profile settings
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={toggleTheme}>
        {theme === 'dark' ? <Sun /> : <Moon />}
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Navigation</DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => router.push('/dashboard')}>
        <LayoutDashboard />
        Projects
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!currentProject} onSelect={() => router.push('/')}>
        <FolderKanban />
        Current workspace
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={isSigningOut}
        onSelect={() => void handleLogout()}
      >
        <LogOut />
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <RabbitFlowMark className="size-8 shrink-0 object-contain" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">RabbitFlow</div>
            <div className="text-[11px] text-muted-foreground">Administration</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Administration">
          <p className="type-label px-2 pb-2 pt-1">Manage</p>
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname)
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--primary)]'
                    : 'text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'
                )}
              >
                <item.icon className={cn('size-4 shrink-0', active && 'text-primary')} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{item.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{item.description}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className="space-y-3 border-t border-sidebar-border p-3">
          <div className="rounded-md border border-sidebar-border bg-background/55 p-3">
            <p className="type-label">Workspace context</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: currentProject?.color || 'var(--muted-foreground)' }}
                aria-hidden="true"
              />
              <span className="truncate text-xs font-medium text-sidebar-foreground">
                {currentProject?.name || 'No project selected'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="xs" variant="ghost" onClick={() => router.push('/dashboard')}>
              <LayoutDashboard className="size-3.5" />
              Projects
            </Button>
            <Button size="xs" variant="ghost" onClick={() => router.push('/')} disabled={!currentProject}>
              <FolderKanban className="size-3.5" />
              Workspace
            </Button>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
                aria-label="Account menu"
                data-testid="admin-account-menu-trigger-desktop"
              >
                <Avatar className="size-7">
                  <AvatarImage src={currentUser.avatar || undefined} />
                  <AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">
                    {getInitials(currentUser.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-sidebar-foreground">
                    {currentUser.name}
                  </span>
                  <span className="block truncate text-[10px] font-normal text-muted-foreground">
                    {currentUser.email}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            {accountMenuContent}
          </DropdownMenu>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => router.push('/admin')} className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Blocks className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">Admin</span>
          </button>
          <nav className="flex items-center gap-0.5" aria-label="Administration">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname)
              return (
                <Button
                  key={item.href}
                  size="icon-xs"
                  variant={active ? 'secondary' : 'ghost'}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => router.push(item.href)}
                >
                  <item.icon />
                </Button>
              )
            })}
          </nav>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" onClick={() => router.push('/dashboard')}>
              Projects
              <ArrowUpRight className="size-3.5" />
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Account menu"
                  data-testid="admin-account-menu-trigger-mobile"
                >
                  <Avatar className="size-6">
                    <AvatarImage src={currentUser.avatar || undefined} />
                    <AvatarFallback className="bg-primary text-[9px] font-semibold text-primary-foreground">
                      {getInitials(currentUser.name)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              {accountMenuContent}
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="min-h-screen min-w-0">
          {children}
        </main>
      </div>

      <UserProfile open={isProfileOpen} onOpenChange={setIsProfileOpen} />
    </div>
  )
}
