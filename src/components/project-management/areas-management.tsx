'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { ConfirmDestructiveDialog } from './confirm-destructive-dialog'
import { Check, CornerDownRight, FolderTree, Pencil, Plus, Trash2, X } from 'lucide-react'
import { getApiErrorMessage, parseJsonResponse } from '@/lib/utils'

/*
  Area administration.

  `/api/areas` has always supported the full set — list, create, rename,
  reparent, delete — and the only caller in the product was a `GET` that filled
  filter dropdowns. Areas are a first-class field on every work item and they
  scope ACL rules, so the practical position was that areas could be filtered
  by but never created except through a direct API call.

  Areas form a tree. The list is rendered flat but indented by depth, which
  keeps a deep hierarchy scannable without a collapsible tree widget nobody
  asked for.
*/

type Area = {
  id: string
  name: string
  parentId: string | null
  path: string
  projectId: string
}

const ROOT_VALUE = '__root__'
const MAX_DEPTH_FOR_INDENT = 6

/** Depth from the materialised path, so nesting does not need a second query. */
function depthOf(area: Area) {
  return Math.min(area.path.split('/').filter(Boolean).length - 1, MAX_DEPTH_FOR_INDENT)
}

export function AreasManagement() {
  const currentProject = useAppStore((state) => state.currentProject)
  const permissions = useAppStore((state) => state.currentProjectPermissions)
  const canManage = permissions.includes('masterdata:manage')

  const [areas, setAreas] = useState<Area[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState<string>(ROOT_VALUE)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const [pendingDelete, setPendingDelete] = useState<Area | null>(null)

  const projectId = currentProject?.id ?? null

  const load = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/areas?projectId=${encodeURIComponent(projectId)}`)

      if (!response.ok) {
        setError(await getApiErrorMessage(response, 'Failed to load areas'))
        return
      }

      const data = await parseJsonResponse<Area[] | null>(response, null)

      if (!Array.isArray(data)) {
        setError('Areas returned malformed data.')
        return
      }

      setAreas(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load areas')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  /** Sorted by path so a child always renders directly beneath its parent. */
  const ordered = useMemo(
    () => (areas ? [...areas].sort((a, b) => a.path.localeCompare(b.path)) : []),
    [areas]
  )

  const childCount = useCallback(
    (areaId: string) => (areas ?? []).filter((area) => area.parentId === areaId).length,
    [areas]
  )

  const handleCreate = async () => {
    const name = newName.trim()
    if (!projectId || !name) return

    setCreating(true)

    try {
      const response = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name,
          parentId: newParent === ROOT_VALUE ? null : newParent,
        }),
      })

      if (!response.ok) {
        toast.error(await getApiErrorMessage(response, 'Could not create the area'))
        return
      }

      setNewName('')
      setNewParent(ROOT_VALUE)
      toast.success(`Area "${name}" created`)
      await load()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not create the area')
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (area: Area) => {
    const name = editName.trim()

    if (!name || name === area.name) {
      setEditingId(null)
      return
    }

    setSavingId(area.id)

    try {
      const response = await fetch(`/api/areas/${area.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        toast.error(await getApiErrorMessage(response, 'Could not rename the area'))
        return
      }

      setEditingId(null)
      toast.success('Area renamed')
      await load()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not rename the area')
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (area: Area) => {
    try {
      const response = await fetch(`/api/areas/${area.id}`, { method: 'DELETE' })

      if (!response.ok) {
        toast.error(await getApiErrorMessage(response, 'Could not delete the area'))
        return
      }

      toast.success(`Area "${area.name}" deleted`)
      await load()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not delete the area')
    }
  }

  if (!currentProject) {
    return (
      <EmptyState
        icon={FolderTree}
        title="No project selected"
        description="Pick a project to manage its areas."
        size="sm"
      />
    )
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="rounded-xl border bg-card/70 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-area-name">Area name</Label>
              <Input
                id="new-area-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newName.trim() && !creating) void handleCreate()
                }}
                placeholder="Payments, Platform, Mobile…"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5 sm:w-56">
              <Label htmlFor="new-area-parent">Parent</Label>
              <Select value={newParent} onValueChange={setNewParent}>
                <SelectTrigger id="new-area-parent">
                  <SelectValue placeholder="Top level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_VALUE}>Top level</SelectItem>
                  {ordered.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" />
              {creating ? 'Adding…' : 'Add area'}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading areas">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Areas did not load"
          description="The area list could not be read. Nothing has changed."
          detail={error}
          onRetry={() => void load()}
          size="sm"
        />
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No areas yet"
          description={
            canManage
              ? 'Areas group work by part of the product — a component, a service, a squad. Add the first one above, then nest below it.'
              : 'Areas group work by part of the product. Someone with master-data permission can add them.'
          }
          size="sm"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="divide-y">
            {ordered.map((area) => {
              const depth = depthOf(area)
              const children = childCount(area.id)
              const isEditing = editingId === area.id

              return (
                <div
                  key={area.id}
                  className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/40"
                >
                  <div
                    className="flex min-w-0 flex-1 items-center gap-2"
                    style={{ paddingLeft: `${depth * 1.25}rem` }}
                  >
                    {depth > 0 ? (
                      <CornerDownRight
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                      />
                    ) : (
                      <FolderTree
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      />
                    )}

                    {isEditing ? (
                      <Input
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleRename(area)
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                        className="h-8 max-w-xs"
                        maxLength={120}
                        autoFocus
                        aria-label={`Rename ${area.name}`}
                      />
                    ) : (
                      <span className="truncate text-sm text-foreground">{area.name}</span>
                    )}

                    {children > 0 && !isEditing ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {children} sub-{children === 1 ? 'area' : 'areas'}
                      </span>
                    ) : null}
                  </div>

                  {canManage ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            disabled={savingId === area.id}
                            onClick={() => void handleRename(area)}
                            aria-label={`Save name for ${area.name}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setEditingId(null)}
                            aria-label={`Cancel renaming ${area.name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingId(area.id)
                              setEditName(area.name)
                            }}
                            aria-label={`Rename ${area.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-danger hover:text-danger"
                            onClick={() => setPendingDelete(area)}
                            aria-label={`Delete ${area.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ConfirmDestructiveDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : 'Delete area?'}
        description={
          pendingDelete ? (
            <>
              Work items assigned to this area keep their other fields but lose the area.
              {childCount(pendingDelete.id) > 0 ? (
                <>
                  {' '}
                  Its {childCount(pendingDelete.id)} sub-
                  {childCount(pendingDelete.id) === 1 ? 'area' : 'areas'} will move to the top
                  level rather than being deleted.
                </>
              ) : null}{' '}
              This cannot be undone.
            </>
          ) : null
        }
        onConfirm={async () => {
          if (pendingDelete) await handleDelete(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
