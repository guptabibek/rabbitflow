'use client'

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FolderKanban,
  FolderTree,
  GitBranchPlus,
  KanbanSquare,
  Key,
  LayoutDashboard,
  List,
  Map,
  MessageCircle,
  Network,
  Palette,
  Plus,
  Repeat,
  Settings,
  Shield,
  ShieldCheck,
  Tags,
  Target,
  Upload,
  UserPlus,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { useAppStore } from '@/store/app-store'
import { cn, getApiErrorMessage } from '@/lib/utils'
import { normalizeProjectRole } from '@/lib/domain/rbac'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  LabelsManagement,
  MemberManagement,
  FavoritesSidebar,
} from '@/components/project-management'
import { OnboardingChecklistCompact } from '@/components/project-management/onboarding-checklist'

type ViewType =
  | 'dashboard'
  | 'backlog'
  | 'board'
  | 'sprints'
  | 'list'
  | 'reports'
  | 'documents'
  | 'objectives'
  | 'retrospectives'
  | 'approvals'
  | 'roadmap'
  | 'portfolio'
  | 'calendar'
  | 'dependency-graph'
  | 'activity'
  | 'teams'
  | 'settings'
  | 'webhooks'
  | 'automations'
  | 'imports'
  | 'recurring-tasks'
  | 'test-plans'
  | 'sla'
  | 'api-tokens'
  | 'branding'
  | 'acl'
  | 'onboarding-config'

interface AppSidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  /**
   * Icon-rail mode. The previous collapse animated the sidebar to zero width,
   * which is not a collapsed sidebar — it is a hidden one, and it cost the
   * user their sense of place along with the pixels. The rail keeps every
   * destination reachable in one click and every label one hover away.
   */
  collapsed?: boolean
  /** Lets the mobile drawer close itself the moment a destination is chosen. */
  onNavigate?: () => void
}

type NavItem = {
  id: ViewType
  label: string
  icon: LucideIcon
  /** Longer description, shown in the rail tooltip where space allows. */
  hint?: string
}

/**
 * Grouped by the question the user is asking, not by the table the data lives
 * in. "Plan" is what is coming, "Track" is what is happening, "Analyse" is
 * what happened.
 */
const NAV_SECTIONS: Array<{ label: string | null; items: NavItem[] }> = [
  {
    label: null,
    items: [
      { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, hint: 'Project health at a glance' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { id: 'backlog', label: 'Backlog', icon: FolderTree, hint: 'Ordered work not yet scheduled' },
      { id: 'board', label: 'Board', icon: KanbanSquare, hint: 'Work in flight by status' },
      { id: 'list', label: 'Work items', icon: List, hint: 'Every item, sortable and filterable' },
      { id: 'sprints', label: 'Sprints', icon: Zap, hint: 'Iteration scope and capacity' },
      { id: 'roadmap', label: 'Roadmap', icon: Map, hint: 'Delivery over time' },
      { id: 'calendar', label: 'Calendar', icon: CalendarDays, hint: 'Dates and due work' },
    ],
  },
  {
    label: 'Track',
    items: [
      { id: 'portfolio', label: 'Portfolio', icon: GitBranchPlus, hint: 'Roll-up across projects' },
      { id: 'dependency-graph', label: 'Dependencies', icon: Network, hint: 'What is blocking what' },
      { id: 'objectives', label: 'Goals', icon: Target, hint: 'Objectives and key results' },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck, hint: 'Decisions waiting on someone' },
      { id: 'activity', label: 'Activity', icon: Activity, hint: 'Recent changes across the project' },
    ],
  },
  {
    label: 'Analyse',
    items: [
      { id: 'reports', label: 'Reports', icon: BarChart3, hint: 'Velocity, flow and quality' },
      { id: 'documents', label: 'Documents', icon: BookOpen, hint: 'Specs and notes' },
      { id: 'retrospectives', label: 'Retros', icon: MessageCircle, hint: 'What the team learned' },
    ],
  },
]

const SETTINGS_VIEWS: ViewType[] = [
  'teams',
  'webhooks',
  'automations',
  'imports',
  'recurring-tasks',
  'test-plans',
  'sla',
  'api-tokens',
  'branding',
  'acl',
  'onboarding-config',
]

type NavRowProps = {
  icon: LucideIcon
  label: string
  hint?: string
  active?: boolean
  collapsed?: boolean
  badge?: React.ReactNode
  depth?: number
  testId?: string
  trailing?: React.ReactNode
} & React.ComponentProps<'button'>

