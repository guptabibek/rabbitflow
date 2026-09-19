'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Target,
  Plus,
  ChevronRight,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'
import { ErrorState, InlineAlert } from '@/components/ui/states'

type KeyResult = {
  id: string
  title: string
  currentValue: number
  targetValue: number
  unit: string
  status: string
}

type Objective = {
  id: string
  title: string
  description: string | null
  status: string
  startDate: string | null
  endDate: string | null
  progress: number
  keyResults: KeyResult[]
  owner: { id: string; name: string } | null
  _count?: { keyResults: number }
}

export function ObjectivesView() {
  const { currentProject } = useAppStore()
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createObjOpen, setCreateObjOpen] = useState(false)
  const [createKROpen, setCreateKROpen] = useState(false)
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newKRTitle, setNewKRTitle] = useState('')
  const [newKRTarget, setNewKRTarget] = useState(100)
  const [newKRUnit, setNewKRUnit] = useState('%')
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [objectiveError, setObjectiveError] = useState<string | null>(null)
  const [objectiveTitleError, setObjectiveTitleError] = useState<string | null>(null)
  const [keyResultError, setKeyResultError] = useState<string | null>(null)
  const [keyResultFieldErrors, setKeyResultFieldErrors] = useState<Partial<Record<'title' | 'target' | 'unit', string>>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const projectId = currentProject?.id

  const fetchObjectives = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/objectives?projectId=${projectId}`)
      if (!res.ok) {
        setLoadError(await getApiErrorMessage(res, 'Failed to load objectives'))
        setObjectives([])
        return
      }

      setObjectives(await res.json())
    } catch {
      setLoadError('Failed to load objectives')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchObjectives() }, [fetchObjectives])

  const createObjective = async () => {
    if (!projectId) return
    if (!newTitle.trim()) {
      setObjectiveTitleError('Enter an objective title.')
      return
    }
    setObjectiveTitleError(null)
    setObjectiveError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title: newTitle.trim(),
          description: newDesc.trim() || null,
        }),
      })

      if (!res.ok) {
        setObjectiveError(await getApiErrorMessage(res, 'Failed to create objective'))
        return
      }

      setNewTitle('')
      setNewDesc('')
      setCreateObjOpen(false)
      await fetchObjectives()
      toast.success('Objective created')
    } catch {
      setObjectiveError('Failed to create objective')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addKeyResult = async () => {
    if (!selectedObjId) return
    const nextErrors: typeof keyResultFieldErrors = {}
    if (!newKRTitle.trim()) nextErrors.title = 'Enter a key result title.'
    if (Number.isNaN(newKRTarget) || newKRTarget < 0) {
      nextErrors.target = 'Enter a target of zero or greater.'
    }
    if (!newKRUnit.trim()) nextErrors.unit = 'Enter a unit.'
    setKeyResultFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setKeyResultError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectiveId: selectedObjId,
          title: newKRTitle.trim(),
          targetValue: newKRTarget,
          unit: newKRUnit.trim(),
        }),
      })

      if (!res.ok) {
        setKeyResultError(await getApiErrorMessage(res, 'Failed to add key result'))
        return
      }

      setNewKRTitle('')
      setNewKRTarget(100)
      setNewKRUnit('%')
      setCreateKROpen(false)
      await fetchObjectives()
      toast.success('Key result added')
    } catch {
      setKeyResultError('Failed to add key result')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateKRValue = async (krId: string, currentValue: number) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/key-results/${krId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue }),
      })

      if (!res.ok) {
        setActionError(await getApiErrorMessage(res, 'Failed to update key result'))
        return
      }

      await fetchObjectives()
    } catch {
      setActionError('Failed to update key result')
    }
  }

  const deleteObjective = async () => {
    if (!pendingDelete) return

    setIsSubmitting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/objectives/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        setDeleteError(await getApiErrorMessage(res, 'Failed to delete objective'))
        return
      }

      setPendingDelete(null)
      await fetchObjectives()
      toast.success('Objective deleted')
    } catch {
      setDeleteError('Failed to delete objective')
    } finally {
      setIsSubmitting(false)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-info/10 text-info border-info/20'
      case 'completed': return 'bg-success/10 text-success border-success/20'
      case 'cancelled': return 'bg-danger/10 text-danger border-danger/20'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a project to view objectives
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Objectives & Key Results
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Track team goals and measure progress</p>
        </div>
        <Button
          onClick={() => {
            setObjectiveError(null)
            setObjectiveTitleError(null)
            setCreateObjOpen(true)
          }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          New Objective
        </Button>
      </div>

      {actionError ? (
        <div data-testid="objective-action-error">
          <InlineAlert tone="danger">{actionError}</InlineAlert>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-32" />
          ))}
        </div>
      ) : loadError ? (
        <ErrorState
          title="Objectives did not load"
          description="The goals and key results could not be read. Nothing has changed."
          detail={loadError}
          onRetry={() => void fetchObjectives()}
          size="sm"
        />
      ) : objectives.length === 0 ? (
        <Card className="py-16 text-center">
          <Target className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">No objectives yet. Create your first OKR!</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {objectives.map((obj) => (
            <Card key={obj.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{obj.title}</CardTitle>
                      <Badge variant="outline" className={`text-[10px] ${statusColor(obj.status)}`}>
                        {obj.status}
                      </Badge>
                    </div>
                    {obj.description && (
                      <p className="text-sm text-muted-foreground mt-1">{obj.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right mr-4">
                      <div className="text-2xl font-bold">{obj.progress}%</div>
                      <div className="text-xs text-muted-foreground">progress</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Add key result"
                      onClick={() => {
                        setSelectedObjId(obj.id)
                        setKeyResultError(null)
                        setKeyResultFieldErrors({})
                        setCreateKROpen(true)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                          aria-label="Delete objective"
                      onClick={() => {
                        setDeleteError(null)
                        setPendingDelete({ id: obj.id, title: obj.title })
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Progress value={obj.progress} className="mt-2 h-1.5" />
              </CardHeader>
              {obj.keyResults.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {obj.keyResults.map((kr) => {
                      const pct = kr.targetValue > 0 ? Math.round((kr.currentValue / kr.targetValue) * 100) : 0
                      return (
                        <div key={kr.id} className="flex items-center gap-3 py-2 border-t first:border-t-0">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{kr.title}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <Progress value={pct} className="flex-1 h-1" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {kr.currentValue}/{kr.targetValue} {kr.unit}
                              </span>
                            </div>
                          </div>
                          <Input
                            type="number"
                            defaultValue={kr.currentValue}
                            className="w-20 h-7 text-sm"
                            min={0}
                            max={kr.targetValue * 2}
                            onBlur={(e) => {
                              const val = Number.parseFloat(e.target.value)
                              if (Number.isNaN(val) || val < 0) {
                                setActionError('Key result progress must be zero or greater.')
                              } else if (val !== kr.currentValue) {
                                updateKRValue(kr.id, val)
                              }
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Objective Dialog */}
      <Dialog
        open={createObjOpen}
        onOpenChange={(open) => {
          setCreateObjOpen(open)
          if (!open) {
            setObjectiveError(null)
            setObjectiveTitleError(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Objective</DialogTitle>
            <DialogDescription>
              Define the outcome this project should achieve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {objectiveError ? (
              <div data-testid="objective-create-error">
                <InlineAlert tone="danger">{objectiveError}</InlineAlert>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="objective-title" className="text-sm font-medium">Title</label>
              <Input
                id="objective-title"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value)
                  setObjectiveTitleError(null)
                  setObjectiveError(null)
                }}
                placeholder="What do you want to achieve?"
                aria-invalid={Boolean(objectiveTitleError)}
                aria-describedby={objectiveTitleError ? 'objective-title-error' : undefined}
                data-testid="objective-title-input"
              />
              {objectiveTitleError ? (
                <p id="objective-title-error" className="text-xs text-destructive">
                  {objectiveTitleError}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Why is this important?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateObjOpen(false)}>Cancel</Button>
            <Button onClick={createObjective} disabled={isSubmitting} data-testid="objective-create-submit">
              {isSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Key Result Dialog */}
      <Dialog
        open={createKROpen}
        onOpenChange={(open) => {
          setCreateKROpen(open)
          if (!open) {
            setKeyResultError(null)
            setKeyResultFieldErrors({})
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Key Result</DialogTitle>
            <DialogDescription>
              Add a measurable result that contributes to this objective.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {keyResultError ? (
              <div data-testid="key-result-create-error">
                <InlineAlert tone="danger">{keyResultError}</InlineAlert>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="key-result-title" className="text-sm font-medium">Title</label>
              <Input
                id="key-result-title"
                value={newKRTitle}
                onChange={(e) => {
                  setNewKRTitle(e.target.value)
                  setKeyResultFieldErrors((previous) => ({ ...previous, title: undefined }))
                  setKeyResultError(null)
                }}
                placeholder="Measurable outcome"
                aria-invalid={Boolean(keyResultFieldErrors.title)}
                aria-describedby={keyResultFieldErrors.title ? 'key-result-title-error' : undefined}
              />
              {keyResultFieldErrors.title ? (
                <p id="key-result-title-error" className="text-xs text-destructive">
                  {keyResultFieldErrors.title}
                </p>
              ) : null}
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium">Target</label>
                <Input
                  type="number"
                  value={newKRTarget}
                  onChange={(e) => {
                    setNewKRTarget(Number(e.target.value))
                    setKeyResultFieldErrors((previous) => ({ ...previous, target: undefined }))
                    setKeyResultError(null)
                  }}
                  aria-invalid={Boolean(keyResultFieldErrors.target)}
                />
                {keyResultFieldErrors.target ? (
                  <p className="text-xs text-destructive">{keyResultFieldErrors.target}</p>
                ) : null}
              </div>
              <div className="w-24 space-y-1.5">
                <label className="text-sm font-medium">Unit</label>
                <Input
                  value={newKRUnit}
                  onChange={(e) => {
                    setNewKRUnit(e.target.value)
                    setKeyResultFieldErrors((previous) => ({ ...previous, unit: undefined }))
                    setKeyResultError(null)
                  }}
                  aria-invalid={Boolean(keyResultFieldErrors.unit)}
                />
                {keyResultFieldErrors.unit ? (
                  <p className="text-xs text-destructive">{keyResultFieldErrors.unit}</p>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateKROpen(false)}>Cancel</Button>
            <Button onClick={addKeyResult} disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete objective?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This will permanently delete "${pendingDelete.title}" and all of its key results.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <InlineAlert tone="danger">{deleteError}</InlineAlert> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void deleteObjective()
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
