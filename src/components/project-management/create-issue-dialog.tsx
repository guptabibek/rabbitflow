'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore, type WorkItemType } from '@/store/app-store'
import { DynamicWorkItemFields } from '@/components/project-management/dynamic-work-item-fields'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  CircleDot,
  Flag,
  Layers,
  Rocket,
  Star,
  X,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS = [
  { value: 'lowest', label: 'Lowest', color: 'text-priority-lowest' },
  { value: 'low', label: 'Low', color: 'text-priority-low' },
  { value: 'medium', label: 'Medium', color: 'text-priority-medium' },
  { value: 'high', label: 'High', color: 'text-priority-high' },
  { value: 'highest', label: 'Highest', color: 'text-priority-highest' },
]

const SEVERITY_OPTIONS = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const RELATION_LINK_TYPES = [
  { value: 'related', label: 'Related' },
  { value: 'blocked_by', label: 'Blocked By' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'duplicate_of', label: 'Duplicate Of' },
  { value: 'tests', label: 'Tests' },
  { value: 'tested_by', label: 'Tested By' },
]

const HIERARCHY_LINK_TYPES = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
]

const LINK_TYPES = [...RELATION_LINK_TYPES, ...HIERARCHY_LINK_TYPES]

const UNASSIGNED_VALUE = '__none__'
const MAX_STORY_POINTS = 100
const MAX_HOURS = 10000

function sanitizeIntegerInput(value: string, maxDigits = 3) {
  return value.replace(/\D/g, '').slice(0, maxDigits)
}

function sanitizeDecimalInput(value: string, maxIntegerDigits = 5) {
  const sanitized = value.replace(/[^0-9.]/g, '')
  const [integerPart = '', ...fractionParts] = sanitized.split('.')
  const nextIntegerPart = integerPart.slice(0, maxIntegerDigits)

  if (fractionParts.length === 0) {
    return nextIntegerPart
  }

  return `${nextIntegerPart}.${fractionParts.join('')}`
}

function parseOptionalIntegerInput(
  value: string,
  label: string,
  max: number
): { value?: number; error?: string } {
  if (!value.trim()) {
    return {}
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) {
    return { error: `${label} must be a whole number.` }
  }

  if (parsed < 0 || parsed > max) {
    return { error: `${label} must be between 0 and ${max}.` }
  }

  return { value: parsed }
}

function parseOptionalDecimalInput(
  value: string,
  label: string,
  max: number
): { value?: number; error?: string } {
  if (!value.trim()) {
    return {}
  }

  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    return { error: `${label} must be a valid number.` }
  }

  if (parsed < 0 || parsed > max) {
    return { error: `${label} must be between 0 and ${max}.` }
  }

  return { value: parsed }
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  epic: Layers,
  feature: Flag,
  story: Star,
  task: CheckCircle2,
  dev_task: CheckCircle2,
  qc_task: CircleDot,
  bug: Bug,
  prod_bug: Bug,
  design_doc: Rocket,
  release_item: CircleDot,
}

const TYPE_COLORS: Record<string, string> = {
  epic: 'text-type-epic',
  feature: 'text-type-feature',
  story: 'text-type-story',
  task: 'text-type-task',
  dev_task: 'text-type-dev-task',
  qc_task: 'text-type-qc-task',
  bug: 'text-type-bug',
  prod_bug: 'text-type-prod-bug',
  design_doc: 'text-type-design-doc',
  release_item: 'text-type-release-item',
}

const TYPE_BACKGROUNDS: Record<string, string> = {
  epic: 'bg-type-epic-bg',
  feature: 'bg-type-feature-bg',
  story: 'bg-type-story-bg',
  task: 'bg-type-task-bg',
  dev_task: 'bg-type-dev-task-bg',
  qc_task: 'bg-type-qc-task-bg',
  bug: 'bg-type-bug-bg',
  prod_bug: 'bg-type-prod-bug-bg',
  design_doc: 'bg-type-design-doc-bg',
  release_item: 'bg-type-release-item-bg',
}