/**
 * One nav row. In rail mode the label is removed from the flow rather than
 * hidden with opacity, so the row cannot be wider than the rail and cause the
 * horizontal scrollbar the old sidebar produced mid-transition.
 *
 * Forwards its ref and spreads unknown props onto the button so that the rows
 * which open a dialog rather than navigate can be handed straight to
 * `DialogTrigger asChild` and still get their tooltip in rail mode.
 */
const NavRow = React.forwardRef<HTMLButtonElement, NavRowProps>(function NavRow(
  {
    icon: Icon,
    label,
    hint,
    active,
    collapsed,
    badge,
    depth = 0,
    testId,
    trailing,
    className,
    ...rest
  },
  ref
) {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      className={cn(
        'group/nav relative flex w-full items-center rounded-md text-[13px] font-medium',
        'transition-colors duration-100',
        'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sidebar-ring',
        collapsed ? 'h-8 justify-center px-0' : 'h-7 gap-2 px-2',
        depth > 0 && !collapsed && 'pl-7',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        className
      )}
      {...rest}
    >
      {/* The 2px rail is the primary active signal. It survives on top of the
          hover tint, which a background colour alone does not. */}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
        />
      ) : null}

      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active ? 'text-primary' : 'text-muted-foreground group-hover/nav:text-sidebar-foreground'
        )}
        aria-hidden="true"
      />

      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {badge}
          {trailing}
        </>
      )}

      {/* In the rail a badge cannot show its number, so it becomes a dot. */}
      {collapsed && badge ? (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary"
        />
      ) : null}
    </button>
  )

  if (!collapsed) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[11px] font-normal opacity-70">{hint}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
})

function SectionLabel({ children, collapsed }: { children: string; collapsed?: boolean }) {
  if (collapsed) {
    // A hairline stands in for the heading, so the rail keeps the grouping
    // even though it cannot keep the words.
    return <div aria-hidden="true" className="mx-2 my-2 h-px bg-sidebar-border" />
  }

  return (
    <div className="type-label px-2 pb-1 pt-3.5 text-muted-foreground/70">{children}</div>
  )
}

