'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  readWorkItemCreationPreferences,
  useAppStore,
  type WorkItemTemplate,
  type WorkItemType,
} from '@/store/app-store'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ArrowLeft,
  BookmarkPlus,
  Bug,
  CheckCircle2,
  CircleDot,
  Flag,
  Layers,
  Rocket,
  Star,
  Trash2,
  X,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

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
    lastWorkItemTypeByProject,
    removeWorkItemTemplate,
    saveWorkItemTemplate,
    setCreateIssueOpen,
    setLastWorkItemType,
    states,
    teams,
    updateIssue,
    users,
    workItemTemplatesByProject,
    workItemTypes,
  } = useAppStore()

  const typeOptions = useMemo(() => workItemTypes, [workItemTypes])
  const initializedProjectIdRef = useRef<string | null>(null)
  const userSelectedTypeRef = useRef(false)
  const persistedCreationPreferences = readWorkItemCreationPreferences()
  const runtimeProjectTemplates = currentProject
    ? workItemTemplatesByProject[currentProject.id] ?? []
    : []
  const projectTemplates = runtimeProjectTemplates.length > 0
    ? runtimeProjectTemplates
    : currentProject
      ? persistedCreationPreferences.workItemTemplatesByProject[currentProject.id] ?? []
      : []
  const rememberedWorkItemType = currentProject
    ? lastWorkItemTypeByProject[currentProject.id]
      ?? persistedCreationPreferences.lastWorkItemTypeByProject[currentProject.id]
    : undefined
  const defaultWorkItemType = typeOptions.some((type) => type.key === rememberedWorkItemType)
    ? rememberedWorkItemType ?? ''
    : typeOptions[0]?.key ?? ''

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workItemType, setWorkItemType] = useState<WorkItemType>('')
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateError, setTemplateError] = useState<string | null>(null)
  const isScreenMode = mode === 'screen'
  const canCreateWorkItems = currentProjectPermissions.includes('workitem:create')

  const clearFieldError = (key: string) => {
    setFieldErrors((previous) => {
      if (!previous[key]) return previous
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

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
    const projectId = currentProject?.id ?? null
    if (initializedProjectIdRef.current !== projectId) {
      initializedProjectIdRef.current = projectId
      userSelectedTypeRef.current = false
      setWorkItemType(defaultWorkItemType)
      return
    }

    if (
      (!userSelectedTypeRef.current && workItemType !== defaultWorkItemType) ||
      !typeOptions.some((type) => type.key === workItemType)
    ) {
      setWorkItemType(defaultWorkItemType)
    }
  }, [currentProject?.id, defaultWorkItemType, typeOptions, workItemType])

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
    setWorkItemType(defaultWorkItemType)
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
    setFieldErrors({})
    setSubmitError(null)
    setSelectedTemplateId('')
    setIsSaveTemplateOpen(false)
    setTemplateName('')
    setTemplateError(null)
  }

  const handleWorkItemTypeChange = (value: WorkItemType) => {
    if (!typeOptions.some((type) => type.key === value)) return
    userSelectedTypeRef.current = true
    setWorkItemType(value)
    if (currentProject) {
      setLastWorkItemType(currentProject.id, value)
    }
    clearFieldError('workItemType')
  }

  const applyTemplate = (templateId: string) => {
    const template = projectTemplates.find((entry) => entry.id === templateId)
    if (!template) return

    setSelectedTemplateId(template.id)
    const nextType = typeOptions.some((type) => type.key === template.workItemType)
      ? template.workItemType
      : defaultWorkItemType
    handleWorkItemTypeChange(nextType)
    setDescription(template.description)
    setPriority(template.priority)
    setSeverity(template.severity)
    setStoryPoints(template.storyPoints)
    setEstimatedHours(template.estimatedHours)
    setAssigneeId(
      template.assigneeId === UNASSIGNED_VALUE || users.some((user) => user.id === template.assigneeId)
        ? template.assigneeId
        : UNASSIGNED_VALUE
    )
    setAreaId(
      template.areaId === UNASSIGNED_VALUE || areas.some((area) => area.id === template.areaId)
        ? template.areaId
        : UNASSIGNED_VALUE
    )
    setSelectedLabels(template.labelIds.filter((id) => labels.some((label) => label.id === id)))
    setCustomFields(template.customFields)
    setFieldErrors({})
    setSubmitError(null)
  }

  const saveCurrentTemplate = () => {
    if (!currentProject) return

    const name = templateName.trim()
    if (!name) {
      setTemplateError('Enter a template name.')
      return
    }

    const template: WorkItemTemplate = {
      id: crypto.randomUUID(),
      name,
      workItemType,
      description,
      priority,
      severity,
      storyPoints,
      estimatedHours,
      assigneeId,
      areaId,
      labelIds: selectedLabels,
      customFields,
    }
    saveWorkItemTemplate(currentProject.id, template)
    setSelectedTemplateId(template.id)
    setTemplateName('')
    setTemplateError(null)
    setIsSaveTemplateOpen(false)
    toast.success(`Template “${name}” saved`)
  }

  const removeSelectedTemplate = () => {
    if (!currentProject || !selectedTemplateId) return
    const template = projectTemplates.find((entry) => entry.id === selectedTemplateId)
    removeWorkItemTemplate(currentProject.id, selectedTemplateId)
    setSelectedTemplateId('')
    if (template) toast.success(`Template “${template.name}” removed`)
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
    if (!currentProject) return

    setSubmitError(null)

    if (!canCreateWorkItems) {
      setSubmitError('You do not have permission to create work items.')
      return
    }

    const nextFieldErrors: Record<string, string> = {}
    if (!selectedType) nextFieldErrors.workItemType = 'Choose a work item type.'
    if (!title.trim()) nextFieldErrors.title = 'Title is required.'
    if (startDate && dueDate && new Date(dueDate).getTime() < new Date(startDate).getTime()) {
      nextFieldErrors.dueDate = 'Due date cannot be earlier than start date.'
    }

    for (const field of missingRequiredFields) {
      nextFieldErrors[`custom.${field.key}`] = `${field.label} is required.`
    }

    const storyPointsResult = parseOptionalIntegerInput(storyPoints, 'Story points', MAX_STORY_POINTS)
    if (storyPointsResult.error) nextFieldErrors.storyPoints = storyPointsResult.error

    const estimatedHoursResult = parseOptionalDecimalInput(
      estimatedHours,
      'Estimated hours',
      MAX_HOURS
    )
    if (estimatedHoursResult.error) nextFieldErrors.estimatedHours = estimatedHoursResult.error

    const remainingHoursResult = parseOptionalDecimalInput(
      remainingHours,
      'Remaining hours',
      MAX_HOURS
    )
    if (remainingHoursResult.error) nextFieldErrors.remainingHours = remainingHoursResult.error

    const completedHoursResult = parseOptionalDecimalInput(
      completedHours,
      'Completed hours',
      MAX_HOURS
    )
    if (completedHoursResult.error) nextFieldErrors.completedHours = completedHoursResult.error

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      const errorKeys = Object.keys(nextFieldErrors)
      const nextTab = errorKeys.some((key) => key === 'title' || key === 'workItemType')
        ? 'basic'
        : errorKeys.some((key) => !key.startsWith('custom.'))
          ? 'metadata'
          : 'fields'
      setActiveTab(nextTab)
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>('[data-testid="create-work-item-form"] [aria-invalid="true"]')
          ?.focus()
      }, 0)
      return
    }

    setFieldErrors({})
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
        setSubmitError(error.error || 'Failed to create work item. Review your entries and try again.')
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
          toast.warning('Work item created, but one or more links could not be saved')
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
          toast.warning('Work item created, but one or more child hierarchy links could not be saved')
        }
      }

      toast.success(`${selectedType?.name || 'Work item'} created`)
      handleOpenChange(false)
    } catch (caughtError) {
      console.error('Failed to create work item:', caughtError)
      setSubmitError('Failed to create work item. Check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!currentProject) {
    return null
  }

  const basicErrorCount = Object.keys(fieldErrors).filter(
    (key) => key === 'title' || key === 'workItemType'
  ).length
  const planningErrorCount = Object.keys(fieldErrors).filter(
    (key) => key !== 'title' && key !== 'workItemType' && !key.startsWith('custom.')
  ).length
  const typeDetailsErrorCount = Object.keys(fieldErrors).filter((key) =>
    key.startsWith('custom.')
  ).length
  const validationMessages = Array.from(new Set(Object.values(fieldErrors)))

  const formContent = (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="create-work-item-form"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="px-5 pt-3">
          <TabsList className="h-8 w-full justify-start bg-muted/30 rounded-md">
            <TabsTrigger value="basic" data-testid="create-work-item-tab-basic" className="text-xs h-7 gap-1.5 data-[state=active]:bg-background">
              Basic
              {basicErrorCount > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium tabular-nums text-destructive-foreground" aria-label={`${basicErrorCount} basic field error${basicErrorCount === 1 ? '' : 's'}`}>
                  {basicErrorCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="metadata" data-testid="create-work-item-tab-metadata" className="text-xs h-7 gap-1.5 data-[state=active]:bg-background">
              Planning
              {planningErrorCount > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium tabular-nums text-destructive-foreground" aria-label={`${planningErrorCount} planning field error${planningErrorCount === 1 ? '' : 's'}`}>
                  {planningErrorCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="fields" data-testid="create-work-item-tab-fields" className="text-xs h-7 gap-1.5 data-[state=active]:bg-background">
              Type details
              {/* Surfaces the requirement before the user presses Create, rather
                  than after a rejected submit. */}
              {Math.max(missingRequiredFields.length, typeDetailsErrorCount) > 0 && (
                <span
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium tabular-nums text-destructive-foreground"
                  aria-label={`${Math.max(missingRequiredFields.length, typeDetailsErrorCount)} type detail field${Math.max(missingRequiredFields.length, typeDetailsErrorCount) === 1 ? '' : 's'} requiring attention`}
                >
                  {Math.max(missingRequiredFields.length, typeDetailsErrorCount)}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="links" data-testid="create-work-item-tab-links" className="text-xs h-7 data-[state=active]:bg-background">
              Links
            </TabsTrigger>
            <TabsTrigger value="labels" data-testid="create-work-item-tab-labels" className="text-xs h-7 data-[state=active]:bg-background">
              Labels
            </TabsTrigger>
          </TabsList>
        </div>

        {validationMessages.length > 0 ? (
          <Alert variant="destructive" className="mx-5 mt-3 shrink-0" data-testid="create-work-item-validation-summary">
            <AlertCircle className="size-4" />
            <AlertTitle>
              Review {validationMessages.length} field {validationMessages.length === 1 ? 'error' : 'errors'}.
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-0.5 pl-4">
                {validationMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {/*
          A form field is only as usable as its line length. In screen mode
          this body is as wide as the workspace, and a 1250px-wide title input
          with a 1250px-wide description under it is neither scannable nor
          fillable. Capped to a comfortable measure and left-aligned, which
          also keeps the label/field relationship readable.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="max-w-3xl space-y-4">
            <TabsContent value="basic" className="space-y-4 mt-0">
              {typeOptions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
                  No enabled work item types are available for this project.
                </div>
              ) : null}
              <div>
                <Label htmlFor="work-item-type" className="mb-1.5 block text-xs">
                  Type
                </Label>
                <Select
                  value={workItemType}
                  onValueChange={handleWorkItemTypeChange}
                >
                  <SelectTrigger
                    id="work-item-type"
                    data-testid="create-work-item-type-trigger"
                    aria-invalid={Boolean(fieldErrors.workItemType)}
                    aria-describedby={fieldErrors.workItemType ? 'create-work-item-type-error' : undefined}
                  >
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
                {fieldErrors.workItemType ? (
                  <p id="create-work-item-type-error" className="mt-1 text-xs text-destructive">
                    {fieldErrors.workItemType}
                  </p>
                ) : null}
                {/*
                  The read-only tile that used to sit here restated the value
                  of the select immediately above it — the same word, the same
                  icon, in a box that could not be interacted with. The chosen
                  type is already named in the page title and in the submit
                  button.
                */}
                {selectedType?.description ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {selectedType.description}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1 space-y-1.5">
                    <Label className="text-xs">Personal template</Label>
                    <Select value={selectedTemplateId} onValueChange={applyTemplate}>
                      <SelectTrigger
                        className="h-8 text-xs"
                        data-testid="create-work-item-template-trigger"
                        aria-label="Personal template"
                      >
                        <SelectValue placeholder="Choose a saved template" />
                      </SelectTrigger>
                      <SelectContent>
                        {projectTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Popover open={isSaveTemplateOpen} onOpenChange={(open) => {
                    setIsSaveTemplateOpen(open)
                    if (!open) setTemplateError(null)
                  }}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        data-testid="create-work-item-save-template-button"
                      >
                        <BookmarkPlus />
                        Save current
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">Save personal template</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Saves the type and common planning fields for this project on this device.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="work-item-template-name" className="text-xs">Template name</Label>
                        <Input
                          id="work-item-template-name"
                          value={templateName}
                          onChange={(event) => {
                            setTemplateName(event.target.value)
                            setTemplateError(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              saveCurrentTemplate()
                            }
                          }}
                          aria-invalid={Boolean(templateError)}
                          aria-describedby={templateError ? 'work-item-template-name-error' : undefined}
                          data-testid="create-work-item-template-name-input"
                        />
                        {templateError ? (
                          <p id="work-item-template-name-error" className="text-xs text-destructive">
                            {templateError}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        onClick={saveCurrentTemplate}
                        data-testid="create-work-item-template-confirm-button"
                      >
                        Save template
                      </Button>
                    </PopoverContent>
                  </Popover>

                  {selectedTemplateId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={removeSelectedTemplate}
                      aria-label="Remove selected personal template"
                      data-testid="create-work-item-remove-template-button"
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                {projectTemplates.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Save a setup you use often, then apply it to future work items.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value)
                    clearFieldError('title')
                  }}
                  placeholder={`Enter ${selectedType?.name.toLowerCase() || 'work item'} title`}
                  className="h-9 text-sm"
                  autoFocus
                  required
                  data-testid="create-work-item-title-input"
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? 'create-work-item-title-error' : undefined}
                />
                {fieldErrors.title ? (
                  <p id="create-work-item-title-error" className="text-xs text-destructive">
                    {fieldErrors.title}
                  </p>
                ) : null}
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

              <div className="max-w-xs">
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
                    <SelectTrigger className="h-8 text-xs" data-testid="create-work-item-state-trigger">
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
                  <Label htmlFor="create-story-points" className="text-xs">Story Points</Label>
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
                    id="create-story-points"
                    className="h-8 text-xs"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_STORY_POINTS}
                    placeholder="Custom value 0-100"
                    value={storyPoints}
                    onChange={(event) => {
                      setStoryPoints(sanitizeIntegerInput(event.target.value))
                      clearFieldError('storyPoints')
                    }}
                    aria-invalid={Boolean(fieldErrors.storyPoints)}
                    aria-describedby={fieldErrors.storyPoints ? 'create-story-points-error' : undefined}
                  />
                  {fieldErrors.storyPoints ? <p id="create-story-points-error" className="text-xs text-destructive">{fieldErrors.storyPoints}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-estimated-hours" className="text-xs">Estimated Hours</Label>
                  <Input
                    id="create-estimated-hours"
                    className="h-8 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_HOURS}
                    step="0.1"
                    placeholder="e.g. 16"
                    value={estimatedHours}
                    onChange={(event) => {
                      setEstimatedHours(sanitizeDecimalInput(event.target.value))
                      clearFieldError('estimatedHours')
                    }}
                    aria-invalid={Boolean(fieldErrors.estimatedHours)}
                    aria-describedby={fieldErrors.estimatedHours ? 'create-estimated-hours-error' : undefined}
                  />
                  {fieldErrors.estimatedHours ? <p id="create-estimated-hours-error" className="text-xs text-destructive">{fieldErrors.estimatedHours}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-remaining-hours" className="text-xs">Remaining Hours</Label>
                  <Input
                    id="create-remaining-hours"
                    className="h-8 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_HOURS}
                    step="0.1"
                    placeholder="e.g. 10"
                    value={remainingHours}
                    onChange={(event) => {
                      setRemainingHours(sanitizeDecimalInput(event.target.value))
                      clearFieldError('remainingHours')
                    }}
                    aria-invalid={Boolean(fieldErrors.remainingHours)}
                    aria-describedby={fieldErrors.remainingHours ? 'create-remaining-hours-error' : undefined}
                  />
                  {fieldErrors.remainingHours ? <p id="create-remaining-hours-error" className="text-xs text-destructive">{fieldErrors.remainingHours}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-completed-hours" className="text-xs">Completed Hours</Label>
                  <Input
                    id="create-completed-hours"
                    className="h-8 text-xs"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={MAX_HOURS}
                    step="0.1"
                    placeholder="e.g. 6"
                    value={completedHours}
                    onChange={(event) => {
                      setCompletedHours(sanitizeDecimalInput(event.target.value))
                      clearFieldError('completedHours')
                    }}
                    aria-invalid={Boolean(fieldErrors.completedHours)}
                    aria-describedby={fieldErrors.completedHours ? 'create-completed-hours-error' : undefined}
                  />
                  {fieldErrors.completedHours ? <p id="create-completed-hours-error" className="text-xs text-destructive">{fieldErrors.completedHours}</p> : null}
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
                  <Label htmlFor="create-start-date" className="text-xs">Start Date</Label>
                  <Input
                    id="create-start-date"
                    type="date"
                    className="h-8 text-xs"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    data-testid="create-work-item-start-date-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="create-due-date" className="text-xs">Due Date</Label>
                  {/*
                    No `min={startDate}` here.

                    It reads like a helpful constraint, but it made the form
                    impossible to submit and impossible to diagnose. Setting a
                    due date before the start date — or, more easily, moving the
                    start date later than a due date already chosen — leaves this
                    control natively `:invalid`. The browser then refuses to fire
                    a submit event at all: no request, no toast, no message. The
                    Create button simply stops working. Because the field lives
                    on a tab, the native validation bubble usually cannot even be
                    shown, so Chrome gives up silently.

                    It also made the explicit check in `handleSubmit` dead code,
                    which is the check that can actually explain the problem.
                    Ordering is enforced there instead.
                  */}
                  <Input
                    id="create-due-date"
                    type="date"
                    className="h-8 text-xs"
                    value={dueDate}
                    onChange={(event) => {
                      setDueDate(event.target.value)
                      clearFieldError('dueDate')
                    }}
                    data-testid="create-work-item-due-date-input"
                    aria-invalid={Boolean(fieldErrors.dueDate)}
                    aria-describedby={fieldErrors.dueDate ? 'create-due-date-error' : undefined}
                  />
                  {fieldErrors.dueDate ? <p id="create-due-date-error" className="text-xs text-destructive">{fieldErrors.dueDate}</p> : null}
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
                  errors={Object.fromEntries(
                    Object.entries(fieldErrors)
                      .filter(([key]) => key.startsWith('custom.'))
                      .map(([key, value]) => [key.slice('custom.'.length), value])
                  )}
                  onChange={(key, value) => {
                    setCustomFields((previous) => ({ ...previous, [key]: value }))
                  }}
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

      <div className="space-y-3 border-t border-border px-4 py-3 sm:px-5">
        {submitError ? (
          <Alert variant="destructive" data-testid="create-work-item-submit-error">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Work item was not created</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end gap-2">
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
          disabled={isLoading || !selectedType || !canCreateWorkItems}
          data-testid="create-work-item-submit-button"
        >
          {isLoading ? 'Creating...' : `Create ${selectedType?.name || 'Work Item'}`}
        </Button>
        </div>
      </div>
    </form>
  )

  if (isScreenMode) {
    return (
      // Same test hook as the dialog branch: callers care that the create
      // surface is open, not which presentation it chose.
      <div className="flex h-full min-h-0 flex-col bg-background" data-testid="create-work-item-surface">
        {/* No gradient: a decorative wash across a form header adds nothing a
            hairline does not, and it fought the page behind it. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <TypeIcon className={`h-4 w-4 shrink-0 ${typeColor}`} aria-hidden="true" />
            <h1 className="type-title truncate text-foreground">
              New {selectedType?.name.toLowerCase() || 'work item'}
            </h1>
            <Badge variant="outline" className="font-mono">
              {currentProject.key}
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            <ArrowLeft />
            Back
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{formContent}</div>
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
