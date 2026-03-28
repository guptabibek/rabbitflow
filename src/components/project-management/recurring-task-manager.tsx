'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Repeat,
  Plus,
  Trash2,
  Pencil,
  Clock,
  CalendarDays,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types — aligned with Prisma schema (RecurringTask model)
// ---------------------------------------------------------------------------

interface RecurringTaskFromApi {
  id: string
  projectId: string
  templateTitle: string
  templateBody: string | null
  templateType: string
  templatePriority: string
  templateAssigneeId: string | null
  rrule: string
  timezone: string
  isActive: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  runCount: number
  createdAt: string
  createdBy?: { id: string; name: string } | null
}

// ---------------------------------------------------------------------------
// Frequency ↔ RRULE mapping
// ---------------------------------------------------------------------------

type FrequencyKey = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

const FREQ_OPTIONS: { key: FrequencyKey; label: string; rrule: string }[] = [
  { key: 'daily', label: 'Daily', rrule: 'FREQ=DAILY' },
  { key: 'weekly', label: 'Weekly', rrule: 'FREQ=WEEKLY' },
  { key: 'biweekly', label: 'Bi-weekly', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  { key: 'monthly', label: 'Monthly', rrule: 'FREQ=MONTHLY' },
  { key: 'quarterly', label: 'Quarterly', rrule: 'FREQ=MONTHLY;INTERVAL=3' },
]

function rruleToFreqKey(rrule: string): FrequencyKey {
  const match = FREQ_OPTIONS.find((o) => o.rrule === rrule)
  if (match) return match.key
  // Heuristic fallback
  const upper = rrule.toUpperCase()
  if (upper.includes('DAILY')) return 'daily'
  if (upper.includes('INTERVAL=2') && upper.includes('WEEKLY')) return 'biweekly'
  if (upper.includes('INTERVAL=3') && upper.includes('MONTHLY')) return 'quarterly'
  if (upper.includes('WEEKLY')) return 'weekly'
  if (upper.includes('MONTHLY')) return 'monthly'
  return 'weekly'
}

function freqKeyToRrule(key: FrequencyKey): string {
  return FREQ_OPTIONS.find((o) => o.key === key)?.rrule ?? 'FREQ=WEEKLY'
}

function rruleLabel(rrule: string): string {
  const match = FREQ_OPTIONS.find((o) => o.rrule === rrule)
  return match?.label ?? rrule
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RecurringTaskManager() {
  const { currentProject, users } = useAppStore()
  const [tasks, setTasks] = useState<RecurringTaskFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTask, setEditTask] = useState<RecurringTaskFromApi | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [workItemType, setWorkItemType] = useState('task')
  const [priority, setPriority] = useState('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [frequency, setFrequency] = useState<FrequencyKey>('weekly')

  const fetchTasks = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const res = await fetch(`/api/recurring-tasks?projectId=${encodeURIComponent(currentProject.id)}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load recurring tasks'))
      }
      const data = await res.json()
      setTasks(Array.isArray(data) ? data : data.tasks ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load recurring tasks')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const resetForm = () => {
    setTitle('')
    setBody('')
    setWorkItemType('task')
    setPriority('medium')
    setAssigneeId('')
    setFrequency('weekly')
  }

  const openEdit = (task: RecurringTaskFromApi) => {
    setEditTask(task)
    setTitle(task.templateTitle)
    setBody(task.templateBody ?? '')
    setWorkItemType(task.templateType)
    setPriority(task.templatePriority)
    setAssigneeId(task.templateAssigneeId ?? '')
    setFrequency(rruleToFreqKey(task.rrule))
  }

  const handleCreate = async () => {
    if (!currentProject || !title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/recurring-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          templateTitle: title.trim(),
          templateBody: body.trim() || null,
          templateType: workItemType,
          templatePriority: priority,
          templateAssigneeId: assigneeId || null,
          rrule: freqKeyToRrule(frequency),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create recurring task'))
      }
      setCreateOpen(false)
      resetForm()
      await fetchTasks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create recurring task')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!editTask) return
    setSaving(true)
    try {
      const res = await fetch(`/api/recurring-tasks/${editTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateTitle: title.trim(),
          templateBody: body.trim() || null,
          templateType: workItemType,
          templatePriority: priority,
          templateAssigneeId: assigneeId || null,
          rrule: freqKeyToRrule(frequency),
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update recurring task'))
      }
      setEditTask(null)
      resetForm()
      await fetchTasks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update recurring task')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (task: RecurringTaskFromApi) => {
    try {
      const res = await fetch(`/api/recurring-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !task.isActive }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update recurring task'))
      }

      await fetchTasks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update recurring task')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/recurring-tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to delete recurring task'))
      }

      await fetchTasks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete recurring task')
    }
  }

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a project to manage recurring tasks.
      </div>
    )
  }

  const formContent = (
    <div className="space-y-3 py-2">
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly standup notes" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={workItemType} onValueChange={setWorkItemType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="story">Story</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="highest">Highest</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="lowest">Lowest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as FrequencyKey)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQ_OPTIONS.map((o) => (
                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Assignee</Label>
          <Select value={assigneeId || 'none'} onValueChange={(v) => setAssigneeId(v === 'none' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recurring Tasks</h2>
          <p className="text-sm text-muted-foreground">
            Automatically create work items on a schedule.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Recurring Task</DialogTitle>
            </DialogHeader>
            {formContent}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!title.trim() || saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTask} onOpenChange={(open) => { if (!open) { setEditTask(null); resetForm() } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Recurring Task</DialogTitle>
          </DialogHeader>
          {formContent}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditTask(null); resetForm() }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!title.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Repeat className="mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No recurring tasks</p>
            <p className="text-sm">Create a schedule to auto-generate work items.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <Repeat className={`h-4 w-4 flex-shrink-0 ${task.isActive ? 'text-blue-500' : 'text-muted-foreground'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{task.templateTitle}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {rruleLabel(task.rrule)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {task.templateType}
                    </Badge>
                    {task.runCount > 0 && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        {task.runCount} run{task.runCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    {task.nextRunAt && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-2.5 w-2.5" />
                        Next: {new Date(task.nextRunAt).toLocaleDateString()}
                      </span>
                    )}
                    {task.lastRunAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        Last: {new Date(task.lastRunAt).toLocaleDateString()}
                      </span>
                    )}
                    {task.createdBy && (
                      <span>by {task.createdBy.name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={task.isActive}
                    onCheckedChange={() => handleToggle(task)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(task)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