export function AppSidebar({
  currentView,
  onViewChange,
  collapsed = false,
  onNavigate,
}: AppSidebarProps) {
  const {
    currentProject,
    currentProjectRole,
    currentProjectPermissions,
    setCreateIssueOpen,
  } = useAppStore()

  const isSettingsView = SETTINGS_VIEWS.includes(currentView)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [branding, setBranding] = useState<{
    projectId: string
    name: string
    accent: string | null
  } | null>(null)

  const can = (permission: string) => currentProjectPermissions.includes(permission)
  const canManageOperations = can('operations:manage')
  const canManageOnboarding = normalizeProjectRole(currentProjectRole) === 'Admin'
  const effectiveSettingsOpen = settingsOpen || isSettingsView

  const activeBranding = branding?.projectId === currentProject?.id ? branding : null
  const brandingName = activeBranding?.name ?? 'RabbitFlow'

  useEffect(() => {
    if (!currentProject) return

    let cancelled = false

    fetch(`/api/projects/${currentProject.id}/branding`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to load branding'))
        }
        return response.json()
      })
      .then((payload) => {
        if (cancelled) return
        setBranding({
          projectId: currentProject.id,
          name: payload.productName || payload.organizationName || 'RabbitFlow',
          accent: payload.accentColor || null,
        })
      })
      .catch((error) => {
        if (!cancelled) {
          setBranding({ projectId: currentProject.id, name: 'RabbitFlow', accent: null })
          toast.error(error instanceof Error ? error.message : 'Failed to load project branding')
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentProject])

  const go = (view: ViewType) => {
    onViewChange(view)
    onNavigate?.()
  }

  const settingsItems = useMemo(
    () =>
      [
        can('project:members:manage') && { id: 'teams' as ViewType, label: 'Teams', icon: Users },
        canManageOperations && { id: 'webhooks' as ViewType, label: 'Webhooks', icon: Webhook },
        canManageOperations && { id: 'automations' as ViewType, label: 'Automations', icon: Zap },
        can('workitem:create') && { id: 'imports' as ViewType, label: 'Import', icon: Upload },
        canManageOperations && {
          id: 'recurring-tasks' as ViewType,
          label: 'Recurring tasks',
          icon: Repeat,
        },
        can('project:read') && {
          id: 'test-plans' as ViewType,
          label: 'Test plans',
          icon: ClipboardCheck,
        },
        canManageOperations && { id: 'sla' as ViewType, label: 'SLA policies', icon: Shield },
        { id: 'api-tokens' as ViewType, label: 'API tokens', icon: Key },
        can('branding:manage') && { id: 'branding' as ViewType, label: 'Branding', icon: Palette },
        can('acl:manage') && { id: 'acl' as ViewType, label: 'ACL rules', icon: ShieldCheck },
        canManageOnboarding && {
          id: 'onboarding-config' as ViewType,
          label: 'Onboarding',
          icon: BookOpen,
        },
      ].filter(Boolean) as NavItem[],
    [currentProjectPermissions, canManageOperations, canManageOnboarding, can]
  )

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-sidebar',
        collapsed ? 'w-[3.25rem]' : 'w-[13.5rem]'
      )}
      data-collapsed={collapsed || undefined}
    >
      {/* Brand. Same 48px as the top bar so the two chrome edges meet on one
          line across the whole application. */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-0' : 'gap-2 px-3'
        )}
      >
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary">
          <FolderKanban className="size-3.5 text-primary-foreground" aria-hidden="true" />
        </div>
        {!collapsed ? (
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
            {brandingName}
          </span>
        ) : null}
      </div>

      {/*
        min-h-0 is required: in a flex column `flex-1` still resolves
        min-height to `auto`, so the nav refuses to shrink below its content
        and pushes the footer past the bottom of the viewport.
      */}
      <nav
        aria-label="Project navigation"
        className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1.5', collapsed ? 'px-1.5' : 'px-2')}
      >
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label ?? 'primary'}>
            {section.label ? (
              <SectionLabel collapsed={collapsed}>{section.label}</SectionLabel>
            ) : null}
            <div className={cn('space-y-px', index === 0 && !collapsed && 'pt-0.5')}>
              {section.items.map((item) => (
                <NavRow
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  hint={item.hint}
                  active={currentView === item.id}
                  collapsed={collapsed}
                  onClick={() => go(item.id)}
                  testId={`sidebar-nav-${item.id}`}
                />
              ))}
            </div>
          </div>
        ))}

        {currentProject ? (
          <>
            {!collapsed ? <FavoritesSidebar /> : null}

            <SectionLabel collapsed={collapsed}>Configure</SectionLabel>

            <div className="space-y-px">
              {/* Labels and Members open dialogs rather than views, so they sit
                  with the other configuration entries instead of hiding
                  behind an unrelated toolbar. */}
              {can('workitem:update') ? (
                <LabelsManagement
                  trigger={
                    <NavRow icon={Tags} label="Labels" collapsed={collapsed} hint="Categorise work items" />
                  }
                />
              ) : null}

              {can('project:members:manage') ? (
                <MemberManagement
                  trigger={
                    <NavRow
                      icon={UserPlus}
                      label="Members"
                      collapsed={collapsed}
                      hint="Who can see and change this project"
                      testId="sidebar-members-button"
                    />
                  }
                />
              ) : null}

              <NavRow
                icon={Settings}
                label="Project settings"
                hint="Teams, automations, tokens and policies"
                collapsed={collapsed}
                active={isSettingsView && !effectiveSettingsOpen}
                onClick={() => {
                  if (collapsed) {
                    // In the rail there is nowhere to expand into, so the row
                    // navigates to the first settings destination instead of
                    // toggling a submenu the user cannot see.
                    go(settingsItems[0]?.id ?? 'teams')
                    return
                  }
                  setSettingsOpen((open) => !open)
                }}
                testId="sidebar-settings-toggle"
                aria-expanded={collapsed ? undefined : effectiveSettingsOpen}
                trailing={
                  <ChevronRight
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
                      effectiveSettingsOpen && 'rotate-90'
                    )}
                    aria-hidden="true"
                  />
                }
              />

              {!collapsed && effectiveSettingsOpen ? (
                <div className="relative space-y-px pt-px">
                  {/* A guide line rather than a bordered box: nesting should
                      read as indentation, not as a card inside the nav. */}
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 left-[1.1875rem] top-1 w-px bg-sidebar-border"
                  />
                  {settingsItems.map((item) => (
                    <NavRow
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      depth={1}
                      active={currentView === item.id}
                      onClick={() => go(item.id)}
                      testId={item.id === 'teams' ? 'sidebar-teams-button' : undefined}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </nav>

      <div
        className={cn(
          'shrink-0 space-y-2 border-t border-sidebar-border py-2',
          collapsed ? 'px-1.5' : 'px-2'
        )}
      >
        {!collapsed ? <OnboardingChecklistCompact /> : null}

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                className="w-full"
                onClick={() => currentProject && setCreateIssueOpen(true)}
                disabled={!currentProject}
                aria-label="New work item"
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              New work item
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            className="w-full justify-center"
            onClick={() => currentProject && setCreateIssueOpen(true)}
            disabled={!currentProject}
          >
            <Plus />
            New work item
          </Button>
        )}
      </div>
    </div>
  )
}
