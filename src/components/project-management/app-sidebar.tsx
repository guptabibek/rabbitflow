'use client'

import { useAppStore } from '@/store/app-store'
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
  Settings,
  Tags,
  Layers,
  Users,
  UserPlus,
  Shield,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  LabelsManagement,
  MemberManagement,
} from '@/components/project-management'

type ViewType =
  | 'dashboard'
  | 'backlog'
  | 'board'
  | 'sprints'
  | 'list'
  | 'admin-panel'
  | 'work-item-types'
  | 'teams'
  | 'admin-security'
  | 'settings'

interface AppSidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

const NAV_ITEMS = [
  { id: 'dashboard' as ViewType, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'backlog' as ViewType, label: 'Backlog', icon: FolderTree },
  { id: 'board' as ViewType, label: 'Board', icon: KanbanSquare },
  { id: 'sprints' as ViewType, label: 'Sprints', icon: Zap },
  { id: 'list' as ViewType, label: 'List View', icon: List },
]

export function AppSidebar({ currentView, onViewChange }: AppSidebarProps) {
  const {
    currentProject,
    currentProjectPermissions,
    currentUser,
    setCreateIssueOpen,
  } = useAppStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const can = (permission: string) => currentProjectPermissions.includes(permission)
  const isSettingsView =
    currentView === 'admin-panel' ||
    currentView === 'work-item-types' ||
    currentView === 'teams' ||
    currentView === 'admin-security'

  useEffect(() => {
    if (currentProject && isSettingsView) {
      setSettingsOpen(true)
    }
  }, [currentProject, isSettingsView])

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
          <FolderKanban className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-xs leading-tight text-sidebar-foreground">RabbitFlow</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="px-1.5 py-1.5 space-y-px flex-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = currentView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
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

        {/* Project Settings */}
        {currentProject && (
          <>
            <div className="mx-0.5 my-1.5 border-t border-sidebar-border" />

            <button
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors ${
                settingsOpen || isSettingsView
                  ? 'bg-sidebar-accent/60 text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <Settings className="h-3.5 w-3.5 flex-shrink-0" />
              Project Settings
              <ChevronDown
                className={`h-3 w-3 ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {settingsOpen && (
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
                {can('masterdata:manage') && (
                  <button
                    onClick={() => onViewChange('admin-panel')}
                    className={settingsItemClass(currentView === 'work-item-types' || currentView === 'admin-panel')}
                  >
                    <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                    Admin Panel
                  </button>
                )}
                {can('project:members:manage') && (
                  <button
                    onClick={() => onViewChange('teams')}
                    className={settingsItemClass(currentView === 'teams')}
                  >
                    <Users className="h-3.5 w-3.5 flex-shrink-0" />
                    Teams
                  </button>
                )}
                {can('project:members:manage') && (
                  <MemberManagement
                    trigger={
                      <button className={settingsItemClass()}>
                        <UserPlus className="h-3.5 w-3.5 flex-shrink-0" />
                        Members
                      </button>
                    }
                  />
                )}
                {currentUser?.globalRole === 'admin' && (
                  <button
                    onClick={() => onViewChange('admin-security')}
                    className={settingsItemClass(currentView === 'admin-security')}
                  >
                    <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                    Admin Security
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Quick Action */}
      <div className="px-2 py-2 border-t border-sidebar-border flex-shrink-0">
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
