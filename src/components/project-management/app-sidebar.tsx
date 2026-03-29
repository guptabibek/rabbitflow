'use client'

import { useAppStore } from '@/store/app-store'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  FolderTree,
  KanbanSquare,
  List,
  Plus,
  FolderKanban,
  ChevronDown,
  Zap,
  BarChart3,
  Settings,
  Tags,
  Users,
  UserPlus,
  BookOpen,
  Target,
  MessageCircle,
  Webhook,
  Repeat,
  Upload,
  ClipboardCheck,
  Shield,
  Key,
  ShieldCheck,
  CalendarDays,
  GitBranchPlus,
  Network,
  Activity,
  Palette,
  Map,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApiErrorMessage } from '@/lib/utils'
import { normalizeProjectRole } from '@/lib/domain/rbac'
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
}

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { id: 'dashboard' as ViewType, label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Planning',
    items: [
      { id: 'backlog' as ViewType, label: 'Backlog', icon: FolderTree },
      { id: 'board' as ViewType, label: 'Board', icon: KanbanSquare },
      { id: 'sprints' as ViewType, label: 'Sprints', icon: Zap },
      { id: 'list' as ViewType, label: 'List View', icon: List },
      { id: 'roadmap' as ViewType, label: 'Roadmap', icon: Map },
      { id: 'calendar' as ViewType, label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Tracking',
    items: [
      { id: 'portfolio' as ViewType, label: 'Portfolio', icon: GitBranchPlus },
      { id: 'dependency-graph' as ViewType, label: 'Dependencies', icon: Network },
      { id: 'activity' as ViewType, label: 'Activity', icon: Activity },
      { id: 'objectives' as ViewType, label: 'Goals / OKR', icon: Target },
    ],
  },
  {
    label: 'Collaborate',
    items: [
      { id: 'reports' as ViewType, label: 'Reports', icon: BarChart3 },
      { id: 'documents' as ViewType, label: 'Documents', icon: BookOpen },
      { id: 'retrospectives' as ViewType, label: 'Retros', icon: MessageCircle },
      { id: 'approvals' as ViewType, label: 'Approvals', icon: ShieldCheck },
    ],
  },
]

export function AppSidebar({ currentView, onViewChange }: AppSidebarProps) {
  const {
    currentProject,
    currentProjectRole,
    currentProjectPermissions,
    setCreateIssueOpen,
  } = useAppStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [branding, setBranding] = useState<{
    projectId: string
    name: string
    accent: string | null
  } | null>(null)

  const can = (permission: string) => currentProjectPermissions.includes(permission)
  const settingsViews: ViewType[] = ['teams', 'webhooks', 'automations', 'imports', 'recurring-tasks', 'test-plans', 'sla', 'api-tokens', 'branding', 'acl', 'onboarding-config']
  const isSettingsView = settingsViews.includes(currentView)
  const effectiveSettingsOpen = settingsOpen || isSettingsView
  const activeBranding = branding?.projectId === currentProject?.id ? branding : null
  const brandingName = activeBranding?.name ?? 'RabbitFlow'
  const brandAccent = activeBranding?.accent ?? null
  const canManageOperations = can('operations:manage')
  const canManageOnboarding = normalizeProjectRole(currentProjectRole) === 'Admin'

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
          setBranding({
            projectId: currentProject.id,
            name: 'RabbitFlow',
            accent: null,
          })
          toast.error(error instanceof Error ? error.message : 'Failed to load project branding')
        }
      })

    return () => {
      cancelled = true
    }
  }, [currentProject])

  const settingsItemClass = (active = false) =>
    `w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
        : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
    }`

  return (
    <div className="w-52 flex flex-col h-full bg-sidebar">
      {/* Brand */}
      <div className="h-11 flex items-center gap-2 px-3 border-b border-sidebar-border flex-shrink-0">
        <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
          <FolderKanban className="h-3.5 w-3.5 text-primary-foreground" style={brandAccent ? { color: '#ffffff' } : undefined} />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-xs leading-tight text-sidebar-foreground">{brandingName}</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="px-1.5 py-1.5 flex-1 overflow-y-auto">
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <div key={section.label ?? 'top'} className={sectionIndex > 0 ? 'mt-4' : ''}>
            {section.label && (
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {section.label}
              </div>
            )}
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive = currentView === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onViewChange(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    data-testid={`sidebar-nav-${item.id}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <item.icon className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? 'text-primary' : ''}`} />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Project Settings */}
        {currentProject && (
          <>
            <FavoritesSidebar />
            <div className="mt-4 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Configure
            </div>

            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={effectiveSettingsOpen}
              data-testid="sidebar-settings-toggle"
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors ${
                effectiveSettingsOpen
                  ? 'bg-sidebar-accent/60 text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <Settings className="h-3.5 w-3.5 flex-shrink-0" />
              Project Settings
              <ChevronDown
                className={`h-3 w-3 ml-auto transition-transform ${effectiveSettingsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {effectiveSettingsOpen && (
              <div className="ml-3.5 space-y-1 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/20 p-1.5">
                {can('workitem:update') && (
                  <LabelsManagement
                    trigger={
                      <button className={settingsItemClass()}>
                        <Tags className="h-3.5 w-3.5 flex-shrink-0" />
                        Labels
                      </button>
                    }
                  />
                )}
                {can('project:members:manage') && (
                  <button
                    onClick={() => onViewChange('teams')}
                    data-testid="sidebar-teams-button"
                    className={settingsItemClass(currentView === 'teams')}
                  >
                    <Users className="h-3.5 w-3.5 flex-shrink-0" />
                    Teams
                  </button>
                )}
                {can('project:members:manage') && (
                  <MemberManagement
                    trigger={
                      <button className={settingsItemClass()} data-testid="sidebar-members-button">
                        <UserPlus className="h-3.5 w-3.5 flex-shrink-0" />
                        Members
                      </button>
                    }
                  />
                )}
                {canManageOperations && (
                  <button onClick={() => onViewChange('webhooks')} className={settingsItemClass(currentView === 'webhooks')}>
                    <Webhook className="h-3.5 w-3.5 flex-shrink-0" />
                    Webhooks
                  </button>
                )}
                {canManageOperations && (
                  <button onClick={() => onViewChange('automations')} className={settingsItemClass(currentView === 'automations')}>
                    <Zap className="h-3.5 w-3.5 flex-shrink-0" />
                    Automations
                  </button>
                )}
                {can('workitem:create') && (
                  <button onClick={() => onViewChange('imports')} className={settingsItemClass(currentView === 'imports')}>
                    <Upload className="h-3.5 w-3.5 flex-shrink-0" />
                    Import
                  </button>
                )}
                {canManageOperations && (
                  <button onClick={() => onViewChange('recurring-tasks')} className={settingsItemClass(currentView === 'recurring-tasks')}>
                    <Repeat className="h-3.5 w-3.5 flex-shrink-0" />
                    Recurring Tasks
                  </button>
                )}
                {can('project:read') && (
                  <button onClick={() => onViewChange('test-plans')} className={settingsItemClass(currentView === 'test-plans')}>
                  <ClipboardCheck className="h-3.5 w-3.5 flex-shrink-0" />
                  Test Plans
                  </button>
                )}
                {canManageOperations && (
                  <button onClick={() => onViewChange('sla')} className={settingsItemClass(currentView === 'sla')}>
                    <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                    SLA Policies
                  </button>
                )}
                <button onClick={() => onViewChange('api-tokens')} className={settingsItemClass(currentView === 'api-tokens')}>
                  <Key className="h-3.5 w-3.5 flex-shrink-0" />
                  API Tokens
                </button>
                {can('branding:manage') && (
                  <button onClick={() => onViewChange('branding')} className={settingsItemClass(currentView === 'branding')}>
                    <Palette className="h-3.5 w-3.5 flex-shrink-0" />
                    Branding
                  </button>
                )}
                {can('acl:manage') && (
                  <button onClick={() => onViewChange('acl')} className={settingsItemClass(currentView === 'acl')}>
                    <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
                    ACL Rules
                  </button>
                )}
                {canManageOnboarding && (
                  <button onClick={() => onViewChange('onboarding-config')} className={settingsItemClass(currentView === 'onboarding-config')}>
                    <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                    Onboarding
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Quick Action */}
      <div className="px-2 py-2 border-t border-sidebar-border flex-shrink-0 space-y-2">
        <OnboardingChecklistCompact />
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-8 text-[13px] border-dashed"
          onClick={() => currentProject && setCreateIssueOpen(true)}
          disabled={!currentProject}
        >
          <Plus className="h-3.5 w-3.5" />
          New Work Item
        </Button>
      </div>
    </div>
  )
}
