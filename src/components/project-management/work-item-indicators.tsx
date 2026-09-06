'use client'

import * as React from 'react'
import {
  Bug,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Flag,
  Layers,
  PackageCheck,
  Minus,
  Rocket,
  Star,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * One source of truth for how a work item's type, status and priority look.
 *
 * These three maps were previously redeclared in the board card, the list
 * view, the backlog, the filter bar and the detail dialog — five copies that
 * had already drifted (the list omitted two types, the board and the backlog
 * disagreed on the bug icon). Rendering them from one place is what makes the
 * same item recognisable wherever you meet it.
 */

/* ------------------------------------------------------------------ */
/*  Type                                                               */
/* ------------------------------------------------------------------ */

const TYPE_ICONS: Record<string, React.ElementType> = {
  epic: Layers,
  feature: Flag,
  story: Star,
  task: CheckCircle2,
  dev_task: CheckCircle2,
  qc_task: CircleDot,
  bug: Bug,
  prod_bug: Bug,
  issue: CircleDot,
  design_doc: Rocket,
  release_item: PackageCheck,
}

const TYPE_COLORS: Record<string, string> = {
  epic: 'text-type-epic',
  feature: 'text-type-feature',
  story: 'text-type-story',
  task: 'text-type-task',
  dev_task: 'text-type-dev-task',
  qc_task: 'text-type-qc-task',
  bug: 'text-type-bug',
  prod_bug: 'text-type-prod-bug',
  issue: 'text-type-issue',
  design_doc: 'text-type-design-doc',
  release_item: 'text-type-release-item',
}

/** Turns `prod_bug` into `Prod Bug` for anything without a configured label. */
export function humanizeKey(key: string): string {
  return key
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getTypeIcon(type: string): React.ElementType {
  return TYPE_ICONS[type?.toLowerCase()] ?? CircleDot
}

/**
 * The type icon, with its name attached.
 *
 * A bare coloured glyph in a table column is a quiz: the board and list views
 * both showed one with no label and no tooltip, so telling a story from an
 * epic meant learning eleven icons. The tooltip is the fix that costs no
 * horizontal space.
 */
export function TypeIcon({
  type,
  label,
  className,
  withTooltip = true,
}: {
  type: string
  label?: string
  className?: string
  withTooltip?: boolean
}) {
  const key = type?.toLowerCase()
  // Read straight out of the module-level map rather than through a helper:
  // a component returned from a function call is a new component identity on
  // every render as far as the linter (and React's reconciler) can tell.
  const Icon = TYPE_ICONS[key] ?? CircleDot
  const name = label ?? humanizeKey(type)
  const icon = (
    <Icon
      className={cn('size-3.5 shrink-0', TYPE_COLORS[key] ?? 'text-muted-foreground', className)}
      aria-hidden={withTooltip ? 'true' : undefined}
      aria-label={withTooltip ? undefined : name}
    />
  )

  if (!withTooltip) return icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={-1}>
          <span className="sr-only">{name}</span>
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{name}</TooltipContent>
    </Tooltip>
  )
}

/* ------------------------------------------------------------------ */
/*  Status                                                             */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<string, { dot: string; chip: string }> = {
  backlog: { dot: 'bg-status-backlog-bar', chip: 'bg-status-backlog-bg text-status-backlog' },
  todo: { dot: 'bg-status-todo-bar', chip: 'bg-status-todo-bg text-status-todo' },
  in_progress: { dot: 'bg-status-in-progress-bar', chip: 'bg-status-in-progress-bg text-status-in-progress' },
  in_review: { dot: 'bg-status-in-review-bar', chip: 'bg-status-in-review-bg text-status-in-review' },
  done: { dot: 'bg-status-done-bar', chip: 'bg-status-done-bg text-status-done' },
  cancelled: { dot: 'bg-status-cancelled-bar', chip: 'bg-status-cancelled-bg text-status-cancelled' },
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status?.toLowerCase()] ?? humanizeKey(status ?? '')
}

export function getStatusDotClass(status: string): string {
  return STATUS_TONE[status?.toLowerCase()]?.dot ?? 'bg-muted-foreground'
}

/**
 * `dot` for tables, where forty tinted chips down a column turn the page into
 * confetti and the eye stops reading any of them. `chip` for the places a
 * status has to be found rather than scanned — a card, a detail header.
 */
export function StatusBadge({
  status,
  label,
  variant = 'chip',
  className,
}: {
  status: string
  label?: string
  variant?: 'chip' | 'dot'
  className?: string
}) {
  const key = status?.toLowerCase()
  const tone = STATUS_TONE[key] ?? { dot: 'bg-muted-foreground', chip: 'bg-muted text-muted-foreground' }
  const text = label ?? getStatusLabel(status)

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-foreground', className)}>
        <span className={cn('size-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden="true" />
        {text}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-px text-[11px] font-medium',
        tone.chip,
        className
      )}
    >
      {text}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Priority                                                           */
/* ------------------------------------------------------------------ */

const PRIORITY_META: Record<
  string,
  { label: string; color: string; icon: React.ElementType; rank: number }
> = {
  highest: { label: 'Highest', color: 'text-priority-highest', icon: ChevronsUp, rank: 5 },
  high: { label: 'High', color: 'text-priority-high', icon: ChevronUp, rank: 4 },
  medium: { label: 'Medium', color: 'text-priority-medium', icon: Minus, rank: 3 },
  low: { label: 'Low', color: 'text-priority-low', icon: ChevronDown, rank: 2 },
  lowest: { label: 'Lowest', color: 'text-priority-lowest', icon: ChevronsDown, rank: 1 },
}

export function getPriorityLabel(priority: string): string {
  return PRIORITY_META[priority?.toLowerCase()]?.label ?? humanizeKey(priority ?? '')
}

/**
 * Priority is an ordered scale, so it gets a shape that encodes the order —
 * a double chevron up through a double chevron down. Colour alone could not
 * do that job: the five previous colours were unordered, and to anyone with a
 * red/green deficiency "Highest" and "Low" were the same swatch.
 */
export function PriorityIndicator({
  priority,
  showLabel = true,
  className,
}: {
  priority: string
  showLabel?: boolean
  className?: string
}) {
  const key = priority?.toLowerCase()
  const meta = PRIORITY_META[key]
  const label = meta?.label ?? humanizeKey(priority ?? '')
  const Icon = meta?.icon ?? Minus

  const content = (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium',
        meta?.color ?? 'text-muted-foreground',
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  )

  if (showLabel) return content

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{content}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{`Priority: ${label}`}</TooltipContent>
    </Tooltip>
  )
}

/** Sort helper so every view orders priority the same way. */
export function priorityRank(priority: string): number {
  return PRIORITY_META[priority?.toLowerCase()]?.rank ?? 0
}
