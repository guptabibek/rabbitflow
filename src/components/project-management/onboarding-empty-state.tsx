'use client'

import { type ReactNode } from 'react'
import {
  FolderKanban,
  ListTodo,
  Users,
  Tag,
  Repeat,
  LayoutDashboard,
  BarChart3,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboardingSafe } from '@/hooks/use-onboarding'
import { Button } from '@/components/ui/button'

// ── Types ──────────────────────────────────────────────────────

type EmptyStateVariant =
  | 'issues'
  | 'projects'
  | 'members'
  | 'sprints'
  | 'teams'
  | 'labels'
  | 'documents'
  | 'reports'
  | 'board'

type EmptyStateConfig = {
  icon: LucideIcon
  /** Default message when onboarding is not active */
  defaultTitle: string
  defaultDescription: string
  /** Onboarding-aware message */
  onboardingTitle: string
  onboardingDescription: string
  /** Which onboarding step this maps to */
  stepKey: string | null
}

const VARIANT_CONFIG: Record<EmptyStateVariant, EmptyStateConfig> = {
  issues: {
    icon: ListTodo,
    defaultTitle: 'No work items yet',
    defaultDescription: 'Work items will appear here once created.',
    onboardingTitle: 'Create your first work item',
    onboardingDescription:
      'Start tracking your work by creating an issue, task, or story. Work items help you organize and track progress.',
    stepKey: 'create_issue',
  },
  projects: {
    icon: FolderKanban,
    defaultTitle: 'No projects yet',
    defaultDescription: 'Projects will appear here once created.',
    onboardingTitle: 'Create your first project',
    onboardingDescription:
      'Projects are where you organize work items, sprints, and teams. Create one to get started.',
    stepKey: 'create_project',
  },
  members: {
    icon: Users,
    defaultTitle: 'No team members added',
    defaultDescription: 'Invite colleagues to collaborate on this project.',
    onboardingTitle: 'Invite your team',
    onboardingDescription:
      'Collaboration is key! Add team members so you can assign work and track progress together.',
    stepKey: 'invite_member',
  },
  sprints: {
    icon: Repeat,
    defaultTitle: 'No sprints planned',
    defaultDescription: 'Create sprints to plan your team\'s work in iterations.',
    onboardingTitle: 'Plan your first sprint',
    onboardingDescription:
      'Sprints help your team focus on a set of work items for a time period. Plan your first one!',
    stepKey: 'create_sprint',
  },
  teams: {
    icon: Users,
    defaultTitle: 'No teams created',
    defaultDescription: 'Organize your members into teams.',
    onboardingTitle: 'Organize into teams',
    onboardingDescription:
      'Teams let you group members for sprint planning and capacity management.',
    stepKey: 'setup_team',
  },
  labels: {
    icon: Tag,
    defaultTitle: 'No labels yet',
    defaultDescription: 'Create labels to categorize work items.',
    onboardingTitle: 'Add labels for organization',
    onboardingDescription:
      'Labels help you categorize and filter work items. Create some to keep things organized.',
    stepKey: 'create_label',
  },
  documents: {
    icon: FileText,
    defaultTitle: 'No documents yet',
    defaultDescription: 'Create documents to share knowledge with your team.',
    onboardingTitle: 'Start documenting',
    onboardingDescription:
      'Create project documentation, wikis, and knowledge base articles.',
    stepKey: null,
  },
  reports: {
    icon: BarChart3,
    defaultTitle: 'No report data available',
    defaultDescription: 'Reports will populate as you create and complete work items.',
    onboardingTitle: 'Build up your data',
    onboardingDescription:
      'Complete some work items to see velocity, burndown, and other project metrics.',
    stepKey: null,
  },
  board: {
    icon: LayoutDashboard,
    defaultTitle: 'Board is empty',
    defaultDescription: 'Create work items and they\'ll appear on the board.',
    onboardingTitle: 'Populate your board',
    onboardingDescription:
      'Create work items and assign statuses to see them on the Kanban board.',
    stepKey: 'create_issue',
  },
}

// ── Component ──────────────────────────────────────────────────

type OnboardingEmptyStateProps = {
  variant: EmptyStateVariant
  /** Custom action button */
  action?: ReactNode
  /** Custom action handler */
  onAction?: () => void
  /** Override the action label */
  actionLabel?: string
  className?: string
}

export function OnboardingEmptyState({
  variant,
  action,
  onAction,
  actionLabel,
  className,
}: OnboardingEmptyStateProps) {
  const ctx = useOnboardingSafe()
  const config = VARIANT_CONFIG[variant]
  const Icon = config.icon

  // Determine if we should show onboarding-aware messaging
  const step = config.stepKey
    ? ctx?.status?.steps.find((s) => s.key === config.stepKey)
    : null

  const isOnboardingActive =
    ctx?.status &&
    !ctx.status.isDismissed &&
    ctx.status.progressPercent < 100

  const showOnboardingMode = isOnboardingActive && step && !step.isCompleted

  const title = showOnboardingMode ? config.onboardingTitle : config.defaultTitle
  const description = showOnboardingMode
    ? config.onboardingDescription
    : config.defaultDescription

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-16 text-center',
        className
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
          showOnboardingMode
            ? 'bg-primary/10 text-primary'
            : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-7 w-7" />
      </div>

      <h3
        className={cn(
          'text-lg font-semibold',
          showOnboardingMode ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {title}
      </h3>

      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      {/* Action */}
      {action ?? (
        onAction ? (
          <Button
            onClick={onAction}
            variant={showOnboardingMode ? 'default' : 'outline'}
            size="sm"
            className="mt-5"
          >
            {actionLabel ?? step?.ctaLabel ?? 'Get Started'}
          </Button>
        ) : null
      )}

      {/* Subtle onboarding indicator */}
      {showOnboardingMode && (
        <div className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
          <span>Part of your setup checklist</span>
        </div>
      )}
    </div>
  )
}
