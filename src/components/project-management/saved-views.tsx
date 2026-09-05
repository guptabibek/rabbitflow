'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Bookmark, BookmarkPlus, Check, Trash2, Users } from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'
import { hasActiveFilters } from '@/lib/domain/issue-filters'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'

/**
 * Saved filter views.
 *
 * `SavedView` and full CRUD at /api/views have existed all along — model,
 * sharing flag, ordering, per-user scoping — with no interface anywhere. The
 * feature was invisible, so anyone wanting a recurring filter re-applied it by
 * hand every time.
 */

type SavedView = {
  id: string
  name: string
  viewType: string
  filters: Record<string, unknown>
  isShared: boolean
  userId: string
  user?: { id: string; name: string | null }
}

export function SavedViews() {
  const { currentProject, currentUser, filters, setFilters, workItemTypeFilter } = useAppStore()

  const [views, setViews] = useState<SavedView[]>([])
  const [isSaveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [appliedViewId, setAppliedViewId] = useState<string | null>(null)

  const deleteConfirm = useDestructiveConfirm<SavedView>()

  const load = useCallback(async () => {
    if (!currentProject) return

    try {
      const response = await fetch(`/api/views?projectId=${currentProject.id}`)
      if (!response.ok) {
        // A failure here should not break the filter bar around it.
        setViews([])
        return
      }
      const data = await response.json()
      setViews(Array.isArray(data) ? data : [])
    } catch {
      setViews([])
    }
  }, [currentProject])

  useEffect(() => {
    void load()
  }, [load])

  const applyView = useCallback(
    (view: SavedView) => {
      const saved = view.filters as Partial<typeof filters> & { workItemType?: string }

      setFilters({
        assigneeId: saved.assigneeId ?? null,
        priority: saved.priority ?? null,
        type: saved.type ?? null,
        search: saved.search ?? '',
        sprintId: saved.sprintId ?? null,
        iterationId: saved.iterationId ?? null,
        areaId: saved.areaId ?? null,
        labelIds: Array.isArray(saved.labelIds) ? saved.labelIds : [],
      })

      setAppliedViewId(view.id)
      toast.success(`Applied "${view.name}"`)
    },
    [setFilters]
  )

  const save = useCallback(async () => {
    if (!currentProject || !name.trim()) return

    setIsSaving(true)
    try {
      const response = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          name: name.trim(),
          viewType: 'list',
          // Stored as-is so applying a view restores exactly what was active,
          // including the work-item type tab.
          filters: { ...filters, workItemType: workItemTypeFilter },
          isShared,
        }),
      })

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to save view'))
      }

      setSaveOpen(false)
      setName('')
      setIsShared(false)
      await load()
      toast.success('View saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save view')
    } finally {
      setIsSaving(false)
    }
  }, [currentProject, filters, isShared, load, name, workItemTypeFilter])

  const remove = useCallback(
    async (viewId: string) => {
      try {
        const response = await fetch(`/api/views/${viewId}`, { method: 'DELETE' })
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, 'Failed to delete view'))
        }
        if (appliedViewId === viewId) setAppliedViewId(null)
        await load()
        toast.success('View deleted')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete view')
      }
    },
    [appliedViewId, load]
  )

  if (!currentProject) return null

  const canSave = hasActiveFilters(filters, { workItemTypeTab: workItemTypeFilter })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Bookmark className="h-3.5 w-3.5" />
            Views
            {views.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">{views.length}</span>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs">Saved views</DropdownMenuLabel>

          {views.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No saved views yet. Apply some filters, then save them here to reuse later.
            </p>
          ) : (
            views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                className="flex items-center gap-2 text-xs"
                onSelect={() => applyView(view)}
              >
                {appliedViewId === view.id ? (
                  <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                )}

                <span className="flex-1 truncate">{view.name}</span>

                {view.isShared && (
                  <Users
                    className="h-3 w-3 flex-shrink-0 text-muted-foreground"
                    aria-label="Shared with the project"
                  />
                )}

                {/* Only the owner may delete; shared views belong to whoever made them. */}
                {view.userId === currentUser?.id && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                    aria-label={`Delete view ${view.name}`}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      deleteConfirm.request(view)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </DropdownMenuItem>
            ))
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="gap-2 text-xs"
            disabled={!canSave}
            onSelect={(event) => {
              event.preventDefault()
              setSaveOpen(true)
            }}
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            {canSave ? 'Save current filters' : 'Apply a filter to save a view'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isSaveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save current filters as a view</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="saved-view-name">Name</Label>
              <Input
                id="saved-view-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. My open bugs"
                maxLength={100}
                autoFocus
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={isShared}
                onCheckedChange={(checked) => setIsShared(checked === true)}
                className="mt-0.5"
              />
              <span>
                Share with the project
                <span className="block text-xs text-muted-foreground">
                  Everyone with access to this project can apply it. Only you can delete it.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={isSaving || !name.trim()}>
              {isSaving ? 'Saving…' : 'Save view'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title={`Delete view "${deleteConfirm.target?.name ?? ''}"?`}
        description={
          deleteConfirm.target?.isShared
            ? 'This view is shared, so it will disappear for everyone in the project. This cannot be undone.'
            : 'This cannot be undone. The work items themselves are not affected.'
        }
        onConfirm={async () => {
          if (deleteConfirm.target) await remove(deleteConfirm.target.id)
        }}
      />
    </>
  )
}
