'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Flag,
  Inbox,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Rocket,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { format } from 'date-fns'
import { toast } from 'sonner'

const ITERATION_TYPES = [
  { value: 'sprint', label: 'Sprint', icon: Flag },
  { value: 'release', label: 'Release', icon: Rocket },
  { value: 'milestone', label: 'Milestone', icon: CheckCircle },
] as const

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
] as const

const NONE_VALUE = '__none__'

type IterationForm = {
  id: string | null
  name: string
  goal: string
  startDate: string
  endDate: string
  iterationType: string
  status: string
  teamId: string
}

const INITIAL_FORM: IterationForm = {
  id: null,
  name: '',
  goal: '',
  startDate: '',
  endDate: '',
  iterationType: 'sprint',
  status: 'planning',
  teamId: NONE_VALUE,
}

export function SprintManagement() {
  const {
    currentProject,
    currentProjectPermissions,
    issues,
    iterations,
    setIterations,
    setSprintModalOpen,
    teams,
  } = useAppStore()

  const [form, setForm] = useState<IterationForm>(INITIAL_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const canManageSprints = currentProjectPermissions.includes('sprint:manage')

  const sortedIterations = useMemo(() => {
    return [...iterations].sort((left, right) => {
      const leftActive = left.status === 'active' || left.status === 'Active'
      const rightActive = right.status === 'active' || right.status === 'Active'
      if (leftActive && !rightActive) return -1
      if (rightActive && !leftActive) return 1
      return (right.startDate || '').localeCompare(left.startDate || '')
    })
  }, [iterations])

  const fetchIterations = async () => {
    if (!currentProject) return

    try {
      const response = await fetch(`/api/iterations?projectId=${currentProject.id}`)
      if (!response.ok) {
        return
      }

      setIterations(await response.json())
    } catch (caughtError) {
      console.error('Failed to fetch iterations:', caughtError)
      toast.error('Failed to refresh iterations')
    }
  }

  useEffect(() => {
    if (!currentProject) return
    void fetchIterations()
  }, [currentProject])

  const resetForm = () => {
    setForm(INITIAL_FORM)
  }

  const handleFormChange = <K extends keyof IterationForm>(key: K, value: IterationForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const handleSave = async () => {
    if (!currentProject || !form.name.trim()) {
      return
    }

    if (!canManageSprints) {
      toast.error('You do not have permission to manage iterations')
      return
    }

    if (form.iterationType === 'sprint' && form.teamId === NONE_VALUE) {
      toast.error('A sprint must be assigned to a team')
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        projectId: currentProject.id,
        name: form.name.trim(),
        goal: form.goal.trim() || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        iterationType: form.iterationType,
        status: form.status,
        teamId: form.teamId === NONE_VALUE ? null : form.teamId,
      }

      const response = await fetch(
        form.id ? `/api/iterations/${form.id}` : '/api/iterations',
        {
          method: form.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to save iteration')
        return
      }

      const iteration = await response.json()
      if (form.id) {
        setIterations(
          iterations.map((currentIteration) =>
            currentIteration.id === iteration.id ? iteration : currentIteration
          )
        )
        toast.success('Iteration updated')
      } else {
        setIterations([iteration, ...iterations])
        toast.success('Iteration created')
      }

      resetForm()
    } catch (caughtError) {
      console.error('Failed to save iteration:', caughtError)
      toast.error('Failed to save iteration')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (iterationId: string) => {
    const iteration = iterations.find((item) => item.id === iterationId)
    if (!iteration) return

    setForm({
      id: iteration.id,
      name: iteration.name,
      goal: iteration.goal || '',
      startDate: iteration.startDate?.slice(0, 10) || '',
      endDate: iteration.endDate?.slice(0, 10) || '',
      iterationType: iteration.iterationType,
      status: iteration.status || 'planning',
      teamId: iteration.teamId || NONE_VALUE,
    })
  }

  const handleQuickStatusChange = async (iterationId: string, status: string) => {
    if (!canManageSprints) {
      toast.error('You do not have permission to manage iterations')
      return
    }

    try {
      const response = await fetch(`/api/iterations/${iterationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to update iteration status')
        return
      }

      const updatedIteration = await response.json()
      setIterations(
        iterations.map((iteration) =>
          iteration.id === updatedIteration.id ? updatedIteration : iteration
        )
      )
      toast.success('Iteration status updated')
    } catch (caughtError) {
      console.error('Failed to update iteration status:', caughtError)
      toast.error('Failed to update iteration status')
    }
  }

  const handleDelete = async (iterationId: string) => {
    if (!canManageSprints) {
      toast.error('You do not have permission to manage iterations')
      return
    }

    if (
      !confirm('Are you sure you want to delete this iteration? Assigned work items will lose their iteration.')
    ) {
      return
    }

    try {
      const response = await fetch(`/api/iterations/${iterationId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete iteration')
        return
      }

      setIterations(iterations.filter((iteration) => iteration.id !== iterationId))
      if (form.id === iterationId) {
        resetForm()
      }
      toast.success('Iteration deleted')
    } catch (caughtError) {
      console.error('Failed to delete iteration:', caughtError)
      toast.error('Failed to delete iteration')
    }
  }

  const getIssueCountForIteration = (iterationId: string) =>
    issues.filter((issue) => issue.iteration?.id === iterationId).length

  if (!currentProject) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border bg-gradient-to-r from-background via-background to-muted/20 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-semibold">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Flag className="h-4 w-4 text-primary" />
              </div>
              Sprint & Iteration Management
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Plan delivery cycles, assign teams, and track active iterations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setSprintModalOpen(false)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-80 border-r border-border bg-muted/10 p-4 flex-shrink-0 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {form.id ? 'Edit Iteration' : 'Create Iteration'}
              </h3>
              {form.id ? (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="iter-name" className="text-xs">
                  Name *
                </Label>
                <Input
                  id="iter-name"
                  value={form.name}
                  onChange={(event) => handleFormChange('name', event.target.value)}
                  placeholder="Sprint 24"
                  className="h-8 text-sm mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Goal</Label>
                <Textarea
                  value={form.goal}
                  onChange={(event) => handleFormChange('goal', event.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={form.iterationType}
                  onValueChange={(value) => handleFormChange('iterationType', value)}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITERATION_TYPES.map((type) => {
                      const Icon = type.icon
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {type.label}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(value) => handleFormChange('status', value)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Team</Label>
                <Select
                  value={form.teamId}
                  onValueChange={(value) => handleFormChange('teamId', value)}
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>No team</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Start</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => handleFormChange('startDate', event.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">End</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => handleFormChange('endDate', event.target.value)}
                    className="h-8 text-xs mt-1"
                  />
                </div>
              </div>

              <Button
                className="w-full h-8 text-xs"
                onClick={handleSave}
                disabled={isLoading || !form.name.trim() || !canManageSprints}
              >
                {form.id ? (
                  <>
                    <Save className="h-3.5 w-3.5 mr-1" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create Iteration
                  </>
                )}
              </Button>
            </div>
          </div>

        <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                All Iterations <span className="tabular-nums">({sortedIterations.length})</span>
              </span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {sortedIterations.map((iteration) => {
                  const Icon =
                    ITERATION_TYPES.find((item) => item.value === iteration.iterationType)?.icon ||
                    Flag
                  const issueCount = getIssueCountForIteration(iteration.id)

                  return (
                    <div
                      key={iteration.id}
                      className="group flex items-start gap-3 px-3 py-3 rounded-lg border border-border/50 bg-card hover:bg-accent/30 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {iteration.name}
                          </span>
                          <Badge variant="outline" className="text-[10px] capitalize h-5">
                            {iteration.iterationType}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] capitalize h-5">
                            {iteration.status}
                          </Badge>
                          {iteration.team ? (
                            <Badge variant="secondary" className="text-[10px] h-5">
                              {iteration.team.name}
                            </Badge>
                          ) : null}
                        </div>
                        {iteration.goal ? (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {iteration.goal}
                          </p>
                        ) : null}
                        {(iteration.startDate || iteration.endDate) && (
                          <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {iteration.startDate
                              ? format(new Date(iteration.startDate), 'MMM d')
                              : 'No start'}
                            {' - '}
                            {iteration.endDate
                              ? format(new Date(iteration.endDate), 'MMM d, yyyy')
                              : 'No end'}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] tabular-nums h-5 flex-shrink-0">
                        {issueCount} item{issueCount !== 1 ? 's' : ''}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Sprint options"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(iteration.id)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {iteration.status !== 'active' ? (
                            <DropdownMenuItem
                              onClick={() => handleQuickStatusChange(iteration.id, 'active')}
                            >
                              <Play className="h-3.5 w-3.5 mr-2" />
                              Mark Active
                            </DropdownMenuItem>
                          ) : null}
                          {iteration.status !== 'completed' ? (
                            <DropdownMenuItem
                              onClick={() => handleQuickStatusChange(iteration.id, 'completed')}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-2" />
                              Mark Completed
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDelete(iteration.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
                {sortedIterations.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">No iterations yet</p>
                    <p className="text-xs text-muted-foreground">
                      Create your first sprint to start planning delivery.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
        </div>
      </div>
    </div>
  )
}
