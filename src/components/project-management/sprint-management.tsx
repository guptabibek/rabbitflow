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
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from './confirm-destructive-dialog'
import { InlineAlert } from '@/components/ui/states'

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

function normalizeIterationStatus(value: string | null | undefined): 'planning' | 'active' | 'completed' {
  const normalized = value?.trim().toLowerCase()

  if (!normalized || normalized === 'planned' || normalized === 'planning') {
    return 'planning'
  }

  if (normalized === 'active') {
    return 'active'
  }

  if (normalized === 'closed' || normalized === 'completed') {
    return 'completed'
  }

  return 'planning'
}

function getIterationStatusLabel(value: string | null | undefined) {
  const normalized = normalizeIterationStatus(value)

  if (normalized === 'active') {
    return 'Active'
  }

  if (normalized === 'completed') {
    return 'Completed'
  }

  return 'Planning'
}

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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'name' | 'teamId' | 'dates', string>>>({})
  const iterationDeletion = useDestructiveConfirm<{
    id: string
    name: string
    issueCount: number
  }>()
  const canManageSprints = currentProjectPermissions.includes('sprint:manage')

  const sortedIterations = useMemo(() => {
    return [...iterations].sort((left, right) => {
      const leftActive = normalizeIterationStatus(left.status) === 'active'
      const rightActive = normalizeIterationStatus(right.status) === 'active'
      if (leftActive && !rightActive) return -1
      if (rightActive && !leftActive) return 1
      return (right.startDate || '').localeCompare(left.startDate || '')
    })
  }, [iterations])

  const fetchIterations = async () => {
    if (!currentProject) return

    setLoadError(null)
    try {
      const response = await fetch(`/api/iterations?projectId=${currentProject.id}`)
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setLoadError(error.error || 'Failed to refresh iterations')
        return
      }

      setIterations(await response.json())
    } catch (caughtError) {
      console.error('Failed to fetch iterations:', caughtError)
      setLoadError('Failed to refresh iterations')
    }
  }

  useEffect(() => {
    if (!currentProject) return
    void fetchIterations()
  }, [currentProject])

  const resetForm = () => {
    setForm(INITIAL_FORM)
    setFieldErrors({})
    setSaveError(null)
  }

  const handleFormChange = <K extends keyof IterationForm>(key: K, value: IterationForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }))
    setSaveError(null)
    if (key === 'name' || key === 'teamId') {
      setFieldErrors((previous) => ({ ...previous, [key]: undefined }))
    }
    if (key === 'startDate' || key === 'endDate') {
      setFieldErrors((previous) => ({ ...previous, dates: undefined }))
    }
  }

  const handleSave = async () => {
    if (!currentProject) {
      return
    }

    if (!canManageSprints) {
      setSaveError('You do not have permission to manage iterations.')
      return false
    }

    const nextFieldErrors: typeof fieldErrors = {}
    if (!form.name.trim()) nextFieldErrors.name = 'Enter an iteration name.'
    if (form.iterationType === 'sprint' && form.teamId === NONE_VALUE) {
      nextFieldErrors.teamId = 'Select the team responsible for this sprint.'
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextFieldErrors.dates = 'End date must be on or after the start date.'
    }
    setFieldErrors(nextFieldErrors)
    if (Object.keys(nextFieldErrors).length > 0) {
      return
    }

    setSaveError(null)
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
        setSaveError(error.error || 'Failed to save iteration')
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
      setSaveError('Failed to save iteration')
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
      status: normalizeIterationStatus(iteration.status),
      teamId: iteration.teamId || NONE_VALUE,
    })
    setFieldErrors({})
    setSaveError(null)
  }

  const handleQuickStatusChange = async (iterationId: string, status: string) => {
    if (!canManageSprints) {
      setActionError('You do not have permission to manage iterations.')
      return
    }

    setActionError(null)
    try {
      const response = await fetch(`/api/iterations/${iterationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        setActionError(error.error || 'Failed to update iteration status')
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
      setActionError('Failed to update iteration status')
    }
  }

  const handleDelete = async (iterationId: string) => {
    if (!canManageSprints) {
      return 'You do not have permission to manage iterations.'
    }

    try {
      const response = await fetch(`/api/iterations/${iterationId}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        return error.error || 'Failed to delete iteration'
      }

      setIterations(iterations.filter((iteration) => iteration.id !== iterationId))
      if (form.id === iterationId) {
        resetForm()
      }
      toast.success('Iteration deleted')
      return true
    } catch (caughtError) {
      console.error('Failed to delete iteration:', caughtError)
      return 'Failed to delete iteration'
    }
  }

  const getIssueCountForIteration = (iterationId: string) =>
    issues.filter((issue) => issue.iteration?.id === iterationId).length

  if (!currentProject) {
    return null
  }

  return (
    <>
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="iteration-management">
      <div className="border-b border-border bg-gradient-to-r from-background via-background to-muted/20 px-4 py-4 sm:px-5">
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
              {saveError ? (
                <div data-testid="iteration-save-error">
                  <InlineAlert tone="danger">{saveError}</InlineAlert>
                </div>
              ) : null}
              <div>
                <Label htmlFor="iter-name" className="text-xs">
                  Name *
                </Label>
                <Input
                  id="iter-name"
                  value={form.name}
                  onChange={(event) => handleFormChange('name', event.target.value)}
                  placeholder="Sprint 24"
                  className="h-8 text-sm"
                  aria-invalid={Boolean(fieldErrors.name)}
                  aria-describedby={fieldErrors.name ? 'iter-name-error' : undefined}
                  data-testid="iteration-name-input"
                />
                {fieldErrors.name ? (
                  <p id="iter-name-error" className="mt-1 text-xs text-destructive">
                    {fieldErrors.name}
                  </p>
                ) : null}
              </div>

              <div>
                <Label className="text-xs">Goal</Label>
                <Textarea
                  value={form.goal}
                  onChange={(event) => handleFormChange('goal', event.target.value)}
                  rows={3}
                  
                />
              </div>

              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={form.iterationType}
                  onValueChange={(value) => handleFormChange('iterationType', value)}
                >
                  <SelectTrigger className="h-8 text-xs">
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
                  <SelectTrigger className="h-8 text-xs">
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
                <Label className="text-xs">Team {form.iterationType === 'sprint' ? '*' : ''}</Label>
                <Select
                  value={form.teamId}
                  onValueChange={(value) => handleFormChange('teamId', value)}
                >
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-invalid={Boolean(fieldErrors.teamId)}
                    aria-describedby={fieldErrors.teamId ? 'iter-team-error' : undefined}
                    data-testid="iteration-team-trigger"
                  >
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
                {fieldErrors.teamId ? (
                  <p id="iter-team-error" className="mt-1 text-xs text-destructive">
                    {fieldErrors.teamId}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Start</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => handleFormChange('startDate', event.target.value)}
                    className="h-8 text-xs"
                    aria-invalid={Boolean(fieldErrors.dates)}
                    data-testid="iteration-start-date-input"
                  />
                </div>
                <div>
                  <Label className="text-xs">End</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => handleFormChange('endDate', event.target.value)}
                    className="h-8 text-xs"
                    aria-invalid={Boolean(fieldErrors.dates)}
                    aria-describedby={fieldErrors.dates ? 'iter-dates-error' : undefined}
                    data-testid="iteration-end-date-input"
                  />
                </div>
              </div>
              {fieldErrors.dates ? (
                <p id="iter-dates-error" className="text-xs text-destructive">
                  {fieldErrors.dates}
                </p>
              ) : null}

              <Button
                className="w-full h-8 text-xs"
                onClick={handleSave}
                disabled={isLoading || !canManageSprints}
                data-testid="iteration-save-button"
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
            {loadError ? (
              <div className="border-b border-border px-4 py-3">
                <InlineAlert
                  tone="danger"
                  title="Iterations could not be refreshed."
                  action={
                    <Button variant="outline" size="sm" onClick={() => void fetchIterations()}>
                      Retry
                    </Button>
                  }
                >
                  {loadError}
                </InlineAlert>
              </div>
            ) : null}
            {actionError ? (
              <div className="border-b border-border px-4 py-3">
                <div data-testid="iteration-action-error">
                  <InlineAlert tone="danger">{actionError}</InlineAlert>
                </div>
              </div>
            ) : null}
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
                  const normalizedStatus = normalizeIterationStatus(iteration.status)

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
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {getIterationStatusLabel(iteration.status)}
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
                          {normalizedStatus === 'planning' ? (
                            <DropdownMenuItem
                              onClick={() => handleQuickStatusChange(iteration.id, 'active')}
                            >
                              <Play className="h-3.5 w-3.5 mr-2" />
                              Mark Active
                            </DropdownMenuItem>
                          ) : null}
                          {normalizedStatus !== 'completed' ? (
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
                            onClick={() =>
                              iterationDeletion.request({
                                id: iteration.id,
                                name: iteration.name,
                                issueCount,
                              })
                            }
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
    <ConfirmDestructiveDialog
      open={iterationDeletion.isOpen}
      onOpenChange={iterationDeletion.onOpenChange}
      title={`Delete ${iterationDeletion.target?.name ?? 'this iteration'}?`}
      description={
        iterationDeletion.target?.issueCount
          ? `${iterationDeletion.target.issueCount} assigned work item${iterationDeletion.target.issueCount === 1 ? '' : 's'} will become unassigned from this iteration. The work items will remain.`
          : 'The iteration will be permanently removed. No work items are currently assigned to it.'
      }
      confirmLabel="Delete iteration"
      onConfirm={() =>
        iterationDeletion.target ? handleDelete(iterationDeletion.target.id) : false
      }
    />
    </>
  )
}
