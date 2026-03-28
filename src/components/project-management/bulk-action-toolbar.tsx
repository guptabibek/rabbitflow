'use client'

import { useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  CheckSquare,
  Trash2,
  Tag,
  UserPlus,
  ArrowRight,
  X,
  Loader2,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkAction {
  type: 'update' | 'delete' | 'move'
  updates?: Record<string, unknown>
  targetProjectId?: string
}

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const PRIORITY_OPTIONS = ['highest', 'high', 'medium', 'low', 'lowest'] as const

interface BulkToolbarProps {
  selectedIds: string[]
  onClearSelection: () => void
  onActionComplete: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionToolbar({
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkToolbarProps) {
  const { currentProject, users, labels, projects } = useAppStore()
  const [executing, setExecuting] = useState(false)

  if (selectedIds.length === 0) return null

  const executeBulkAction = async (action: BulkAction) => {
    if (!currentProject) return
    setExecuting(true)
    try {
      const body: Record<string, unknown> = {
        action: action.type,
        issueIds: selectedIds,
        projectId: currentProject.id,
      }
      if (action.type === 'update' && action.updates) {
        body.updates = action.updates
      }
      if (action.type === 'move' && action.targetProjectId) {
        body.targetProjectId = action.targetProjectId
      }

      const res = await fetch('/api/issues/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to apply bulk action'))
      }

      onActionComplete()
      onClearSelection()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply bulk action')
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-sm" data-testid="bulk-action-toolbar">
      <Badge variant="secondary" className="gap-1">
        <CheckSquare className="h-3 w-3" />
        {selectedIds.length} selected
      </Badge>

      {/* Assign */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" disabled={executing} data-testid="bulk-assign-trigger">
            <UserPlus className="h-3 w-3" />
            Assign
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Assign to
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {users.map((u) => (
            <DropdownMenuItem
              key={u.id}
              onClick={() => executeBulkAction({ type: 'update', updates: { assigneeId: u.id } })}
              data-testid={`bulk-assign-user-${u.id}`}
            >
              {u.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => executeBulkAction({ type: 'update', updates: { assigneeId: null } })}
            data-testid="bulk-assign-unassigned"
          >
            Unassign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" disabled={executing} data-testid="bulk-status-trigger">
            Status
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Set status
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((status) => (
            <DropdownMenuItem
              key={status.value}
              onClick={() => executeBulkAction({ type: 'update', updates: { status: status.value } })}
              data-testid={`bulk-status-${status.value}`}
            >
              {status.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" disabled={executing} data-testid="bulk-priority-trigger">
            Priority
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PRIORITY_OPTIONS.map((priority) => (
            <DropdownMenuItem
              key={priority}
              onClick={() => executeBulkAction({ type: 'update', updates: { priority } })}
              data-testid={`bulk-priority-${priority}`}
            >
              {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Labels */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" disabled={executing} data-testid="bulk-label-trigger">
            <Tag className="h-3 w-3" />
            Label
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Add label
          </DropdownMenuLabel>
          {labels.map((l) => (
            <DropdownMenuItem
              key={l.id}
              onClick={() =>
                executeBulkAction({
                  type: 'update',
                  updates: { addLabelIds: [l.id] },
                })
              }
              data-testid={`bulk-add-label-${l.id}`}
            >
              <div
                className="mr-2 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Remove label
          </DropdownMenuLabel>
          {labels.map((l) => (
            <DropdownMenuItem
              key={`rm-${l.id}`}
              onClick={() =>
                executeBulkAction({
                  type: 'update',
                  updates: { removeLabelIds: [l.id] },
                })
              }
              className="text-muted-foreground"
              data-testid={`bulk-remove-label-${l.id}`}
            >
              <div
                className="mr-2 h-2.5 w-2.5 rounded-full opacity-50"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Move */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" disabled={executing} data-testid="bulk-move-trigger">
            <ArrowRight className="h-3 w-3" />
            Move
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Move to project
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects
            .filter((p) => p.id !== currentProject?.id && !p.isArchived)
            .map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() =>
                  executeBulkAction({ type: 'move', targetProjectId: p.id })
                }
                data-testid={`bulk-move-project-${p.id}`}
              >
                <div
                  className="mr-2 h-3 w-3 rounded-sm"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete */}
      <Button
        variant="outline"
        size="sm"
        className="gap-1 h-7 text-xs text-destructive hover:text-destructive"
        disabled={executing}
        onClick={() => executeBulkAction({ type: 'delete' })}
        data-testid="bulk-delete-button"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </Button>

      {executing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

      <Button
        variant="ghost"
        size="icon"
        className="ml-auto h-6 w-6"
        onClick={onClearSelection}
        data-testid="bulk-clear-selection-button"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
