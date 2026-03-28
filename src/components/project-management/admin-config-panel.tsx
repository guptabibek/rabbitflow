'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useAppStore,
  type State,
  type WorkItemSectionDefinition,
} from '@/store/app-store'
import { WorkItemTypeManagement } from '@/components/project-management/work-item-type-management'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { GripVertical, Layers, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'

type TypeStateMappingRecord = {
  stateId: string
  order: number
  isInitial: boolean
  state: State
}

type TypeTransitionRecord = {
  id?: string
  fromStateId: string
  toStateId: string
  order: number
  isEnabled: boolean
  requiresApproval: boolean
  approverRoles: string[]
  minApprovals: number
}

const TRANSITION_APPROVER_ROLES = ['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'] as const

type TypeFieldMappingRecord = {
  fieldDefinitionId: string
  sectionId?: string | null
  groupKey: string
  order: number
  requiredOverride?: boolean | null
  isVisible: boolean
  fieldDefinition: {
    id: string
    key: string
    label: string
    dataType: string
    required: boolean
    options?: string[] | null
  }
}

type PlanningFieldDraft = {
  fieldDefinitionId: string
  order: number
  requiredOverride?: boolean | null
  isVisible: boolean
  options: string
  fieldLabel: string
  dataType: string
}

type PreviewField = {
  id: string
  label: string
  dataType: string
  required: boolean
  isVisible: boolean
  options: string[]
  groupLabel: string
}

function SortableRow({
  id,
  children,
}: {
  id: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border/60 bg-card">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

function stateCategoryBadgeClass(category: string) {
  if (category === 'Done') return 'bg-category-done-bg text-category-done border-0'
  if (category === 'In Progress') return 'bg-category-active-bg text-category-active border-0'
  return 'bg-category-default-bg text-category-default border-0'
}

function humanizeDataType(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function renderPreviewControl(field: PreviewField) {
  if (field.dataType === 'markdown') {
    return <Textarea rows={3} disabled placeholder="Rich text content" />
  }

  if (field.dataType === 'boolean') {
    return (
      <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
        <Checkbox checked={false} disabled />
        <span className="text-xs text-muted-foreground">False</span>
      </div>
    )
  }

  if (field.dataType === 'multi_select') {
    return (
      <div className="flex flex-wrap gap-1">
        {(field.options.length > 0 ? field.options : ['Option A', 'Option B'])
          .slice(0, 2)
          .map((option) => (
            <Badge key={option} variant="outline" className="text-[10px]">
              {option}
            </Badge>
          ))}
      </div>
    )
  }

  if (field.dataType === 'number') {
    return <Input disabled type="number" placeholder="0" />
  }

  if (field.dataType === 'date') {
    return <Input disabled type="date" />
  }

  if (field.dataType === 'single_select' || field.dataType === 'dropdown') {
    return <Input disabled placeholder={field.options[0] ?? 'Select an option'} />
  }

  if (
    field.dataType === 'user' ||
    field.dataType === 'team' ||
    field.dataType === 'iteration' ||
    field.dataType === 'area'
  ) {
    return <Input disabled placeholder={`Select ${humanizeDataType(field.dataType).toLowerCase()}`} />
  }

  return <Input disabled placeholder="Enter value" />
}

export function AdminConfigPanel() {
  const { currentProject, currentProjectPermissions, workItemTypes, states, setStates } = useAppStore()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const [selectedTypeId, setSelectedTypeId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'types' | 'states' | 'fields' | 'planning'>('types')

  const [stateDrafts, setStateDrafts] = useState<State[]>([])
  const [newStateName, setNewStateName] = useState('')
  const [newStateColor, setNewStateColor] = useState('#64748b')
  const [newStateCategory, setNewStateCategory] = useState<'New' | 'In Progress' | 'Done'>('New')
  const [newStateFinal, setNewStateFinal] = useState(false)

  const [stateConfigLoading, setStateConfigLoading] = useState(false)
  const [stateConfigSaving, setStateConfigSaving] = useState(false)
  const [mappedStates, setMappedStates] = useState<TypeStateMappingRecord[]>([])
  const [stateTransitions, setStateTransitions] = useState<Record<string, TypeTransitionRecord>>({})

  const [fieldConfigSaving, setFieldConfigSaving] = useState(false)
  const [fieldMappings, setFieldMappings] = useState<TypeFieldMappingRecord[]>([])

  const [planningLoading, setPlanningLoading] = useState(false)
  const [planningSaving, setPlanningSaving] = useState(false)
  const [planningFields, setPlanningFields] = useState<PlanningFieldDraft[]>([])
  const canManageMasterData = currentProjectPermissions.includes('masterdata:manage')

  const selectedType = useMemo(
    () => workItemTypes.find((type) => type.id === selectedTypeId) ?? null,
    [selectedTypeId, workItemTypes]
  )

  useEffect(() => {
    if (!selectedTypeId && workItemTypes.length > 0) {
      setSelectedTypeId(workItemTypes[0].id)
    }
  }, [selectedTypeId, workItemTypes])

  useEffect(() => {
    setStateDrafts([...states].sort((a, b) => a.order - b.order))
  }, [states])

  const fetchTypeStateConfig = async (typeId: string) => {
    setStateConfigLoading(true)
    try {
      const response = await fetch(`/api/work-item-types/${typeId}/states`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error('Failed to load state machine configuration')
      }

      const payload = await response.json()
      const nextMappings = Array.isArray(payload?.mappings)
        ? payload.mappings
            .filter((row: TypeStateMappingRecord) => row?.state?.id)
            .sort((a: TypeStateMappingRecord, b: TypeStateMappingRecord) => a.order - b.order)
        : []

      const transitionMap = Array.isArray(payload?.transitions)
        ? payload.transitions.reduce(
            (acc: Record<string, TypeTransitionRecord>, row: TypeTransitionRecord) => {
              if (!row.isEnabled) {
                return acc
              }

              const key = `${row.fromStateId}->${row.toStateId}`
              acc[key] = {
                id: row.id,
                fromStateId: row.fromStateId,
                toStateId: row.toStateId,
                order: row.order,
                isEnabled: row.isEnabled,
                requiresApproval: Boolean(row.requiresApproval),
                approverRoles: Array.isArray(row.approverRoles)
                  ? row.approverRoles.filter((value): value is string => typeof value === 'string')
                  : [],
                minApprovals: typeof row.minApprovals === 'number' ? row.minApprovals : 1,
              }
              return acc
            },
            {}
          )
        : {}

      setMappedStates(nextMappings)
      setStateTransitions(transitionMap)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load type state configuration')
      setMappedStates([])
      setStateTransitions({})
    } finally {
      setStateConfigLoading(false)
    }
  }

  const fetchTypeFieldMappings = async (typeId: string) => {
    try {
      const response = await fetch(`/api/work-item-types/${typeId}/fields`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error('Failed to load field mapping configuration')
      }

      const payload = await response.json()
      const mappings = Array.isArray(payload?.mappings)
        ? payload.mappings
            .filter((row: TypeFieldMappingRecord) => row?.fieldDefinition?.id)
            .sort((a: TypeFieldMappingRecord, b: TypeFieldMappingRecord) => a.order - b.order)
        : []

      setFieldMappings(mappings)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load field mappings')
      setFieldMappings([])
    }
  }

  const fetchPlanningConfiguration = async (typeId: string) => {
    if (!currentProject) return

    setPlanningLoading(true)
    try {
      const response = await fetch(
        `/api/planning-config?projectId=${currentProject.id}&workItemTypeId=${typeId}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error('Failed to load planning configuration')
      }

      const payload = await response.json()
      const planningRows = Array.isArray(payload)
        ? payload
            .filter((row: TypeFieldMappingRecord) => row?.fieldDefinition?.id)
            .sort((a: TypeFieldMappingRecord, b: TypeFieldMappingRecord) => a.order - b.order)
        : []

      setPlanningFields(
        planningRows.map((row: TypeFieldMappingRecord) => ({
          fieldDefinitionId: row.fieldDefinitionId,
          order: row.order,
          requiredOverride: row.requiredOverride ?? null,
          isVisible: row.isVisible,
          options: Array.isArray(row.fieldDefinition.options)
            ? row.fieldDefinition.options.join('\n')
            : '',
          fieldLabel: row.fieldDefinition.label,
          dataType: row.fieldDefinition.dataType,
        }))
      )
    } catch (error) {
      console.error(error)
      toast.error('Failed to load planning configuration')
      setPlanningFields([])
    } finally {
      setPlanningLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedTypeId) return

    const timer = window.setTimeout(() => {
      void fetchTypeStateConfig(selectedTypeId)
      void fetchTypeFieldMappings(selectedTypeId)
      void fetchPlanningConfiguration(selectedTypeId)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [selectedTypeId])

  const mappedStateIds = useMemo(
    () => new Set(mappedStates.map((mapping) => mapping.stateId)),
    [mappedStates]
  )

  const transitionEntries = useMemo(
    () =>
      Object.values(stateTransitions).sort(
        (left, right) =>
          left.order - right.order ||
          left.fromStateId.localeCompare(right.fromStateId) ||
          left.toStateId.localeCompare(right.toStateId)
      ),
    [stateTransitions]
  )

  const approvalRequiredTransitionCount = useMemo(
    () => transitionEntries.filter((transition) => transition.requiresApproval).length,
    [transitionEntries]
  )

  const availableStatesForMapping = useMemo(
    () => [...stateDrafts].sort((a, b) => a.order - b.order),
    [stateDrafts]
  )

  const selectedTypeSections = useMemo<WorkItemSectionDefinition[]>(
    () => selectedType?.sections ?? [],
    [selectedType]
  )

  const previewFields = useMemo<PreviewField[]>(() => {
    const sectionTitleById = new Map(selectedTypeSections.map((section) => [section.id, section.title]))
    const planningByFieldId = new Map(
      planningFields.map((planningField) => [planningField.fieldDefinitionId, planningField])
    )

    return fieldMappings.map((mapping) => {
      const planningOverride = planningByFieldId.get(mapping.fieldDefinitionId)
      const planningOptions = planningOverride?.options.trim().length
        ? planningOverride.options
            .split('\n')
            .map((option) => option.trim())
            .filter(Boolean)
        : null

      const fallbackGroup =
        mapping.groupKey === 'details'
          ? 'Details'
          : mapping.groupKey === 'planning'
            ? 'Planning'
            : mapping.groupKey

      return {
        id: mapping.fieldDefinitionId,
        label: mapping.fieldDefinition.label,
        dataType: mapping.fieldDefinition.dataType,
        required:
          planningOverride?.requiredOverride ?? mapping.requiredOverride ?? mapping.fieldDefinition.required,
        isVisible: planningOverride?.isVisible ?? mapping.isVisible,
        options: planningOptions ?? (mapping.fieldDefinition.options ?? []),
        groupLabel: mapping.sectionId
          ? sectionTitleById.get(mapping.sectionId) ?? fallbackGroup
          : fallbackGroup,
      }
    })
  }, [fieldMappings, planningFields, selectedTypeSections])

  const previewGroups = useMemo(() => {
    const groups = new Map<string, PreviewField[]>()

    previewFields
      .filter((field) => field.isVisible)
      .forEach((field) => {
        const currentGroup = groups.get(field.groupLabel) ?? []
        currentGroup.push(field)
        groups.set(field.groupLabel, currentGroup)
      })

    return Array.from(groups.entries()).map(([title, fields]) => ({ title, fields }))
  }, [previewFields])

  const handleStateDraftDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setStateDrafts((previous) => {
      const oldIndex = previous.findIndex((row) => row.id === active.id)
      const newIndex = previous.findIndex((row) => row.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return previous
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  const handleMappedStatesDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setMappedStates((previous) => {
      const oldIndex = previous.findIndex((row) => row.stateId === active.id)
      const newIndex = previous.findIndex((row) => row.stateId === over.id)
      if (oldIndex < 0 || newIndex < 0) return previous
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  const handleFieldMappingDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setFieldMappings((previous) => {
      const oldIndex = previous.findIndex((row) => row.fieldDefinitionId === active.id)
      const newIndex = previous.findIndex((row) => row.fieldDefinitionId === over.id)
      if (oldIndex < 0 || newIndex < 0) return previous
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  const handlePlanningDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setPlanningFields((previous) => {
      const oldIndex = previous.findIndex((row) => row.fieldDefinitionId === active.id)
      const newIndex = previous.findIndex((row) => row.fieldDefinitionId === over.id)
      if (oldIndex < 0 || newIndex < 0) return previous
      return arrayMove(previous, oldIndex, newIndex)
    })
  }

  const saveStateOrdering = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    if (!currentProject) return

    setStateConfigSaving(true)
    try {
      for (const [index, state] of stateDrafts.entries()) {
        const updateResponse = await fetch(`/api/states/${state.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.name,
            color: state.color,
            category: state.category,
            isFinal: state.category === 'Done',
            order: index * 10,
          }),
        })
        if (!updateResponse.ok) {
          throw new Error(await getApiErrorMessage(updateResponse, `Failed to update state ${state.name}`))
        }
      }

      const response = await fetch(`/api/states?projectId=${currentProject.id}`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, 'Failed to refresh state configuration'))
      }

      const payload = await response.json()
      setStates(payload)

      toast.success('State order saved')
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Failed to save state order')
    } finally {
      setStateConfigSaving(false)
    }
  }

  const createState = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    if (!currentProject || !newStateName.trim()) {
      return
    }

    setStateConfigSaving(true)
    try {
      const response = await fetch('/api/states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          name: newStateName.trim(),
          color: newStateColor,
          category: newStateCategory,
          isFinal: newStateFinal || newStateCategory === 'Done',
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to create state')
        return
      }

      const state = await response.json()
      const next = [...stateDrafts, state].sort((a, b) => a.order - b.order)
      setStateDrafts(next)
      setStates(next)
      setNewStateName('')
      setNewStateColor('#64748b')
      setNewStateCategory('New')
      setNewStateFinal(false)
      toast.success('State created')
    } catch (error) {
      console.error(error)
      toast.error('Failed to create state')
    } finally {
      setStateConfigSaving(false)
    }
  }

  const updateStateRow = async (state: State) => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    setStateConfigSaving(true)
    try {
      const response = await fetch(`/api/states/${state.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.name,
          color: state.color,
          category: state.category,
          isFinal: state.category === 'Done',
          order: state.order,
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to update state')
        return
      }

      toast.success('State updated')
    } catch (error) {
      console.error(error)
      toast.error('Failed to update state')
    } finally {
      setStateConfigSaving(false)
    }
  }

  const deleteState = async (stateId: string) => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    setStateConfigSaving(true)
    try {
      const response = await fetch(`/api/states/${stateId}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to delete state')
        return
      }

      const next = stateDrafts.filter((state) => state.id !== stateId)
      setStateDrafts(next)
      setStates(next)
      setMappedStates((previous) => previous.filter((row) => row.stateId !== stateId))
      setStateTransitions((previous) => {
        const nextTransitions: Record<string, TypeTransitionRecord> = {}
        Object.entries(previous).forEach(([key, transition]) => {
          if (!key.startsWith(`${stateId}->`) && !key.endsWith(`->${stateId}`)) {
            nextTransitions[key] = transition
          }
        })
        return nextTransitions
      })
      toast.success('State deleted')
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete state')
    } finally {
      setStateConfigSaving(false)
    }
  }

  const toggleStateMapping = (state: State, enabled: boolean) => {
    if (enabled) {
      if (mappedStateIds.has(state.id)) return
      setMappedStates((previous) => [
        ...previous,
        {
          stateId: state.id,
          order: previous.length * 10,
          isInitial: previous.length === 0,
          state,
        },
      ])
      return
    }

    setMappedStates((previous) => {
      const next = previous.filter((mapping) => mapping.stateId !== state.id)
      if (next.length > 0 && !next.some((mapping) => mapping.isInitial)) {
        next[0] = { ...next[0], isInitial: true }
      }
      return next
    })

    setStateTransitions((previous) => {
      const next: Record<string, TypeTransitionRecord> = {}
      Object.entries(previous).forEach(([key, transition]) => {
        if (!key.startsWith(`${state.id}->`) && !key.endsWith(`->${state.id}`)) {
          next[key] = transition
        }
      })
      return next
    })
  }

  const setInitialState = (stateId: string) => {
    setMappedStates((previous) =>
      previous.map((mapping) => ({
        ...mapping,
        isInitial: mapping.stateId === stateId,
      }))
    )
  }

  const toggleTransition = (fromStateId: string, toStateId: string, enabled: boolean) => {
    const key = `${fromStateId}->${toStateId}`
    setStateTransitions((previous) => {
      const next = { ...previous }
      if (enabled) {
        next[key] = previous[key] ?? {
          fromStateId,
          toStateId,
          order: Object.keys(previous).length * 10,
          isEnabled: true,
          requiresApproval: false,
          approverRoles: [],
          minApprovals: 1,
        }
      } else {
        delete next[key]
      }
      return next
    })
  }

  const updateTransitionPolicy = (
    transitionKey: string,
    updater: (transition: TypeTransitionRecord) => TypeTransitionRecord
  ) => {
    setStateTransitions((previous) => {
      const current = previous[transitionKey]
      if (!current) return previous
      return {
        ...previous,
        [transitionKey]: updater(current),
      }
    })
  }

  const saveTypeStateMachine = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    if (!selectedType) return

    if (mappedStates.length === 0) {
      toast.error('At least one state must be mapped to the selected type')
      return
    }

    setStateConfigSaving(true)
    try {
      const payload = {
        stateMappings: mappedStates.map((mapping, index) => ({
          stateId: mapping.stateId,
          order: index * 10,
          isInitial: mapping.isInitial,
        })),
        transitions: transitionEntries.map((transition, index) => {
          return {
            fromStateId: transition.fromStateId,
            toStateId: transition.toStateId,
            order: index * 10,
            isEnabled: true,
            requiresApproval: transition.requiresApproval,
            approverRoles: transition.approverRoles,
            minApprovals: transition.minApprovals,
          }
        }),
      }

      const response = await fetch(`/api/work-item-types/${selectedType.id}/states`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to save state machine')
        return
      }

      toast.success('State machine updated')
      await fetchTypeStateConfig(selectedType.id)
    } catch (error) {
      console.error(error)
      toast.error('Failed to save state machine')
    } finally {
      setStateConfigSaving(false)
    }
  }

  const saveFieldMappings = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    if (!selectedType) return

    setFieldConfigSaving(true)
    try {
      const response = await fetch(`/api/work-item-types/${selectedType.id}/fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappings: fieldMappings.map((mapping, index) => ({
            fieldDefinitionId: mapping.fieldDefinitionId,
            sectionId: mapping.sectionId ?? null,
            groupKey: mapping.groupKey,
            order: index * 10,
            requiredOverride: mapping.requiredOverride ?? null,
            isVisible: mapping.isVisible,
          })),
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to save field mappings')
        return
      }

      toast.success('Field mappings saved')
      await fetchTypeFieldMappings(selectedType.id)
    } catch (error) {
      console.error(error)
      toast.error('Failed to save field mappings')
    } finally {
      setFieldConfigSaving(false)
    }
  }

  const savePlanningConfiguration = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage project configuration')
      return
    }

    if (!selectedType || !currentProject) return

    setPlanningSaving(true)
    try {
      const response = await fetch('/api/planning-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          workItemTypeId: selectedType.id,
          fields: planningFields.map((field, index) => ({
            fieldDefinitionId: field.fieldDefinitionId,
            order: index * 10,
            requiredOverride: field.requiredOverride ?? null,
            isVisible: field.isVisible,
            options:
              field.options.trim().length > 0
                ? field.options
                    .split('\n')
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                : undefined,
          })),
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}))
        toast.error(errorPayload.error || 'Failed to save planning configuration')
        return
      }

      toast.success('Planning configuration saved')
      await fetchPlanningConfiguration(selectedType.id)
    } catch (error) {
      console.error(error)
      toast.error('Failed to save planning configuration')
    } finally {
      setPlanningSaving(false)
    }
  }

  const renderTypeFilter = () => (
    <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Select work item type" />
      </SelectTrigger>
      <SelectContent>
        {workItemTypes.map((type) => (
          <SelectItem key={type.id} value={type.id}>
            {type.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const renderLivePreviewPanel = () => (
    <Card className="xl:sticky xl:top-4 h-fit">
      <CardHeader>
        <CardTitle className="text-base">Live Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedType ? (
          <div className="text-sm text-muted-foreground">Select a work item type to preview.</div>
        ) : (
          <>
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Work Item Type
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: selectedType.color || '#64748b' }}
                >
                  {selectedType.icon
                    ? selectedType.icon.slice(0, 2).toUpperCase()
                    : selectedType.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedType.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{selectedType.key}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Workflow</Label>
                <span className="text-[11px] text-muted-foreground">
                  {transitionEntries.length} transition{transitionEntries.length === 1 ? '' : 's'}
                  {approvalRequiredTransitionCount > 0
                    ? ` · ${approvalRequiredTransitionCount} approval-gated`
                    : ''}
                </span>
              </div>
              {mappedStates.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No mapped states yet.
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
                  {mappedStates.map((mapping, index) => (
                    <div key={mapping.stateId} className="flex items-center gap-1.5">
                      <Badge className={stateCategoryBadgeClass(mapping.state.category)}>
                        {mapping.state.name}
                        {mapping.isInitial ? ' (Initial)' : ''}
                      </Badge>
                      {index < mappedStates.length - 1 ? (
                        <span className="text-muted-foreground">→</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Create Form Layout</Label>
              {previewGroups.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  No visible mapped fields yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {previewGroups.map((group) => (
                    <div key={group.title} className="rounded-md border p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                      </p>
                      <div className="space-y-2">
                        {group.fields.slice(0, 6).map((field) => (
                          <div key={field.id} className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium">{field.label}</span>
                              {field.required ? (
                                <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                                  Required
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                {humanizeDataType(field.dataType)}
                              </Badge>
                            </div>
                            {renderPreviewControl(field)}
                          </div>
                        ))}
                        {group.fields.length > 6 ? (
                          <p className="text-[11px] text-muted-foreground">
                            + {group.fields.length - 6} more field{group.fields.length - 6 === 1 ? '' : 's'}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-3 p-4 md:p-5 lg:p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Admin Panel</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
            Configure work item types, dynamic states, field mappings, and planning metadata.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <div className="overflow-x-auto">
          <TabsList className="mb-3 grid h-auto w-full min-w-[44rem] grid-cols-4 rounded-xl bg-muted/20 p-1 md:w-auto">
            <TabsTrigger value="types" className="h-9 rounded-lg px-3 text-xs font-medium md:text-sm">Work Item Types</TabsTrigger>
            <TabsTrigger value="states" className="h-9 rounded-lg px-3 text-xs font-medium md:text-sm">State Management</TabsTrigger>
            <TabsTrigger value="fields" className="h-9 rounded-lg px-3 text-xs font-medium md:text-sm">Field Management</TabsTrigger>
            <TabsTrigger value="planning" className="h-9 rounded-lg px-3 text-xs font-medium md:text-sm">Planning Config</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="types" className="mt-0">
          <WorkItemTypeManagement mode="screen" />
        </TabsContent>

        <TabsContent value="states" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Project States</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="State name"
                    value={newStateName}
                    onChange={(event) => setNewStateName(event.target.value)}
                  />
                  <Input
                    type="color"
                    value={newStateColor}
                    onChange={(event) => setNewStateColor(event.target.value)}
                  />
                  <Select
                    value={newStateCategory}
                    onValueChange={(value) =>
                      setNewStateCategory(value as 'New' | 'In Progress' | 'Done')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
                    <Checkbox
                      checked={newStateFinal || newStateCategory === 'Done'}
                      onCheckedChange={(value) => setNewStateFinal(value === true)}
                      disabled={newStateCategory === 'Done'}
                    />
                    Final
                  </label>
                </div>

                <Button onClick={createState} disabled={stateConfigSaving || !newStateName.trim() || !canManageMasterData}>
                  {stateConfigSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add State
                </Button>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleStateDraftDragEnd}
                >
                  <SortableContext
                    items={stateDrafts.map((state) => state.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {stateDrafts.map((state, index) => (
                        <SortableRow key={state.id} id={state.id}>
                          <div className="grid gap-2 md:grid-cols-[1fr_120px_160px_auto_auto]">
                            <Input
                              value={state.name}
                              onChange={(event) =>
                                setStateDrafts((previous) =>
                                  previous.map((row) =>
                                    row.id === state.id
                                      ? { ...row, name: event.target.value }
                                      : row
                                  )
                                )
                              }
                            />
                            <Input
                              type="color"
                              value={state.color}
                              onChange={(event) =>
                                setStateDrafts((previous) =>
                                  previous.map((row) =>
                                    row.id === state.id
                                      ? { ...row, color: event.target.value }
                                      : row
                                  )
                                )
                              }
                            />
                            <Select
                              value={state.category}
                              onValueChange={(value) =>
                                setStateDrafts((previous) =>
                                  previous.map((row) =>
                                    row.id === state.id
                                      ? { ...row, category: value }
                                      : row
                                  )
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="New">New</SelectItem>
                                <SelectItem value="In Progress">In Progress</SelectItem>
                                <SelectItem value="Done">Done</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              onClick={() => void updateStateRow({ ...state, order: index * 10 })}
                              disabled={stateConfigSaving || !canManageMasterData}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => void deleteState(state.id)}
                              disabled={stateConfigSaving || !canManageMasterData}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </SortableRow>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                  <Button variant="secondary" onClick={saveStateOrdering} disabled={stateConfigSaving || !canManageMasterData}>
                    {stateConfigSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save State Ordering
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Type State Machine</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                {renderTypeFilter()}

                {stateConfigLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading type state machine...
                  </div>
                ) : selectedType ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Mapped States</Label>
                      {availableStatesForMapping.map((state) => (
                        <label key={state.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={mappedStateIds.has(state.id)}
                              onCheckedChange={(checked) =>
                                toggleStateMapping(state, checked === true)
                              }
                            />
                            <span className="text-sm">{state.name}</span>
                            <Badge className={stateCategoryBadgeClass(state.category)}>
                              {state.category}
                            </Badge>
                          </div>
                        </label>
                      ))}
                    </div>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleMappedStatesDragEnd}
                    >
                      <SortableContext
                        items={mappedStates.map((mapping) => mapping.stateId)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {mappedStates.map((mapping) => (
                            <SortableRow key={mapping.stateId} id={mapping.stateId}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{mapping.state.name}</span>
                                  <Badge className={stateCategoryBadgeClass(mapping.state.category)}>
                                    {mapping.state.category}
                                  </Badge>
                                </div>
                                <label className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={mapping.isInitial}
                                    onCheckedChange={() => setInitialState(mapping.stateId)}
                                  />
                                  Initial
                                </label>
                              </div>
                            </SortableRow>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {mappedStates.length > 0 ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Transitions</Label>
                        <div className="max-h-72 overflow-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-muted/40 text-left">
                                <th className="px-2 py-2 font-medium">From / To</th>
                                {mappedStates.map((toState) => (
                                  <th key={toState.stateId} className="px-2 py-2 font-medium">
                                    {toState.state.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {mappedStates.map((fromState) => (
                                <tr key={fromState.stateId} className="border-b last:border-b-0">
                                  <td className="px-2 py-2 font-medium">{fromState.state.name}</td>
                                  {mappedStates.map((toState) => {
                                    const key = `${fromState.stateId}->${toState.stateId}`
                                    return (
                                      <td key={key} className="px-2 py-2 text-center">
                                        <Checkbox
                                          checked={Boolean(stateTransitions[key])}
                                          onCheckedChange={(checked) =>
                                            toggleTransition(
                                              fromState.stateId,
                                              toState.stateId,
                                              checked === true
                                            )
                                          }
                                        />
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {transitionEntries.length > 0 ? (
                      <div className="space-y-3">
                        <Label className="text-xs text-muted-foreground">Transition Approval Policies</Label>
                        <div className="space-y-3">
                          {transitionEntries.map((transition) => {
                            const transitionKey = `${transition.fromStateId}->${transition.toStateId}`
                            const fromState = mappedStates.find(
                              (mapping) => mapping.stateId === transition.fromStateId
                            )?.state
                            const toState = mappedStates.find(
                              (mapping) => mapping.stateId === transition.toStateId
                            )?.state

                            return (
                              <div key={transitionKey} className="rounded-md border p-3 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-medium">
                                      {fromState?.name ?? transition.fromStateId}{' -> '}{toState?.name ?? transition.toStateId}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Configure whether this transition needs explicit approval.
                                    </div>
                                  </div>
                                  <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                      checked={transition.requiresApproval}
                                      onCheckedChange={(checked) =>
                                        updateTransitionPolicy(transitionKey, (current) => ({
                                          ...current,
                                          requiresApproval: checked === true,
                                        }))
                                      }
                                    />
                                    Requires approval
                                  </label>
                                </div>

                                {transition.requiresApproval ? (
                                  <>
                                    <div className="space-y-1.5">
                                      <Label className="text-xs text-muted-foreground">Minimum approvals</Label>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={20}
                                        className="w-28"
                                        value={String(transition.minApprovals)}
                                        onChange={(event) => {
                                          const parsed = Number.parseInt(event.target.value || '1', 10)
                                          updateTransitionPolicy(transitionKey, (current) => ({
                                            ...current,
                                            minApprovals: Number.isNaN(parsed) ? 1 : Math.min(Math.max(parsed, 1), 20),
                                          }))
                                        }}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <Label className="text-xs text-muted-foreground">Eligible approver roles</Label>
                                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {TRANSITION_APPROVER_ROLES.map((role) => {
                                          const checked = transition.approverRoles.includes(role)
                                          return (
                                            <label key={role} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                                              <Checkbox
                                                checked={checked}
                                                onCheckedChange={(nextChecked) =>
                                                  updateTransitionPolicy(transitionKey, (current) => ({
                                                    ...current,
                                                    approverRoles: nextChecked === true
                                                      ? [...new Set([...current.approverRoles, role])]
                                                      : current.approverRoles.filter((value) => value !== role),
                                                  }))
                                                }
                                              />
                                              {role}
                                            </label>
                                          )
                                        })}
                                      </div>
                                      <p className="text-xs text-muted-foreground">
                                        Leave all roles unchecked to fall back to Admin, PM, and DevOps approvers.
                                      </p>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    <Button onClick={saveTypeStateMachine} disabled={stateConfigSaving || !canManageMasterData}>
                      {stateConfigSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Type State Machine
                    </Button>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No work item type selected.</div>
                )}
                </CardContent>
              </Card>
            </div>
            {renderLivePreviewPanel()}
          </div>
        </TabsContent>

        <TabsContent value="fields" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Work Item Type Field Mapping</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderTypeFilter()}
                {!selectedType ? (
                  <div className="text-sm text-muted-foreground">No work item type selected.</div>
                ) : (
                  <>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleFieldMappingDragEnd}
                    >
                      <SortableContext
                        items={fieldMappings.map((mapping) => mapping.fieldDefinitionId)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {fieldMappings.map((mapping) => (
                            <SortableRow key={mapping.fieldDefinitionId} id={mapping.fieldDefinitionId}>
                              <div className="grid gap-2 lg:grid-cols-[1.4fr_160px_180px_120px_120px]">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-sm font-medium">
                                    {mapping.fieldDefinition.label}
                                  </span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {mapping.fieldDefinition.dataType}
                                  </Badge>
                                </div>

                                <Select
                                  value={mapping.groupKey}
                                  onValueChange={(value) =>
                                    setFieldMappings((previous) =>
                                      previous.map((row) =>
                                        row.fieldDefinitionId === mapping.fieldDefinitionId
                                          ? { ...row, groupKey: value }
                                          : row
                                      )
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="details">details</SelectItem>
                                    <SelectItem value="planning">planning</SelectItem>
                                    {selectedTypeSections
                                      .filter((section) =>
                                        section.key !== 'details' && section.key !== 'planning'
                                      )
                                      .map((section) => (
                                        <SelectItem key={section.id} value={section.key}>
                                          {section.key}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>

                                <Select
                                  value={mapping.sectionId ?? '__none__'}
                                  onValueChange={(value) =>
                                    setFieldMappings((previous) =>
                                      previous.map((row) =>
                                        row.fieldDefinitionId === mapping.fieldDefinitionId
                                          ? { ...row, sectionId: value === '__none__' ? null : value }
                                          : row
                                      )
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Section" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">No section</SelectItem>
                                    {selectedTypeSections.map((section) => (
                                      <SelectItem key={section.id} value={section.id}>
                                        {section.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <label className="flex items-center gap-2 rounded-md border px-3 text-xs">
                                  <Checkbox
                                    checked={mapping.isVisible}
                                    onCheckedChange={(checked) =>
                                      setFieldMappings((previous) =>
                                        previous.map((row) =>
                                          row.fieldDefinitionId === mapping.fieldDefinitionId
                                            ? { ...row, isVisible: checked === true }
                                            : row
                                        )
                                      )
                                    }
                                  />
                                  Visible
                                </label>

                                <label className="flex items-center gap-2 rounded-md border px-3 text-xs">
                                  <Checkbox
                                    checked={mapping.requiredOverride ?? mapping.fieldDefinition.required}
                                    onCheckedChange={(checked) =>
                                      setFieldMappings((previous) =>
                                        previous.map((row) =>
                                          row.fieldDefinitionId === mapping.fieldDefinitionId
                                            ? { ...row, requiredOverride: checked === true }
                                            : row
                                        )
                                      )
                                    }
                                  />
                                  Required
                                </label>
                              </div>
                            </SortableRow>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    <Button onClick={saveFieldMappings} disabled={fieldConfigSaving || !canManageMasterData}>
                      {fieldConfigSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Field Mappings
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            {renderLivePreviewPanel()}
          </div>
        </TabsContent>

        <TabsContent value="planning" className="mt-0 space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Planning Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderTypeFilter()}

                {!selectedType ? (
                  <div className="text-sm text-muted-foreground">No work item type selected.</div>
                ) : planningLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading planning fields...
                  </div>
                ) : planningFields.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No planning fields configured for this type.
                  </div>
                ) : (
                  <>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handlePlanningDragEnd}
                    >
                      <SortableContext
                        items={planningFields.map((field) => field.fieldDefinitionId)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {planningFields.map((field) => (
                            <SortableRow key={field.fieldDefinitionId} id={field.fieldDefinitionId}>
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium">{field.fieldLabel}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {field.dataType}
                                  </Badge>
                                  <label className="ml-auto flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={field.isVisible}
                                      onCheckedChange={(checked) =>
                                        setPlanningFields((previous) =>
                                          previous.map((row) =>
                                            row.fieldDefinitionId === field.fieldDefinitionId
                                              ? { ...row, isVisible: checked === true }
                                              : row
                                          )
                                        )
                                      }
                                    />
                                    Visible
                                  </label>
                                  <label className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={field.requiredOverride ?? false}
                                      onCheckedChange={(checked) =>
                                        setPlanningFields((previous) =>
                                          previous.map((row) =>
                                            row.fieldDefinitionId === field.fieldDefinitionId
                                              ? { ...row, requiredOverride: checked === true }
                                              : row
                                          )
                                        )
                                      }
                                    />
                                    Required
                                  </label>
                                </div>

                                {(field.dataType === 'single_select' || field.dataType === 'dropdown') && (
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Options</Label>
                                    <Textarea
                                      value={field.options}
                                      onChange={(event) =>
                                        setPlanningFields((previous) =>
                                          previous.map((row) =>
                                            row.fieldDefinitionId === field.fieldDefinitionId
                                              ? { ...row, options: event.target.value }
                                              : row
                                          )
                                        )
                                      }
                                      placeholder="One option per line"
                                      rows={4}
                                    />
                                  </div>
                                )}
                              </div>
                            </SortableRow>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    <Button onClick={savePlanningConfiguration} disabled={planningSaving || !canManageMasterData}>
                      {planningSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save Planning Configuration
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
            {renderLivePreviewPanel()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
