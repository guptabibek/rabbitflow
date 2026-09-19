'use client'

import { useState, useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tags,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'
import { PRESET_COLORS } from '@/lib/ui-tokens'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'
import { InlineAlert } from '@/components/ui/states'

export function LabelsManagement({
  trigger,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const { currentProject, currentProjectPermissions, labels, setLabels } = useAppStore()
  const [internalOpen, setInternalOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [createNameError, setCreateNameError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const canManageLabels = currentProjectPermissions.includes('masterdata:manage')
  const isOpen = open ?? internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen

  const handleCreate = async () => {
    if (!canManageLabels) {
      setCreateError('You do not have permission to manage labels.')
      return
    }

    if (!currentProject) return
    if (!name.trim()) {
      setCreateNameError('Enter a label name.')
      return
    }
    setCreateNameError(null)
    setCreateError(null)
    setIsCreating(true)
    try {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, name: name.trim(), color }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create label'))
      }

      const label = await res.json()
      setLabels([...labels, label])
      setName('')
      setColor('#6366f1')
      toast.success('Label created')
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create label')
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async (id: string) => {
    if (!canManageLabels) {
      setEditError('You do not have permission to manage labels.')
      return
    }

    if (!editName.trim()) {
      setEditError('Enter a label name.')
      return
    }

    setEditError(null)
    setIsUpdating(true)
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update label'))
      }

      setLabels(labels.map((l) => (l.id === id ? { ...l, name: editName.trim(), color: editColor } : l)))
      setEditingId(null)
      toast.success('Label updated')
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update label')
    } finally {
      setIsUpdating(false)
    }
  }

  const deleteConfirm = useDestructiveConfirm<{ id: string; name: string }>()

  const handleDelete = async (id: string) => {
    if (!canManageLabels) {
      return 'You do not have permission to manage labels.'
    }

    try {
      const res = await fetch(`/api/labels/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to delete label'))
      }

      setLabels(labels.filter((l) => l.id !== id))
      toast.success('Label deleted')
      return true
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to delete label'
    }
  }

  if (!currentProject) return null

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/*
        A caller that drives `open` itself does not want a trigger, and
        rendering the fallback anyway put a stray "Labels" button in the
        document flow — it surfaced as an unstyled control floating past the
        user menu on desktop and overflowing the viewport on mobile, because
        the workspace shell mounts this dialog as a bare sibling of the layout.
      */}
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : open === undefined ? (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Tags />
            Labels
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="flex max-h-[82vh] max-w-lg flex-col gap-0 overflow-hidden p-0" data-testid="labels-management-dialog">
        <DialogHeader className="flex-shrink-0 border-b border-border/70 bg-background/95 px-4 py-4 backdrop-blur md:px-5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Tags className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div>Manage Labels</div>
            </div>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Create, rename, recolor, and remove work item labels for this project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-shrink-0 border-b border-border/70 bg-muted/20 px-4 py-4 md:px-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="space-y-3">
              {createError ? (
                <div data-testid="label-create-error">
                  <InlineAlert tone="danger">{createError}</InlineAlert>
                </div>
              ) : null}
              <Input
                placeholder="Label name..."
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setCreateNameError(null)
                  setCreateError(null)
                }}
                className="h-9 w-full"
                disabled={!canManageLabels}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                aria-label="Label name"
                aria-invalid={Boolean(createNameError)}
                aria-describedby={createNameError ? 'label-create-name-error' : undefined}
                data-testid="label-create-name-input"
              />
              {createNameError ? (
                <p id="label-create-name-error" className="text-xs text-destructive">
                  {createNameError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-5 w-5 rounded-md transition-all ${
                      color === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                    disabled={!canManageLabels}
                    aria-label={`Select ${c} as label color`}
                  />
                ))}
              </div>
            </div>
            <Button
              size="sm"
              className="h-9 px-4 sm:self-start"
              onClick={handleCreate}
              disabled={isCreating || !canManageLabels}
              data-testid="label-create-submit"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 md:p-4">
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Existing Labels</p>
                <p className="text-xs text-muted-foreground">{labels.length} configured label{labels.length === 1 ? '' : 's'}</p>
              </div>
              {labels.length > 0 ? <Badge variant="secondary" className="h-5 px-2 text-[10px]">{labels.length}</Badge> : null}
            </div>
            <div className="space-y-1.5">
            {editError ? (
              <div data-testid="label-edit-error">
                <InlineAlert tone="danger">{editError}</InlineAlert>
              </div>
            ) : null}
            {labels.map((label) => (
              <div
                key={label.id}
                className="group flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/70 px-3 py-2.5 shadow-sm transition-colors hover:bg-muted/30"
              >
                {editingId === label.id ? (
                  <>
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0 cursor-pointer"
                      style={{ backgroundColor: editColor }}
                    />
                    <Input
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value)
                        setEditError(null)
                      }}
                      className="h-8 flex-1 text-sm"
                      disabled={!canManageLabels}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate(label.id)}
                      aria-label={`Edit ${label.name} label name`}
                      aria-invalid={Boolean(editError)}
                    />
                    <div className="flex gap-1">
                      {PRESET_COLORS.slice(0, 5).map((c) => (
                        <button
                          key={c}
                          className={`h-4 w-4 rounded-full ${editColor === c ? 'ring-1 ring-primary' : ''}`}
                          style={{ backgroundColor: c }}
                          disabled={!canManageLabels}
                          onClick={() => setEditColor(c)}
                        />
                      ))}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Save label" onClick={() => handleUpdate(label.id)} disabled={!canManageLabels || isUpdating}>
                      <Check className="h-3 w-3 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Cancel editing" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="flex-1 truncate text-sm font-medium">{label.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit label"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      disabled={!canManageLabels}
                      onClick={() => {
                        setEditingId(label.id)
                        setEditName(label.name)
                        setEditColor(label.color)
                        setEditError(null)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete label"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      disabled={!canManageLabels}
                      onClick={() => deleteConfirm.request(label)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
            </div>
            {labels.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 py-10 text-center">
                <Tags className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No labels yet</p>
                <p className="text-xs text-muted-foreground">Create labels above to categorize work items</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title={`Delete label "${deleteConfirm.target?.name ?? ''}"?`}
        description="This label will be removed from every work item currently using it. This cannot be undone."
        onConfirm={() =>
          deleteConfirm.target ? handleDelete(deleteConfirm.target.id) : false
        }
      />
    </Dialog>
  )
}