type LinkedItem = {
  issueId: string
  linkType: string
}

type CreateIssueDialogMode = 'dialog' | 'screen'

type CreateIssueDialogProps = {
  mode?: CreateIssueDialogMode
  onClose?: () => void
}

export function CreateIssueDialog({ mode = 'dialog', onClose }: CreateIssueDialogProps = {}) {
  const {
    addIssue,
    areas,
    currentProject,
    currentProjectPermissions,
    isCreateIssueOpen,
    issues,
    iterations,
    labels,
    setCreateIssueOpen,
    states,
    teams,
    updateIssue,
    users,
    workItemTypes,
  } = useAppStore()

  const typeOptions = useMemo(() => workItemTypes, [workItemTypes])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workItemType, setWorkItemType] = useState<WorkItemType>(typeOptions[0]?.key || '')
  const [status, setStatus] = useState('backlog')
  const [priority, setPriority] = useState('medium')
  const [severity, setSeverity] = useState(UNASSIGNED_VALUE)
  const [storyPoints, setStoryPoints] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [remainingHours, setRemainingHours] = useState('')
  const [completedHours, setCompletedHours] = useState('')
  const [assigneeId, setAssigneeId] = useState(UNASSIGNED_VALUE)
  const [selectedIterationTeamId, setSelectedIterationTeamId] = useState(UNASSIGNED_VALUE)
  const [iterationId, setIterationId] = useState(UNASSIGNED_VALUE)
  const [areaId, setAreaId] = useState(UNASSIGNED_VALUE)
  const [stateId, setStateId] = useState(UNASSIGNED_VALUE)
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])
  const [parentIssueId, setParentIssueId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({})
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])
  const [childIssueIds, setChildIssueIds] = useState<string[]>([])
  const [newLinkType, setNewLinkType] = useState('related')
  const [isLinkTypeManual, setIsLinkTypeManual] = useState(false)
  const [searchLink, setSearchLink] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [typeScopedStates, setTypeScopedStates] = useState<typeof states>([])
  const isScreenMode = mode === 'screen'
  const canCreateWorkItems = currentProjectPermissions.includes('workitem:create')

  const activeTypeDefinition = useMemo(
    () => typeOptions.find((type) => type.key === workItemType) ?? typeOptions[0] ?? null,
    [typeOptions, workItemType]
  )

  const selectedTypeFields = useMemo(
    () => new Set(activeTypeDefinition?.fields.map((field) => field.key) ?? []),
    [activeTypeDefinition]
  )

  /**
   * Required custom fields for the selected type.
   *
   * The seeded schema marks fields required that live on the Fields tab, while
   * the form opens on Basic. Previously nothing checked them client-side, so a
   * user filled in everything visible, pressed Create, and got a toast in the
   * far corner naming a field they had never seen — one field at a time, since
   * the server stops at the first failure.
   */
  const requiredCustomFields = useMemo(
    () => (activeTypeDefinition?.fields ?? []).filter((field) => field.required),
    [activeTypeDefinition]
  )

  const missingRequiredFields = useMemo(
    () =>
      requiredCustomFields.filter((field) => {
        const value = customFields[field.key]
        if (value === undefined || value === null) return true
        if (typeof value === 'string') return value.trim().length === 0
        if (Array.isArray(value)) return value.length === 0
        return false
      }),
    [customFields, requiredCustomFields]
  )

  const getHierarchyLevel = (typeKey: string) =>
    typeOptions.find((type) => type.key === typeKey)?.hierarchyLevel ?? 999

  useEffect(() => {
    if (!typeOptions.some((type) => type.key === workItemType)) {
      setWorkItemType(typeOptions[0]?.key || '')
    }
  }, [typeOptions, workItemType])

  useEffect(() => {
    setCustomFields((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => selectedTypeFields.has(key))
      )
    )
  }, [selectedTypeFields])

  useEffect(() => {
    if (!currentProject || !activeTypeDefinition) {
      setTypeScopedStates([])
      return
    }

    let cancelled = false

    void fetch(`/api/work-item-types/${activeTypeDefinition.id}/states`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch type state mappings')
        }

        return response.json()
      })
      .then((payload) => {
        if (cancelled) {
          return
        }

        const mappedStates = Array.isArray(payload?.mappings)
          ? payload.mappings
              .map((mapping: { state?: unknown }) => mapping.state)
              .filter(
                (state): state is (typeof states)[number] =>
                  typeof state === 'object' && state !== null && 'id' in state
              )
          : []

        setTypeScopedStates(mappedStates)
      })
      .catch(() => {
        if (!cancelled) {
          setTypeScopedStates([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeTypeDefinition, currentProject, states])

  useEffect(() => {
    if (stateId === UNASSIGNED_VALUE) {
      return
    }

    const effectiveStates = typeScopedStates.length > 0 ? typeScopedStates : states

    if (!effectiveStates.some((state) => state.id === stateId)) {
      setStateId(UNASSIGNED_VALUE)
    }
  }, [stateId, states, typeScopedStates])

  const availableIssues = useMemo(() => {
    return issues.filter(
      (issue) =>
        issue.id !== parentIssueId &&
        !childIssueIds.includes(issue.id) &&
        !linkedItems.some((link) => link.issueId === issue.id)
    )
  }, [childIssueIds, issues, linkedItems, parentIssueId])

  const availableParents = useMemo(
    () =>
      issues.filter(
        (issue) => getHierarchyLevel(issue.workItemType) < getHierarchyLevel(workItemType)
      ),
    [issues, typeOptions, workItemType]
  )

  const searchedIssues = useMemo(() => {
    if (searchLink.trim().length < 2) {
      return []
    }

    const search = searchLink.toLowerCase()
    return availableIssues
      .filter(
        (issue) =>
          issue.key.toLowerCase().includes(search) || issue.title.toLowerCase().includes(search)
      )
      .slice(0, 10)
  }, [availableIssues, searchLink])

  const selectedType = activeTypeDefinition ?? typeOptions[0]
  const availableStates = typeScopedStates.length > 0 ? typeScopedStates : states
  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name)),
    [teams]
  )
  const filteredIterations = useMemo(() => {
    if (selectedIterationTeamId === UNASSIGNED_VALUE) {
      return iterations.filter((iteration) => iteration.iterationType !== 'sprint')
    }

    return iterations.filter(
      (iteration) =>
        iteration.iterationType !== 'sprint' || iteration.teamId === selectedIterationTeamId
    )
  }, [iterations, selectedIterationTeamId])

  const formatIterationLabel = (iteration: (typeof iterations)[number]) => {
    const baseLabel = iteration.path || iteration.name
    if (iteration.iterationType !== 'sprint') {
      return baseLabel
    }

    const teamName =
      iteration.team?.name ||
      teams.find((team) => team.id === iteration.teamId)?.name ||
      'No team'

    return `${baseLabel} (${teamName})`
  }

  const TypeIcon = TYPE_ICONS[selectedType?.key || 'task'] || CircleDot
  const typeColor = TYPE_COLORS[selectedType?.key || 'task'] || 'text-muted-foreground'
  const typeBackground = TYPE_BACKGROUNDS[selectedType?.key || 'task'] || 'bg-muted'

  useEffect(() => {
    if (iterationId === UNASSIGNED_VALUE) {
      return
    }

    const selectedIteration = iterations.find((iteration) => iteration.id === iterationId)
    if (!selectedIteration) {
      setIterationId(UNASSIGNED_VALUE)
      return
    }

    if (
      selectedIterationTeamId === UNASSIGNED_VALUE &&
      selectedIteration.iterationType === 'sprint'
    ) {
      setIterationId(UNASSIGNED_VALUE)
      return
    }

    if (
      selectedIterationTeamId !== UNASSIGNED_VALUE &&
      selectedIteration.teamId !== selectedIterationTeamId
    ) {
      setIterationId(UNASSIGNED_VALUE)
    }
  }, [iterationId, iterations, selectedIterationTeamId])

  useEffect(() => {
    if (iterationId === UNASSIGNED_VALUE) {
      return
    }

    const selectedIteration = iterations.find((iteration) => iteration.id === iterationId)
    if (!selectedIteration) {
      return
    }

    if (
      selectedIteration.teamId &&
      selectedIterationTeamId === UNASSIGNED_VALUE
    ) {
      setSelectedIterationTeamId(selectedIteration.teamId)
    }
  }, [iterationId, iterations, selectedIterationTeamId])

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setWorkItemType(typeOptions[0]?.key || '')
    setStatus('backlog')
    setPriority('medium')
    setSeverity(UNASSIGNED_VALUE)
    setStoryPoints('')
    setEstimatedHours('')
    setRemainingHours('')
    setCompletedHours('')
    setAssigneeId(UNASSIGNED_VALUE)
    setSelectedIterationTeamId(UNASSIGNED_VALUE)
    setIterationId(UNASSIGNED_VALUE)
    setAreaId(UNASSIGNED_VALUE)
    setStateId(UNASSIGNED_VALUE)
    setSelectedLabels([])
    setParentIssueId(null)
    setStartDate('')
    setDueDate('')
    setCustomFields({})
    setLinkedItems([])
    setChildIssueIds([])
    setNewLinkType('related')
    setIsLinkTypeManual(false)
    setSearchLink('')
    setActiveTab('basic')
  }

  const resolveAutoLinkType = (issueId: string, linkType: string) => {
    if (linkType === 'parent' || linkType === 'child' || isLinkTypeManual) {
      return linkType
    }

    const targetIssue = issues.find((issue) => issue.id === issueId)
    if (!targetIssue) {
      return linkType
    }

    const currentLevel = getHierarchyLevel(workItemType)
    const targetLevel = getHierarchyLevel(targetIssue.workItemType)

    if (targetLevel < currentLevel) {
      return 'parent'
    }

    if (targetLevel > currentLevel) {
      return 'child'
    }

    return linkType
  }

  const handleParentSelection = (value: string) => {
    const nextParentId = value === UNASSIGNED_VALUE ? null : value
    setParentIssueId(nextParentId)

    if (!nextParentId) {
      return
    }

    setChildIssueIds((previous) => previous.filter((id) => id !== nextParentId))
    setLinkedItems((previous) => previous.filter((link) => link.issueId !== nextParentId))

    if (!isLinkTypeManual) {
      setNewLinkType('parent')
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCreateIssueOpen(false)
      onClose?.()
      resetForm()
      return
    }

    if (!isScreenMode) {
      setCreateIssueOpen(true)
    }
  }

  const handleAddLink = (issueId: string, linkType: string) => {
    const resolvedLinkType = resolveAutoLinkType(issueId, linkType)

    if (resolvedLinkType === 'parent') {
      setParentIssueId(issueId)
      setChildIssueIds((previous) => previous.filter((id) => id !== issueId))
      setSearchLink('')
      return
    }

    if (resolvedLinkType === 'child') {
      setChildIssueIds((previous) => (previous.includes(issueId) ? previous : [...previous, issueId]))
      if (parentIssueId === issueId) {
        setParentIssueId(null)
      }
      setSearchLink('')
      return
    }

    setLinkedItems((previous) =>
      previous.some((link) => link.issueId === issueId && link.linkType === resolvedLinkType)
        ? previous
        : [...previous, { issueId, linkType: resolvedLinkType }]
    )
    setSearchLink('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentProject || !selectedType) return

    if (!canCreateWorkItems) {
      toast.error('You do not have permission to create work items')
      return
    }

    if (startDate && dueDate && new Date(dueDate).getTime() < new Date(startDate).getTime()) {
      toast.error('Due date cannot be earlier than start date')
      return
    }

    // Check required custom fields before contacting the server, and take the
    // user to the tab that holds them. Reporting all of them at once means a
    // form with two missing fields is fixed in one pass rather than two
    // round-trips.
    if (missingRequiredFields.length > 0) {
      setActiveTab('fields')
      const names = missingRequiredFields.map((field) => field.label).join(', ')
      toast.error(
        missingRequiredFields.length === 1
          ? `${names} is required — see the Fields tab`
          : `These fields are required: ${names}`
      )
      return
    }

    const storyPointsResult = parseOptionalIntegerInput(storyPoints, 'Story points', MAX_STORY_POINTS)
    if (storyPointsResult.error) {
      toast.error(storyPointsResult.error)
      return
    }

    const estimatedHoursResult = parseOptionalDecimalInput(
      estimatedHours,
      'Estimated hours',
      MAX_HOURS
    )
    if (estimatedHoursResult.error) {
      toast.error(estimatedHoursResult.error)
      return
    }

    const remainingHoursResult = parseOptionalDecimalInput(
      remainingHours,
      'Remaining hours',
      MAX_HOURS
    )
    if (remainingHoursResult.error) {
      toast.error(remainingHoursResult.error)
      return
    }

    const completedHoursResult = parseOptionalDecimalInput(
      completedHours,
      'Completed hours',
      MAX_HOURS
    )
    if (completedHoursResult.error) {
      toast.error(completedHoursResult.error)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          title,
          description,
          workItemType,
          status,
          priority,
          severity: severity === UNASSIGNED_VALUE ? undefined : severity,
          storyPoints: storyPointsResult.value,
          estimatedHours: estimatedHoursResult.value,
          remainingHours: remainingHoursResult.value,
          completedHours: completedHoursResult.value,
          startDate: startDate || undefined,
          dueDate: dueDate || undefined,
          assigneeId: assigneeId === UNASSIGNED_VALUE ? undefined : assigneeId,
          iterationId: iterationId === UNASSIGNED_VALUE ? undefined : iterationId,
          iterationTeamId:
            iterationId === UNASSIGNED_VALUE || selectedIterationTeamId === UNASSIGNED_VALUE
              ? undefined
              : selectedIterationTeamId,
          areaId: areaId === UNASSIGNED_VALUE ? undefined : areaId,
          stateId: stateId === UNASSIGNED_VALUE ? undefined : stateId,
          labelIds: selectedLabels.length > 0 ? selectedLabels : undefined,
          parentIssueId: parentIssueId || undefined,
          customFields,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to create work item')
        return
      }

      const newIssue = await response.json()
      addIssue(newIssue)

      if (linkedItems.length > 0) {
        const relationResults = await Promise.allSettled(
          linkedItems.map((linkedItem) =>
            fetch('/api/relations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sourceIssueId: newIssue.id,
                targetIssueId: linkedItem.issueId,
                relationType: linkedItem.linkType,
              }),
            })
          )
        )

        const failedRelations = relationResults.some(
          (result) => result.status === 'rejected' || !result.value.ok
        )

        if (failedRelations) {
          toast.error('Work item created, but one or more links could not be saved')
        }
      }

      if (childIssueIds.length > 0) {
        const hierarchyResults = await Promise.allSettled(
          childIssueIds.map((childIssueId) =>
            fetch(`/api/issues/${childIssueId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ parentIssueId: newIssue.id }),
            })
          )
        )

        const failedHierarchyUpdates = hierarchyResults.some(
          (result) => result.status === 'rejected' || !result.value.ok
        )

        await Promise.all(
          hierarchyResults.map(async (result) => {
            if (result.status !== 'fulfilled' || !result.value.ok) {
              return
            }

            const updatedIssue = await result.value.json().catch(() => null)
            if (updatedIssue && typeof updatedIssue === 'object' && 'id' in updatedIssue) {
              updateIssue(String(updatedIssue.id), updatedIssue)
            }
          })
        )

        if (failedHierarchyUpdates) {
          toast.error('Work item created, but one or more child hierarchy links could not be saved')
        }
      }

      toast.success(`${selectedType?.name || 'Work item'} created`)
      handleOpenChange(false)
    } catch (caughtError) {
      console.error('Failed to create work item:', caughtError)
      toast.error('Failed to create work item')
    } finally {
      setIsLoading(false)
    }
  }

  if (!currentProject) {
    return null
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="create-work-item-form">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-5 pt-3">
          <TabsList className="h-8 w-full justify-start bg-muted/30 rounded-md">
            <TabsTrigger value="basic" className="text-xs h-7 data-[state=active]:bg-background">
              Basic
            </TabsTrigger>
            <TabsTrigger value="metadata" className="text-xs h-7 data-[state=active]:bg-background">
              Metadata
            </TabsTrigger>
            <TabsTrigger value="fields" className="text-xs h-7 gap-1.5 data-[state=active]:bg-background">
              Fields
              {/* Surfaces the requirement before the user presses Create, rather
                  than after a rejected submit. */}
              {missingRequiredFields.length > 0 && (
                <span
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium tabular-nums text-destructive-foreground"
                  aria-label={`${missingRequiredFields.length} required field${missingRequiredFields.length === 1 ? '' : 's'} still empty`}
                >
                  {missingRequiredFields.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs h-7 data-[state=active]:bg-background">
              Links
            </TabsTrigger>
            <TabsTrigger value="labels" className="text-xs h-7 data-[state=active]:bg-background">
              Labels
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <TabsContent value="basic" className="space-y-4 mt-0">
              {typeOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                  No enabled work item types are available for this project.
                </div>
              ) : null}
              <div>
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Work Item Type
                </Label>
                <Select value={workItemType} onValueChange={setWorkItemType}>
                  <SelectTrigger className="h-9 text-sm" data-testid="create-work-item-type-trigger">
                    <SelectValue placeholder="Select work item type" />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((type) => (
                      <SelectItem
                        key={type.key}
                        value={type.key}
                        data-testid={`create-work-item-type-${type.key}`}
                      >
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedType ? (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-md ${typeBackground}`}>
                      <TypeIcon className={`h-4 w-4 ${typeColor}`} />
                    </div>
                    <span>{selectedType.name}</span>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={`Enter ${selectedType?.name.toLowerCase() || 'work item'} title`}
                  className="h-9 text-sm"
                  required
                  data-testid="create-work-item-title-input"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add a detailed description..."
                  rows={4}
                  className="text-sm bg-muted/20 border-border/50"
                  data-testid="create-work-item-description-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-8 text-xs" data-testid="create-work-item-status-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="h-8 text-xs" data-testid="create-work-item-priority-trigger">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className={option.color}>{option.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="metadata" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Select value={stateId} onValueChange={setStateId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No state" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>No state</SelectItem>
                      {availableStates.map((state) => (
                        <SelectItem key={state.id} value={state.id}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Severity</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>No severity</SelectItem>
                      {SEVERITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assignee</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger className="h-8 text-xs" data-testid="create-work-item-assignee-trigger">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sprint Team</Label>
                  <Select value={selectedIterationTeamId} onValueChange={setSelectedIterationTeamId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All teams" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>All teams</SelectItem>
                      {sortedTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Iteration Path</Label>
                  <Select value={iterationId} onValueChange={setIterationId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No iteration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>No iteration</SelectItem>
                      {filteredIterations.map((iteration) => (
                        <SelectItem key={iteration.id} value={iteration.id}>
                          {formatIterationLabel(iteration)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedIterationTeamId === UNASSIGNED_VALUE ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Select a sprint team to assign this work item to a sprint.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Area Path</Label>
                  <Select value={areaId} onValueChange={setAreaId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>No area</SelectItem>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={area.id}>
                          {area.path || area.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Story Points</Label>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {[1, 2, 3, 5, 8, 13, 21].map((points) => (
                      <Button
                        key={points}
                        type="button"
                        variant={storyPoints === points.toString() ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 w-8 p-0 text-xs"
                        onClick={() =>
                          setStoryPoints(
                            storyPoints === points.toString() ? '' : points.toString()
                          )
                        }
                      >
                        {points}
                      </Button>
                    ))}
                  </div>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_STORY_POINTS}
                    placeholder="Custom value 0-100"
                    value={storyPoints}
                    onChange={(event) => setStoryPoints(sanitizeIntegerInput(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimated Hours</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_HOURS}
                    step="0.1"
                    placeholder="e.g. 16"
                    value={estimatedHours}
                    onChange={(event) => setEstimatedHours(sanitizeDecimalInput(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Remaining Hours</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_HOURS}
                    step="0.1"
                    placeholder="e.g. 10"
                    value={remainingHours}
                    onChange={(event) => setRemainingHours(sanitizeDecimalInput(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Completed Hours</Label>
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_HOURS}
                    step="0.1"
                    placeholder="e.g. 6"
                    value={completedHours}
                    onChange={(event) => setCompletedHours(sanitizeDecimalInput(event.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Parent</Label>
                  <Select
                    value={parentIssueId ?? UNASSIGNED_VALUE}
                    onValueChange={handleParentSelection}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No parent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED_VALUE}>No parent</SelectItem>
                      {availableParents.map((issue) => (
                        <SelectItem key={issue.id} value={issue.id}>
                          {issue.key} - {issue.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    data-testid="create-work-item-start-date-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Due Date</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={dueDate}
                    min={startDate || undefined}
                    onChange={(event) => setDueDate(event.target.value)}
                    data-testid="create-work-item-due-date-input"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="fields" className="mt-0">
              {missingRequiredFields.length > 0 && (
                <div
                  className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" aria-hidden="true" />
                  <p className="text-xs text-foreground">
                    Required before creating:{' '}
                    <span className="font-medium">
                      {missingRequiredFields.map((field) => field.label).join(', ')}
                    </span>
                  </p>
                </div>
              )}

              {activeTypeDefinition?.sections?.length ? (
                <DynamicWorkItemFields
                  sections={activeTypeDefinition.sections}
                  values={customFields}
                  users={users}
                  iterations={iterations}
                  areas={areas}
                  teams={teams}
                  onChange={(key, value) =>
                    setCustomFields((previous) => ({ ...previous, [key]: value }))
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">No custom fields for this type.</p>
              )}
            </TabsContent>

            <TabsContent value="links" className="space-y-4 mt-0">
              <div>
                <Label className="text-xs">Add Link</Label>
                <div className="flex gap-2 mt-1.5">
                  <Select
                    value={newLinkType}
                    onValueChange={(value) => {
                      setNewLinkType(value)
                      setIsLinkTypeManual(true)
                    }}
                  >
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINK_TYPES.map((linkType) => (
                        <SelectItem key={linkType.value} value={linkType.value}>
                          {linkType.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1">
                    <Input
                      value={searchLink}
                      onChange={(event) => setSearchLink(event.target.value)}
                      placeholder="Search work items..."
                      className="h-8 text-xs"
                    />
                    {searchedIssues.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-popover border border-border rounded-md mt-1 max-h-48 overflow-y-auto z-50 shadow-md">
                        {searchedIssues.map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent/50 text-xs text-left"
                            onClick={() => handleAddLink(issue.id, newLinkType)}
                          >
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {issue.key}
                            </span>
                            <span className="truncate">{issue.title}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Use <span className="font-medium">Parent</span> to make this item a child of another work item,
                  or <span className="font-medium">Child</span> to make another work item a child of this item.
                </p>
              </div>

              {parentIssueId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Parent Link</Label>
                  {(() => {
                    const parentIssue = issues.find((issue) => issue.id === parentIssueId)
                    if (!parentIssue) return null

                    return (
                      <div className="group flex items-center justify-between px-3 py-2 border border-border/50 rounded-md bg-muted/20">
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <span className="text-muted-foreground">Parent:</span>
                          <span className="font-mono text-[10px]">{parentIssue.key}</span>
                          <span className="truncate">{parentIssue.title}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove parent issue"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100"
                          onClick={() => setParentIssueId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  })()}
                </div>
              )}

              {childIssueIds.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Child Links</Label>
                  {childIssueIds.map((childIssueId) => {
                    const childIssue = issues.find((issue) => issue.id === childIssueId)
                    if (!childIssue) return null

                    return (
                      <div
                        key={`child:${childIssue.id}`}
                        className="group flex items-center justify-between px-3 py-2 border border-border/50 rounded-md bg-muted/20"
                      >
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <span className="text-muted-foreground">Child:</span>
                          <span className="font-mono text-[10px]">{childIssue.key}</span>
                          <span className="truncate">{childIssue.title}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove child link"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100"
                          onClick={() =>
                            setChildIssueIds((previous) =>
                              previous.filter((issueId) => issueId !== childIssue.id)
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              {linkedItems.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Linked Items</Label>
                  {linkedItems.map((link) => {
                    const linkedIssue = issues.find((issue) => issue.id === link.issueId)
                    const linkType = LINK_TYPES.find((item) => item.value === link.linkType)
                    if (!linkedIssue) return null

                    return (
                      <div
                        key={`${link.linkType}:${link.issueId}`}
                        className="group flex items-center justify-between px-3 py-2 border border-border/50 rounded-md bg-muted/20"
                      >
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <span className="text-muted-foreground">{linkType?.label}:</span>
                          <span className="font-mono text-[10px]">{linkedIssue.key}</span>
                          <span className="truncate">{linkedIssue.title}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove linked item"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100"
                          onClick={() =>
                            setLinkedItems((previous) =>
                              previous.filter(
                                (item) =>
                                  !(
                                    item.issueId === link.issueId &&
                                    item.linkType === link.linkType
                                  )
                              )
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="labels" className="space-y-4 mt-0">
              <div className="flex flex-wrap gap-1.5">
                {labels.map((label) => {
                  const selected = selectedLabels.includes(label.id)

                  return (
                    <Badge
                      key={label.id}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-[10px] transition-colors"
                      style={{
                        borderColor: label.color + '60',
                        backgroundColor: selected ? label.color : 'transparent',
                        color: selected ? 'white' : label.color,
                      }}
                      onClick={() =>
                        setSelectedLabels((previous) =>
                          previous.includes(label.id)
                            ? previous.filter((id) => id !== label.id)
                            : [...previous, label.id]
                        )
                      }
                    >
                      {label.name}
                    </Badge>
                  )
                })}
              </div>
              {labels.length === 0 ? (
                <p className="text-xs text-muted-foreground">No labels available</p>
              ) : null}
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0 sm:px-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => handleOpenChange(false)}
          data-testid="create-work-item-cancel-button"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-8 text-xs"
          disabled={isLoading || !title.trim() || !selectedType || !canCreateWorkItems}
          data-testid="create-work-item-submit-button"
        >
          {isLoading ? 'Creating...' : `Create ${selectedType?.name || 'Work Item'}`}
        </Button>
      </div>
    </form>
  )

  if (isScreenMode) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border bg-gradient-to-r from-background via-background to-muted/20 px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <div className={`h-8 w-8 rounded-md ${typeBackground} flex items-center justify-center`}>
                <TypeIcon className={`h-4 w-4 ${typeColor}`} />
              </div>
              <span className="truncate">Create {selectedType?.name || 'Work Item'}</span>
              <Badge variant="outline" className="text-[10px] font-normal ml-1">
                {currentProject.key}
              </Badge>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleOpenChange(false)}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">{formContent}</div>
      </div>
    )
  }

  return (
    <Dialog open={isCreateIssueOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0" data-testid="create-work-item-dialog">
        <DialogHeader className="px-4 py-3.5 border-b border-border flex-shrink-0 sm:px-5">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className={`h-7 w-7 rounded-md ${typeBackground} flex items-center justify-center`}>
              <TypeIcon className={`h-4 w-4 ${typeColor}`} />
            </div>
            <span>Create {selectedType?.name || 'Work Item'}</span>
            <Badge variant="outline" className="text-[10px] font-normal ml-1">
              {currentProject.key}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
