/**
 * Centralized design-token style maps for work-item types, statuses,
 * priorities, roles, and other repeated colour patterns.
 *
 * Every value references a Tailwind utility that is wired to a CSS custom
 * property defined in globals.css, so light/dark mode works automatically.
 */

import { normalizeStateCategory } from '@/lib/domain/state-categories'

/* ------------------------------------------------------------------ */
/*  Work-item TYPE styles                                             */
/* ------------------------------------------------------------------ */

export const TYPE_STYLES: Record<string, { text: string; bg: string }> = {
  epic:         { text: 'text-type-epic',         bg: 'bg-type-epic-bg' },
  feature:      { text: 'text-type-feature',      bg: 'bg-type-feature-bg' },
  story:        { text: 'text-type-story',        bg: 'bg-type-story-bg' },
  task:         { text: 'text-type-task',          bg: 'bg-type-task-bg' },
  dev_task:     { text: 'text-type-dev-task',      bg: 'bg-type-dev-task-bg' },
  qc_task:      { text: 'text-type-qc-task',       bg: 'bg-type-qc-task-bg' },
  bug:          { text: 'text-type-bug',           bg: 'bg-type-bug-bg' },
  prod_bug:     { text: 'text-type-prod-bug',      bg: 'bg-type-prod-bug-bg' },
  issue:        { text: 'text-type-issue',         bg: 'bg-type-issue-bg' },
  design_doc:   { text: 'text-type-design-doc',    bg: 'bg-type-design-doc-bg' },
  release_item: { text: 'text-type-release-item',  bg: 'bg-type-release-item-bg' },
}

export function getTypeText(name: string): string {
  return TYPE_STYLES[name.toLowerCase()]?.text ?? 'text-muted-foreground'
}

export function getTypeBg(name: string): string {
  return TYPE_STYLES[name.toLowerCase()]?.bg ?? 'bg-muted'
}

/* ------------------------------------------------------------------ */
/*  STATUS styles                                                     */
/* ------------------------------------------------------------------ */

export const STATUS_STYLES: Record<string, { text: string; bg: string; bar: string }> = {
  backlog:     { text: 'text-status-backlog',      bg: 'bg-status-backlog-bg',      bar: 'bg-status-backlog-bar' },
  todo:        { text: 'text-status-todo',         bg: 'bg-status-todo-bg',         bar: 'bg-status-todo-bar' },
  in_progress: { text: 'text-status-in-progress',  bg: 'bg-status-in-progress-bg',  bar: 'bg-status-in-progress-bar' },
  in_review:   { text: 'text-status-in-review',    bg: 'bg-status-in-review-bg',    bar: 'bg-status-in-review-bar' },
  done:        { text: 'text-status-done',         bg: 'bg-status-done-bg',         bar: 'bg-status-done-bar' },
  cancelled:   { text: 'text-status-cancelled',    bg: 'bg-status-cancelled-bg',    bar: 'bg-status-cancelled-bar' },
}

export function getStatusClasses(category: string): string {
  const s = STATUS_STYLES[category.toLowerCase()]
  return s ? `${s.bg} ${s.text}` : 'bg-muted text-muted-foreground'
}

export function getStatusBar(category: string): string {
  return STATUS_STYLES[category.toLowerCase()]?.bar ?? 'bg-muted-foreground'
}

export function getStatusDot(category: string): string {
  return STATUS_STYLES[category.toLowerCase()]?.bar ?? 'bg-muted-foreground'
}

/* ------------------------------------------------------------------ */
/*  PRIORITY styles                                                   */
/* ------------------------------------------------------------------ */

export const PRIORITY_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  highest: { text: 'text-priority-highest', bg: 'bg-priority-highest-bg', label: 'Highest' },
  high:    { text: 'text-priority-high',    bg: 'bg-priority-high-bg',    label: 'High' },
  medium:  { text: 'text-priority-medium',  bg: 'bg-priority-medium-bg',  label: 'Medium' },
  low:     { text: 'text-priority-low',     bg: 'bg-priority-low-bg',     label: 'Low' },
  lowest:  { text: 'text-priority-lowest',  bg: 'bg-priority-lowest-bg',  label: 'Lowest' },
}

export function getPriorityText(level: string): string {
  return PRIORITY_STYLES[level.toLowerCase()]?.text ?? 'text-muted-foreground'
}

export function getPriorityBg(level: string): string {
  return PRIORITY_STYLES[level.toLowerCase()]?.bg ?? 'bg-muted'
}

/* ------------------------------------------------------------------ */
/*  ROLE styles                                                       */
/* ------------------------------------------------------------------ */

export const ROLE_STYLES: Record<string, { text: string; bg: string }> = {
  Admin:  { text: 'text-role-admin',  bg: 'bg-role-admin-bg' },
  PM:     { text: 'text-role-pm',     bg: 'bg-role-pm-bg' },
  Dev:    { text: 'text-role-dev',    bg: 'bg-role-dev-bg' },
  QA:     { text: 'text-role-qa',     bg: 'bg-role-qa-bg' },
  Viewer: { text: 'text-role-viewer', bg: 'bg-role-viewer-bg' },
}

export function getRoleTone(role: string): string {
  const s = ROLE_STYLES[role]
  return s ? `${s.bg} ${s.text}` : 'bg-muted text-muted-foreground'
}

/* ------------------------------------------------------------------ */
/*  CATEGORY BADGE (state category in admin config)                   */
/* ------------------------------------------------------------------ */

export function getCategoryBadge(category: string): string {
  const normalized = normalizeStateCategory(category)

  if (normalized === 'Completed')  return 'bg-category-done-bg text-category-done border-0'
  if (normalized === 'In Progress') return 'bg-category-active-bg text-category-active border-0'
  return 'bg-category-default-bg text-category-default border-0'
}

/* ------------------------------------------------------------------ */
/*  Preset colour palettes (user-facing pickers – hex is fine)        */
/* ------------------------------------------------------------------ */

export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#78716c',
] as const

export const PROJECT_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#1d4ed8', '#64748b',
] as const

export const PIE_COLORS = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)',
  'var(--chart-4)', 'var(--chart-5)', 'var(--type-issue)',
] as const

export const DEFAULT_TEAM_COLOR = '#0f766e'
