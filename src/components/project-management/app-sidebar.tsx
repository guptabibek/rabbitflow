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
} from 'lucide-react'
import { useState } from 'react'
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
    setCreateIssueOpen,
  } = useAppStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const can = (permission: string) => currentProjectPermissions.includes(permission)

  return (
    <div className="w-60 flex flex-col h-full bg-sidebar">
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border flex-shrink-0">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
          <FolderKanban className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm leading-tight text-sidebar-foreground">RabbitFlow</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">Project Management</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-2 py-2 space-y-0.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = currentView === item.id
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary' : ''}`} />
              {item.label}
            </button>
          )
        })}

        {/* Project Settings */}
        {currentProject && (
          <>
            <div className="mx-0.5 my-2 border-t border-sidebar-border" />

            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              Project Settings
              <ChevronDown
                className={`h-3.5 w-3.5 ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {settingsOpen && (
              <div className="ml-4 space-y-0.5">
                {can('workitem:update') && (
                  <LabelsManagement
                    trigger={
                      <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
                        <Tags className="h-4 w-4 flex-shrink-0" />
                        Labels
                      </button>
                    }
                  />
                )}
                {can('masterdata:manage') && (
                  <button
                    onClick={() => onViewChange('admin-panel')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      currentView === 'work-item-types' || currentView === 'admin-panel'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <Layers className="h-4 w-4 flex-shrink-0" />
                    Admin Panel
                  </button>
                )}
                {can('project:members:manage') && (
                  <button
                    onClick={() => onViewChange('teams')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      currentView === 'teams'
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    }`}
                  >
                    <Users className="h-4 w-4 flex-shrink-0" />
                    Teams
                  </button>
                )}
                {can('project:members:manage') && (
                  <MemberManagement
                    trigger={
                      <button className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
                        <UserPlus className="h-4 w-4 flex-shrink-0" />
                        Members
                      </button>
                    }
                  />
                )}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Quick Action */}
      <div className="px-3 py-3 border-t border-sidebar-border flex-shrink-0">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-9 text-sm border-dashed"
          onClick={() => currentProject && setCreateIssueOpen(true)}
          disabled={!currentProject}
        >
          <Plus className="h-4 w-4" />
          New Work Item
        </Button>
      </div>
    </div>
  )
}
