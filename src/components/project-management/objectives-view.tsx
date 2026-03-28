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

  const projectId = currentProject?.id

  const fetchObjectives = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/objectives?projectId=${projectId}`)
      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to load objectives'))
        setObjectives([])
        return
      }

      setObjectives(await res.json())
    } catch {
      toast.error('Failed to load objectives')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchObjectives() }, [fetchObjectives])

  const createObjective = async () => {
    if (!projectId || !newTitle.trim()) return
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
        toast.error(await getApiErrorMessage(res, 'Failed to create objective'))
        return
      }

      setNewTitle('')
      setNewDesc('')
      setCreateObjOpen(false)
      await fetchObjectives()
      toast.success('Objective created')
    } catch {
      toast.error('Failed to create objective')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addKeyResult = async () => {
    if (!selectedObjId || !newKRTitle.trim()) return
    if (Number.isNaN(newKRTarget) || newKRTarget < 0) {
      toast.error('Key result target must be zero or greater')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectiveId: selectedObjId,
          title: newKRTitle.trim(),
          targetValue: newKRTarget,
          unit: newKRUnit,
        }),
      })

      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to add key result'))
        return
      }

      setNewKRTitle('')
      setNewKRTarget(100)
      setNewKRUnit('%')
      setCreateKROpen(false)
      await fetchObjectives()
      toast.success('Key result added')
    } catch {
      toast.error('Failed to add key result')
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateKRValue = async (krId: string, currentValue: number) => {
    try {
      const res = await fetch(`/api/key-results/${krId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentValue }),
      })

      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to update key result'))
        return
      }

      await fetchObjectives()
    } catch {
      toast.error('Failed to update key result')
    }
  }

  const deleteObjective = async () => {
    if (!pendingDelete) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/objectives/${pendingDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to delete objective'))
        return
      }

      setPendingDelete(null)
      await fetchObjectives()
      toast.success('Objective deleted')
    } catch {
      toast.error('Failed to delete objective')
    } finally {
      setIsSubmitting(false)
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
      case 'completed': return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'cancelled': return 'bg-red-500/10 text-red-600 border-red-500/20'
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20'
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
        <Button onClick={() => setCreateObjOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Objective
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-32" />
          ))}
        </div>
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
                      onClick={() => { setSelectedObjId(obj.id); setCreateKROpen(true) }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setPendingDelete({ id: obj.id, title: obj.title })}
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
                              if (!Number.isNaN(val) && val !== kr.currentValue) {
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
      <Dialog open={createObjOpen} onOpenChange={setCreateObjOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Objective</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What do you want to achieve?"
              />
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
            <Button onClick={createObjective} disabled={!newTitle.trim() || isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Key Result Dialog */}
      <Dialog open={createKROpen} onOpenChange={setCreateKROpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Key Result</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newKRTitle}
                onChange={(e) => setNewKRTitle(e.target.value)}
                placeholder="Measurable outcome"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium">Target</label>
                <Input
                  type="number"
                  value={newKRTarget}
                  onChange={(e) => setNewKRTarget(Number(e.target.value))}
                />
              </div>
              <div className="w-24 space-y-1.5">
                <label className="text-sm font-medium">Unit</label>
                <Input
                  value={newKRUnit}
                  onChange={(e) => setNewKRUnit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateKROpen(false)}>Cancel</Button>
            <Button onClick={addKeyResult} disabled={!newKRTitle.trim() || isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete objective?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This will permanently delete "${pendingDelete.title}" and all of its key results.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteObjective} disabled={isSubmitting}>
              {isSubmitting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
