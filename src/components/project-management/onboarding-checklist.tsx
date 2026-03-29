'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  X,
  Sparkles,
  BarChart3,
  FolderKanban,
  LayoutDashboard,
  Repeat,
  SquarePlus,
  Tag,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboarding, type OnboardingStep } from '@/hooks/use-onboarding'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

// ── Icon resolver ──────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FolderKanban,
  UserPlus,
  SquarePlus,
  LayoutDashboard,
  Repeat,
  UserCheck,
  Users,
  Tag,
  CheckCircle: CheckCircle2,
  CheckCircle2,
  BarChart3,
  Circle,
  Sparkles,
}

const LEGACY_STEP_ACTIONS: Record<string, string> = {
  create_project: 'dashboard',
  invite_member: 'teams',
  create_issue: '__create_issue',
  setup_board: 'board',
  create_sprint: 'sprints',
  assign_issue: 'backlog',
  setup_team: 'teams',
  create_label: '__manage_labels',
  complete_issue: 'board',
  explore_reports: 'reports',
}

const COMPLETION_RULE_ACTIONS: Record<string, string> = {
  has_project: 'dashboard',
  has_team_member: 'teams',
  has_issue: '__create_issue',
  viewed_board: 'board',
  has_sprint: 'sprints',
  has_assigned_issue: 'backlog',
  has_team: 'teams',
  has_label: '__manage_labels',
  has_completed_issue: 'board',
  viewed_reports: 'reports',
}

function resolveStepActionTarget(step: OnboardingStep): string | null {
  return (
    step.ctaRoute ??
    step.targetRoute ??
    LEGACY_STEP_ACTIONS[step.key] ??
    COMPLETION_RULE_ACTIONS[step.completionRule] ??
    null
  )
}

function StepIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Circle
  return <Icon className={className} />
}

// ── Step item ──────────────────────────────────────────────────

function OnboardingStepItem({
  step,
  isActive,
  onDismiss,
  onAction,
}: {
  step: OnboardingStep
  isActive: boolean
  onDismiss: (key: string) => void
  onAction: (step: OnboardingStep) => void
}) {
  const isCompleted = step.isCompleted
  const isDismissed = step.isDismissed

  if (isDismissed) return null

  return (
    <div
      data-testid={`onboarding-step-${step.key}`}
      className={cn(
        'group relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
        isActive && !isCompleted && 'bg-primary/[0.06] ring-1 ring-primary/20',
        isCompleted && 'opacity-60'
      )}
    >
      {/* Status indicator */}
      <div className="mt-0.5 flex-shrink-0">
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : (
          <div
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors',
              isActive ? 'border-primary' : 'border-muted-foreground/30'
            )}
          >
            <StepIcon
              name={step.icon}
              className={cn(
                'h-3 w-3',
                isActive ? 'text-primary' : 'text-muted-foreground/50'
              )}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium leading-tight',
            isCompleted && 'line-through text-muted-foreground'
          )}
        >
          {step.title}
        </p>
        {isActive && !isCompleted && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {step.description}
          </p>
        )}
        {isActive && !isCompleted && step.ctaLabel && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 h-7 rounded-lg px-3 text-xs font-medium"
            onClick={() => onAction(step)}
            data-testid={`onboarding-step-action-${step.key}`}
          >
            {step.ctaLabel}
          </Button>
        )}
      </div>

      {/* Dismiss button */}
      {!isCompleted && (
        <button
          onClick={() => onDismiss(step.key)}
          className="absolute right-1 top-1 rounded-md p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
          title="Skip this step"
          data-testid={`onboarding-step-dismiss-${step.key}`}
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

// ── Main checklist panel ───────────────────────────────────────

export function OnboardingChecklist({ onNavigate }: { onNavigate?: (viewOrAction: string) => void }) {
  const {
    status,
    isLoading,
    showChecklist,
    dismissStep,
    dismissAll,
    recordEvent,
  } = useOnboarding()

  const [isExpanded, setIsExpanded] = useState(true)

  if (!showChecklist || !status || isLoading) return null

  const visibleSteps = status.steps.filter((s) => !s.isDismissed)
  const completedVisible = visibleSteps.filter((s) => s.isCompleted).length
  const totalVisible = visibleSteps.length

  if (totalVisible === 0) return null

  const handleAction = (step: OnboardingStep) => {
    // For view-based steps, record the event
    if (step.completionRule.startsWith('viewed_')) {
      void recordEvent(step.key)
    }

    const actionTarget = resolveStepActionTarget(step)
    if (actionTarget && onNavigate) {
      onNavigate(actionTarget)
    }
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 shadow-lg backdrop-blur-sm" data-testid="onboarding-checklist">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Getting Started</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {completedVisible}/{totalVisible}
              </span>
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>

          <button
            onClick={dismissAll}
            className="rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-muted-foreground"
            title="Dismiss onboarding checklist"
            data-testid="onboarding-dismiss-all-button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <Progress
            value={status.progressPercent}
            className="h-1.5 bg-muted"
            data-testid="onboarding-progress-bar"
          />
        </div>

        {/* Steps */}
        <CollapsibleContent>
          <div className="space-y-0.5 px-2 pb-3">
            {visibleSteps.map((step) => (
              <OnboardingStepItem
                key={step.key}
                step={step}
                isActive={step.key === status.currentStep}
                onDismiss={dismissStep}
                onAction={handleAction}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// ── Compact inline checklist (for sidebar) ─────────────────────

export function OnboardingChecklistCompact() {
  const { status, showChecklist }  = useOnboarding()

  if (!showChecklist || !status) return null

  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/[0.06] px-3 py-2">
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Setup progress</span>
          <span className="text-xs text-muted-foreground">
            {status.progressPercent}%
          </span>
        </div>
        <Progress value={status.progressPercent} className="mt-1 h-1 bg-muted" />
      </div>
    </div>
  )
}
