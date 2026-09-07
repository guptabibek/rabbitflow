'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useAppStore,
  type WorkItemFieldDefinition,
  type WorkItemSectionDefinition,
  type WorkItemTypeDefinition,
} from '@/store/app-store'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  Blocks,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  GripVertical,
  Hash,
  Layers,
  MoreHorizontal,
  Palette,
  Plus,
  Save,
  Search,
  Settings2,
  Shield,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

type WorkItemTypeManagementMode = 'dialog' | 'screen'

type WorkItemTypeManagementProps = {
  trigger?: React.ReactNode
  mode?: WorkItemTypeManagementMode
  onClose?: () => void
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DATA_TYPE_OPTIONS = [
  { value: 'text', label: 'Text', icon: Type, description: 'Single-line text input' },
  { value: 'markdown', label: 'Rich Text', icon: FileText, description: 'Multi-line formatted text' },
  { value: 'number', label: 'Number', icon: Hash, description: 'Numeric value' },
  { value: 'date', label: 'Date', icon: Type, description: 'Date picker' },
  { value: 'boolean', label: 'Boolean', icon: Check, description: 'True or false toggle' },
  { value: 'single_select', label: 'Single Select', icon: ChevronDown, description: 'Choose one option' },
  { value: 'multi_select', label: 'Multi Select', icon: Layers, description: 'Choose multiple options' },
  { value: 'user', label: 'User', icon: Type, description: 'User reference' },
  { value: 'iteration', label: 'Iteration', icon: Type, description: 'Iteration link' },
  { value: 'area', label: 'Area', icon: Type, description: 'Area path reference' },
  { value: 'team', label: 'Team', icon: Type, description: 'Team reference' },
] as const

const SECTION_TYPE_OPTIONS = [
  {
    value: 'fields',
    label: 'Fields',
    description: 'A section containing structured, typed fields',
    icon: Layers,
  },
  {
    value: 'markdown',
    label: 'Markdown',
    description: 'Free-form rich text content block',
    icon: FileText,
  },
  {
    value: 'system',
    label: 'System',
    description: 'Reserved system-managed section',
    icon: Shield,
  },
] as const

const MAX_TYPE_KEY_LENGTH = 80
const MAX_TYPE_LABEL_LENGTH = 120
const MAX_HIERARCHY_LEVEL = 10

// ─── Types ───────────────────────────────────────────────────────────────────

type TypeFieldForm = {
  key: string
  label: string
  description: string
  dataType: (typeof DATA_TYPE_OPTIONS)[number]['value']
  required: boolean
  placeholder: string
  options: string
  isSystem: boolean
}

type TypeSectionForm = {
  key: string
  title: string
  description: string
  sectionType: (typeof SECTION_TYPE_OPTIONS)[number]['value']
  isCollapsible: boolean
  isSystem: boolean
  fields: TypeFieldForm[]
}

type WorkItemTypeForm = {
  id: string | null
  key: string
  name: string
  description: string
  icon: string
  color: string
  hierarchyLevel: string
  isEnabled: boolean
  isSystem: boolean
  sections: TypeSectionForm[]
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function emptyField(index: number): TypeFieldForm {
  return {
    key: `field_${index + 1}`,
    label: '',
    description: '',
    dataType: 'text',
    required: false,
    placeholder: '',
    options: '',
    isSystem: false,
  }
}

function emptySection(index: number): TypeSectionForm {
  return {
    key: `section_${index + 1}`,
    title: '',
    description: '',
    sectionType: 'fields',
    isCollapsible: false,
    isSystem: false,
    fields: [],
  }
}

function createEmptyTypeForm(): WorkItemTypeForm {
  return {
    id: null,
    key: '',
    name: '',
    description: '',
    icon: '',
    color: '#64748b',
    hierarchyLevel: '4',
    isEnabled: true,
    isSystem: false,
    sections: [emptySection(0)],
  }
}

function fieldToForm(field: WorkItemFieldDefinition): TypeFieldForm {
  return {
    key: field.key,
    label: field.label,
    description: field.description ?? '',
    dataType: field.dataType as TypeFieldForm['dataType'],
    required: field.required,
    placeholder: field.placeholder ?? '',
    options: Array.isArray(field.options) ? field.options.join('\n') : '',
    isSystem: field.isSystem ?? false,
  }
}

function sectionToForm(section: WorkItemSectionDefinition): TypeSectionForm {
  return {
    key: section.key,
    title: section.title,
    description: section.description ?? '',
    sectionType: section.sectionType as TypeSectionForm['sectionType'],
    isCollapsible: section.isCollapsible,
    isSystem: section.isSystem ?? false,
    fields: section.fields.map(fieldToForm),
  }
}

function typeToForm(definition: WorkItemTypeDefinition): WorkItemTypeForm {
  return {
    id: definition.id,
    key: definition.key,
    name: definition.name,
    description: definition.description ?? '',
    icon: definition.icon ?? '',
    color: definition.color,
    hierarchyLevel: String(definition.hierarchyLevel),
    isEnabled: definition.isEnabled,
    isSystem: definition.isSystem,
    sections: definition.sections.map(sectionToForm),
  }
}

function parseOptions(options: string) {
  return options
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function validateWorkItemTypeForm(form: WorkItemTypeForm) {
  if (!form.name.trim()) {
    return 'Type name is required'
  }

  if (form.name.trim().length > MAX_TYPE_LABEL_LENGTH) {
    return `Type name cannot exceed ${MAX_TYPE_LABEL_LENGTH} characters`
  }

  if (!form.key.trim()) {
    return 'Type key is required'
  }

  if (form.key.trim().length > MAX_TYPE_KEY_LENGTH) {
    return `Type key cannot exceed ${MAX_TYPE_KEY_LENGTH} characters`
  }

  const hierarchyLevel = Number.parseInt(form.hierarchyLevel, 10)
  if (!Number.isInteger(hierarchyLevel) || hierarchyLevel < 1 || hierarchyLevel > MAX_HIERARCHY_LEVEL) {
    return `Hierarchy level must be between 1 and ${MAX_HIERARCHY_LEVEL}`
  }

  if (form.sections.length === 0) {
    return 'Add at least one section'
  }

  for (const [sectionIndex, section] of form.sections.entries()) {
    if (!section.key.trim()) {
      return `Section ${sectionIndex + 1}: key is required`
    }

    if (section.key.trim().length > MAX_TYPE_KEY_LENGTH) {
      return `Section ${sectionIndex + 1}: key cannot exceed ${MAX_TYPE_KEY_LENGTH} characters`
    }

    if (!section.title.trim()) {
      return `Section ${sectionIndex + 1}: title is required`
    }

    if (section.title.trim().length > MAX_TYPE_LABEL_LENGTH) {
      return `Section ${sectionIndex + 1}: title cannot exceed ${MAX_TYPE_LABEL_LENGTH} characters`
    }

    for (const [fieldIndex, field] of section.fields.entries()) {
      if (!field.key.trim()) {
        return `Section ${sectionIndex + 1}, field ${fieldIndex + 1}: key is required`
      }

      if (field.key.trim().length > MAX_TYPE_KEY_LENGTH) {
        return `Section ${sectionIndex + 1}, field ${fieldIndex + 1}: key cannot exceed ${MAX_TYPE_KEY_LENGTH} characters`
      }

      if (!field.label.trim()) {
        return `Section ${sectionIndex + 1}, field ${fieldIndex + 1}: label is required`
      }

      if (field.label.trim().length > MAX_TYPE_LABEL_LENGTH) {
        return `Section ${sectionIndex + 1}, field ${fieldIndex + 1}: label cannot exceed ${MAX_TYPE_LABEL_LENGTH} characters`
      }
    }
  }

  return null
}

function getDataTypeLabel(value: string) {
  return DATA_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function getSectionTypeConfig(value: string) {
  return SECTION_TYPE_OPTIONS.find((o) => o.value === value)
}

// ─── Sidebar Type Item ──────────────────────────────────────────────────────

function TypeListItem({
  definition,
  isSelected,
  onSelect,
}: {
  definition: WorkItemTypeDefinition
  isSelected: boolean
  onSelect: () => void
}) {
  const itemCount = definition._count?.issues ?? 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
        isSelected
          ? 'bg-primary/[0.08] ring-1 ring-primary/25'
          : 'hover:bg-muted/50 active:bg-muted/70'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          style={{ backgroundColor: definition.color }}
        >
          {definition.icon
            ? definition.icon.slice(0, 2).toUpperCase()
            : definition.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium leading-tight">
              {definition.name}
            </span>
            {!definition.isEnabled && (
              <span className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                Off
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {definition.key}
            </span>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <span className="text-[10px] text-muted-foreground/70">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
        </div>
      </div>

      {isSelected && (
        <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
    </button>
  )
}

// ─── Add Section Picker ─────────────────────────────────────────────────────

function AddSectionPicker({
  onAdd,
}: {
  onAdd: (sectionType: TypeSectionForm['sectionType']) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-dashed text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Section
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">Add Section</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose a section type to add to this work item type.
          </p>
        </DialogHeader>
        <div className="space-y-2 px-5 pb-5">
          {SECTION_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-start gap-3 rounded-lg border border-border/60 p-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                onClick={() => {
                  onAdd(option.value as TypeSectionForm['sectionType'])
                  setOpen(false)
                }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Field Editor Dialog ────────────────────────────────────────────────────

function FieldEditorDialog({
  field,
  fieldIndex,
  open,
  onOpenChange,
  onSave,
}: {
  field: TypeFieldForm
  fieldIndex: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (field: TypeFieldForm) => void
}) {
  const [draft, setDraft] = useState<TypeFieldForm>(field)

  useEffect(() => {
    if (!open) return

    const syncId = setTimeout(() => {
      setDraft(field)
    }, 0)

    return () => clearTimeout(syncId)
  }, [open, field])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border/50 px-5 pt-5 pb-4">
          <DialogTitle className="text-base">
            {field.label ? `Edit Field — ${field.label}` : `New Field #${fieldIndex + 1}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="field-label" className="text-xs font-medium text-muted-foreground">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="field-label"
                value={draft.label}
                maxLength={MAX_TYPE_LABEL_LENGTH}
                placeholder="e.g. Story Points"
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    label: e.target.value,
                    key: p.isSystem ? p.key : p.key || slugify(e.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="field-key" className="text-xs font-medium text-muted-foreground">
                Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="field-key"
                value={draft.key}
                maxLength={MAX_TYPE_KEY_LENGTH}
                className="font-mono text-xs"
                placeholder="story_points"
                onChange={(e) => setDraft((p) => ({ ...p, key: slugify(e.target.value) }))}
                disabled={draft.isSystem}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Data Type</Label>
              <Select
                value={draft.dataType}
                onValueChange={(v) =>
                  setDraft((p) => ({ ...p, dataType: v as TypeFieldForm['dataType'] }))
                }
                disabled={draft.isSystem}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="field-placeholder" className="text-xs font-medium text-muted-foreground">
                Placeholder
              </Label>
              <Input
                id="field-placeholder"
                value={draft.placeholder}
                placeholder="Placeholder text..."
                onChange={(e) => setDraft((p) => ({ ...p, placeholder: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="field-desc" className="text-xs font-medium text-muted-foreground">
              Description
            </Label>
            <Input
              id="field-desc"
              value={draft.description}
              placeholder="Help text shown to users"
              onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <Switch
                checked={draft.required}
                onCheckedChange={(v) => setDraft((p) => ({ ...p, required: v }))}
                disabled={draft.isSystem}
              />
              <span className="text-sm">Required</span>
            </label>
          </div>

          {(draft.dataType === 'single_select' || draft.dataType === 'multi_select') && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Options
              </Label>
              <Textarea
                value={draft.options}
                onChange={(e) => setDraft((p) => ({ ...p, options: e.target.value }))}
                rows={4}
                placeholder={'Option A\nOption B\nOption C'}
              />
              <p className="text-[11px] text-muted-foreground">One option per line</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3.5">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(draft)
              onOpenChange(false)
            }}
            disabled={!draft.label.trim() || !draft.key.trim()}
          >
            {field.label ? 'Update Field' : 'Add Field'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Field Row (table-like) ─────────────────────────────────────────────────

function FieldRow({
  field,
  fieldIndex,
  sectionIndex,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: TypeFieldForm
  fieldIndex: number
  sectionIndex: number
  onEdit: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  return (
    <div className="group flex items-center gap-0 border-b border-border/30 last:border-b-0 transition-colors hover:bg-muted/30">
      <div className="flex w-8 shrink-0 items-center justify-center text-muted-foreground/30">
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-1 items-center gap-3 py-2 pr-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium">
              {field.label || `Field ${fieldIndex + 1}`}
            </span>
            {field.isSystem && (
              <Badge variant="outline" className="border-warning/30 bg-warning/5 text-[9px] text-warning dark:text-warning">
                System
              </Badge>
            )}
            {field.required && (
              <span className="text-[9px] font-semibold uppercase tracking-wider text-destructive">
                Required
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-muted-foreground/60">{field.key}</span>
        </div>

        <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
          {getDataTypeLabel(field.dataType)}
        </Badge>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit field" onClick={onEdit}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>Edit field</TooltipContent>
          </Tooltip>

          {!field.isSystem && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Field options">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {!isFirst && (
                  <DropdownMenuItem onClick={onMoveUp}>Move up</DropdownMenuItem>
                )}
                {!isLast && (
                  <DropdownMenuItem onClick={onMoveDown}>Move down</DropdownMenuItem>
                )}
                {(!isFirst || !isLast) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onRemove}
                >
                  Remove field
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Section Card ───────────────────────────────────────────────────────────

function SectionCard({
  section,
  sectionIndex,
  totalSections,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: TypeSectionForm
  sectionIndex: number
  totalSections: number
  onUpdate: (updater: (s: TypeSectionForm) => TypeSectionForm) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null)
  const [showFieldDialog, setShowFieldDialog] = useState(false)
  const sectionTypeCfg = getSectionTypeConfig(section.sectionType)

  const handleFieldSave = (updatedField: TypeFieldForm) => {
    if (editingFieldIndex !== null && editingFieldIndex < section.fields.length) {
      onUpdate((s) => ({
        ...s,
        fields: s.fields.map((f, i) => (i === editingFieldIndex ? updatedField : f)),
      }))
    } else {
      onUpdate((s) => ({
        ...s,
        fields: [...s.fields, updatedField],
      }))
    }
    setEditingFieldIndex(null)
  }

  const moveField = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction
    onUpdate((s) => {
      const next = [...s.fields]
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return { ...s, fields: next }
    })
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/50 transition-shadow hover:shadow-sm">
          {/* Section Header */}
          <div className="flex items-center gap-0 border-b border-border/40 bg-muted/20">
            <div className="flex w-9 shrink-0 items-center justify-center text-muted-foreground/30">
              <GripVertical className="h-3.5 w-3.5" />
            </div>

            <CollapsibleTrigger className="flex flex-1 items-center gap-2.5 py-3 pr-2 text-left outline-none">
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <span className="text-[13px] font-semibold">
                {section.title || `Section ${sectionIndex + 1}`}
              </span>
              {section.isSystem && (
                <Badge variant="outline" className="border-warning/30 bg-warning/5 text-[9px] text-warning dark:text-warning">
                  System
                </Badge>
              )}
              <Badge variant="secondary" className="text-[9px] font-normal">
                {sectionTypeCfg?.label ?? section.sectionType}
              </Badge>
              {section.fields.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50">
                  {section.fields.length} {section.fields.length === 1 ? 'field' : 'fields'}
                </span>
              )}
            </CollapsibleTrigger>

            {!section.isSystem && (
              <div className="flex items-center gap-0.5 pr-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Section options">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {sectionIndex > 0 && (
                      <DropdownMenuItem onClick={onMoveUp}>Move up</DropdownMenuItem>
                    )}
                    {sectionIndex < totalSections - 1 && (
                      <DropdownMenuItem onClick={onMoveDown}>Move down</DropdownMenuItem>
                    )}
                    {(sectionIndex > 0 || sectionIndex < totalSections - 1) && (
                      <DropdownMenuSeparator />
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={onRemove}
                    >
                      Remove section
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          <CollapsibleContent>
            {/* Section Metadata */}
            <div className="space-y-4 border-b border-border/30 px-5 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Title
                  </Label>
                  <Input
                    value={section.title}
                    maxLength={MAX_TYPE_LABEL_LENGTH}
                    placeholder="Section title"
                    onChange={(e) =>
                      onUpdate((s) => ({
                        ...s,
                        title: e.target.value,
                        key: s.isSystem ? s.key : s.key || slugify(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Key
                  </Label>
                  <Input
                    value={section.key}
                    maxLength={MAX_TYPE_KEY_LENGTH}
                    className="font-mono text-xs"
                    placeholder="section_key"
                    onChange={(e) =>
                      onUpdate((s) => ({ ...s, key: slugify(e.target.value) }))
                    }
                    disabled={section.isSystem}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    Type
                  </Label>
                  <Select
                    value={section.sectionType}
                    onValueChange={(v) =>
                      onUpdate((s) => ({
                        ...s,
                        sectionType: v as TypeSectionForm['sectionType'],
                      }))
                    }
                    disabled={section.isSystem}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTION_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <Switch
                      checked={section.isCollapsible}
                      onCheckedChange={(v) =>
                        onUpdate((s) => ({ ...s, isCollapsible: v }))
                      }
                      disabled={section.isSystem}
                    />
                    <div>
                      <p className="text-[13px] font-medium leading-tight">Collapsible</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Users can collapse in detail view
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Description
                </Label>
                <Textarea
                  value={section.description}
                  onChange={(e) =>
                    onUpdate((s) => ({ ...s, description: e.target.value }))
                  }
                  rows={2}
                  placeholder="Optional description for this section..."
                  className="resize-none"
                />
              </div>
            </div>

            {/* Fields List */}
            <div className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h5 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Fields
                  </h5>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-primary hover:text-primary"
                  onClick={() => {
                    setEditingFieldIndex(section.fields.length)
                    setShowFieldDialog(true)
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add Field
                </Button>
              </div>

              {section.fields.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-border/40">
                  {/* Field table header */}
                  <div className="flex items-center gap-0 border-b border-border/40 bg-muted/30 px-8 py-1.5">
                    <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Field
                    </span>
                    <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Type
                    </span>
                    <span className="w-16 shrink-0" />
                  </div>
                  {section.fields.map((field, fieldIndex) => (
                    <FieldRow
                      key={`${field.key}-${fieldIndex}`}
                      field={field}
                      fieldIndex={fieldIndex}
                      sectionIndex={sectionIndex}
                      isFirst={fieldIndex === 0}
                      isLast={fieldIndex === section.fields.length - 1}
                      onEdit={() => {
                        setEditingFieldIndex(fieldIndex)
                        setShowFieldDialog(true)
                      }}
                      onRemove={() =>
                        onUpdate((s) => ({
                          ...s,
                          fields: s.fields.filter((_, i) => i !== fieldIndex),
                        }))
                      }
                      onMoveUp={() => moveField(fieldIndex, -1)}
                      onMoveDown={() => moveField(fieldIndex, 1)}
                    />
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingFieldIndex(section.fields.length)
                    setShowFieldDialog(true)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 py-6 text-muted-foreground/50 transition-colors hover:border-primary/30 hover:bg-primary/[0.02] hover:text-primary/70"
                >
                  <Plus className="h-4 w-4" />
                  <span className="text-sm">Add the first field to this section</span>
                </button>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Field Editor Dialog */}
      {showFieldDialog && editingFieldIndex !== null && (
        <FieldEditorDialog
          field={
            editingFieldIndex < section.fields.length
              ? section.fields[editingFieldIndex]
              : emptyField(section.fields.length)
          }
          fieldIndex={editingFieldIndex}
          open={showFieldDialog}
          onOpenChange={setShowFieldDialog}
          onSave={handleFieldSave}
        />
      )}
    </>
  )
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function WorkItemTypeManagement({
  trigger,
  mode = 'dialog',
  onClose,
}: WorkItemTypeManagementProps = {}) {
  const currentProject = useAppStore((state) => state.currentProject)
  const currentProjectPermissions = useAppStore((state) => state.currentProjectPermissions)
  const setWorkItemTypes = useAppStore((state) => state.setWorkItemTypes)
  const workItemTypes = useAppStore((state) => state.workItemTypes)
  const [open, setOpen] = useState(false)
  const isScreenMode = mode === 'screen'
  const isVisible = isScreenMode || open
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [typeDefinitions, setTypeDefinitions] = useState<WorkItemTypeDefinition[]>([])
  const [form, setForm] = useState<WorkItemTypeForm>(createEmptyTypeForm())
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [activeTab, setActiveTab] = useState('general')
  const formSnapshotRef = useRef<string>('')
  const canManageMasterData = currentProjectPermissions.includes('masterdata:manage')

  const sortedTypes = useMemo(
    () =>
      [...typeDefinitions].sort(
        (left, right) => left.order - right.order || left.name.localeCompare(right.name)
      ),
    [typeDefinitions]
  )

  const filteredTypes = useMemo(() => {
    if (!searchQuery.trim()) return sortedTypes
    const q = searchQuery.toLowerCase()
    return sortedTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q)
    )
  }, [sortedTypes, searchQuery])

  const hierarchyOptions = useMemo(() => {
    const namesByLevel = new Map<number, string[]>()
    for (const type of sortedTypes) {
      const existing = namesByLevel.get(type.hierarchyLevel) ?? []
      namesByLevel.set(type.hierarchyLevel, [...existing, type.name])
    }

    const currentLevel = Number.parseInt(form.hierarchyLevel, 10)
    const maxLevel = Math.min(
      MAX_HIERARCHY_LEVEL,
      Math.max(5, currentLevel || 1, ...Array.from(namesByLevel.keys()))
    )

    return Array.from({ length: maxLevel }, (_, index) => {
      const level = index + 1
      const levelNames = namesByLevel.get(level) ?? []
      const suffix = levelNames.length > 0 ? ` - ${levelNames.join(', ')}` : ''
      return {
        value: String(level),
        label: `Level ${level}${suffix}`,
      }
    })
  }, [form.hierarchyLevel, sortedTypes])

  const userStoryType = useMemo(
    () => sortedTypes.find((type) => type.key === 'story') ?? null,
    [sortedTypes]
  )

  // Track dirty state
  useEffect(() => {
    const current = JSON.stringify(form)
    setIsDirty(current !== formSnapshotRef.current)
  }, [form])

  const snapshotForm = useCallback((f: WorkItemTypeForm) => {
    formSnapshotRef.current = JSON.stringify(f)
    setIsDirty(false)
  }, [])

  const loadTypes = useCallback(
    async (signal?: AbortSignal) => {
      if (!currentProject) return

      setIsLoading(true)
      try {
        const response = await fetch(
          `/api/work-item-types?projectId=${currentProject.id}&includeDisabled=true`,
          { signal }
        )

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          toast.error(error.error || 'Failed to load work item types')
          return
        }

        const payload = await response.json()
        if (signal?.aborted) {
          return
        }

        setTypeDefinitions(payload)

        if (!selectedTypeId && payload.length > 0) {
          const firstForm = typeToForm(payload[0])
          setSelectedTypeId(payload[0].id)
          setForm(firstForm)
          snapshotForm(firstForm)
        }
      } catch (caughtError) {
        if (caughtError instanceof Error && caughtError.name === 'AbortError') {
          return
        }

        console.error('Failed to load work item types:', caughtError)
        toast.error('Failed to load work item types')
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
        }
      }
    },
    [currentProject, selectedTypeId, snapshotForm]
  )

  const refreshEnabledTypes = async () => {
    if (!currentProject) return

    try {
      const response = await fetch(`/api/work-item-types?projectId=${currentProject.id}`)
      if (!response.ok) return
      setWorkItemTypes(await response.json())
    } catch (caughtError) {
      console.error('Failed to refresh enabled work item types:', caughtError)
    }
  }

  useEffect(() => {
    if (!isVisible || !currentProject) return
    const controller = new AbortController()
    void loadTypes(controller.signal)
    return () => controller.abort()
  }, [currentProject, isVisible, loadTypes])

  useEffect(() => {
    if (!selectedTypeId) return
    const selectedType = sortedTypes.find((type) => type.id === selectedTypeId)
    if (selectedType) {
      const f = typeToForm(selectedType)
      setForm(f)
      snapshotForm(f)
    }
  }, [selectedTypeId, sortedTypes, snapshotForm])

  const selectType = (id: string) => {
    setSelectedTypeId(id)
    setActiveTab('general')
  }

  const resetForCreate = () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage work item types')
      return
    }

    setSelectedTypeId(null)
    const f = createEmptyTypeForm()
    setForm(f)
    snapshotForm(f)
    setActiveTab('general')
  }

  const setSection = (index: number, updater: (section: TypeSectionForm) => TypeSectionForm) => {
    setForm((previous) => ({
      ...previous,
      sections: previous.sections.map((section, sectionIndex) =>
        sectionIndex === index ? updater(section) : section
      ),
    }))
  }

  const moveSection = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction
    setForm((previous) => {
      const next = [...previous.sections]
      ;[next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]]
      return { ...previous, sections: next }
    })
  }

  const handleSave = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage work item types')
      return
    }

    if (!currentProject) return

    const validationError = validateWorkItemTypeForm(form)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        projectId: currentProject.id,
        key: form.key.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        color: form.color.trim() || null,
        hierarchyLevel: Number.parseInt(form.hierarchyLevel, 10) || 4,
        isEnabled: form.isEnabled,
        sections: form.sections.map((section) => ({
          key: section.key.trim(),
          title: section.title.trim(),
          description: section.description.trim() || null,
          sectionType: section.sectionType,
          isCollapsible: section.isCollapsible,
          fields: section.fields.map((field) => ({
            key: field.key.trim(),
            label: field.label.trim(),
            description: field.description.trim() || null,
            dataType: field.dataType,
            required: field.required,
            placeholder: field.placeholder.trim() || null,
            options:
              field.dataType === 'single_select' || field.dataType === 'multi_select'
                ? parseOptions(field.options)
                : undefined,
          })),
        })),
      }

      const response = await fetch(
        form.id ? `/api/work-item-types/${form.id}` : '/api/work-item-types',
        {
          method: form.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to save work item type')
        return
      }

      const savedDefinition = await response.json()
      const nextDefinitions = form.id
        ? typeDefinitions.map((d) => (d.id === savedDefinition.id ? savedDefinition : d))
        : [...typeDefinitions, savedDefinition]

      setTypeDefinitions(nextDefinitions)
      setSelectedTypeId(savedDefinition.id)
      const savedForm = typeToForm(savedDefinition)
      setForm(savedForm)
      snapshotForm(savedForm)
      await refreshEnabledTypes()
      toast.success(form.id ? 'Work item type updated' : 'Work item type created')
    } catch (caughtError) {
      console.error('Failed to save work item type:', caughtError)
      toast.error('Failed to save work item type')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage work item types')
      return
    }

    if (!form.id) return

    try {
      const response = await fetch(`/api/work-item-types/${form.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete work item type')
        return
      }

      const nextDefinitions = typeDefinitions.filter((d) => d.id !== form.id)
      setTypeDefinitions(nextDefinitions)
      if (nextDefinitions.length > 0) {
        setSelectedTypeId(nextDefinitions[0].id)
        const f = typeToForm(nextDefinitions[0])
        setForm(f)
        snapshotForm(f)
      } else {
        resetForCreate()
      }
      await refreshEnabledTypes()
      toast.success('Work item type deleted')
    } catch (caughtError) {
      console.error('Failed to delete work item type:', caughtError)
      toast.error('Failed to delete work item type')
    }
  }

  const handleDuplicate = () => {
    if (!canManageMasterData) {
      toast.error('You do not have permission to manage work item types')
      return
    }

    setSelectedTypeId(null)
    const duplicated: WorkItemTypeForm = {
      ...form,
      id: null,
      name: `${form.name} (Copy)`,
      key: `${form.key}_copy`,
      isSystem: false,
    }
    setForm(duplicated)
    snapshotForm(duplicated)
    setActiveTab('general')
    toast.info('Duplicated — edit and save as new type')
  }

  if (!currentProject) return null

  const totalFieldCount = form.sections.reduce((sum, s) => sum + s.fields.length, 0)

  const titleHeader = (
    <div className="border-b border-border/50 bg-muted/20 px-5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-[15px]">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Blocks className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold">Work Item Types</span>
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {typeDefinitions.length} {typeDefinitions.length === 1 ? 'type' : 'types'}
          </Badge>
        </div>
        {isScreenMode && onClose && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onClose}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        )}
      </div>
    </div>
  )

  const editorBody = (
    <div className={`flex ${isScreenMode ? 'min-h-0 flex-1' : 'h-[calc(92vh-56px)]'}`}>
      {/* ── Left Sidebar ────────────────────────────────────────── */}
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border/50 bg-muted/[0.03]">
        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search types..."
              className="h-8 pl-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Type List */}
        <div className="flex-1 overflow-y-auto px-2">
          <div className="space-y-0.5 pb-2">
            {filteredTypes.map((definition) => (
              <TypeListItem
                key={definition.id}
                definition={definition}
                isSelected={selectedTypeId === definition.id}
                onSelect={() => selectType(definition.id)}
              />
            ))}

            {!isLoading && filteredTypes.length === 0 && sortedTypes.length > 0 && (
              <div className="px-3 py-6 text-center">
                <p className="text-xs text-muted-foreground">No matching types</p>
              </div>
            )}

            {!isLoading && sortedTypes.length === 0 && (
              <div className="px-3 py-8 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50">
                  <Blocks className="h-5 w-5 text-muted-foreground/40" />
                </div>
                <p className="text-[13px] font-medium">No types defined</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first work item type to get started.
                </p>
              </div>
            )}

            {isLoading && (
              <div className="space-y-2 px-1 pt-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/30" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* New Type Button */}
        <div className="border-t border-border/40 p-3">
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={resetForCreate}
          >
            <Plus className="h-3.5 w-3.5" />
            New Work Item Type
          </Button>
        </div>
      </div>

      {/* ── Main Editor ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Editor Header */}
        <div className="flex items-center justify-between border-b border-border/50 bg-background px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: form.color || '#64748b' }}
            >
              {form.icon
                ? form.icon.slice(0, 2).toUpperCase()
                : form.name
                ? form.name.slice(0, 2).toUpperCase()
                : 'NW'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold leading-tight">
                  {form.name || 'New Work Item Type'}
                </h2>
                {form.isSystem && (
                  <Badge variant="outline" className="border-warning/30 bg-warning/5 text-[9px] text-warning dark:text-warning">
                    System
                  </Badge>
                )}
                {form.id && !form.isEnabled && (
                  <Badge variant="secondary" className="text-[9px]">
                    Disabled
                  </Badge>
                )}
                {isDirty && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                    Unsaved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {form.key && (
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {form.key}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/40">·</span>
                <span className="text-[10px] text-muted-foreground/60">
                  {form.sections.length} {form.sections.length === 1 ? 'section' : 'sections'}
                </span>
                <span className="text-[10px] text-muted-foreground/40">·</span>
                <span className="text-[10px] text-muted-foreground/60">
                  {totalFieldCount} {totalFieldCount === 1 ? 'field' : 'fields'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {form.id && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Work item type actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  {!form.isSystem && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs px-4"
              onClick={handleSave}
              disabled={isSaving || !form.name.trim() || !form.key.trim() || !canManageMasterData}
            >
              {isSaving ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  {form.id ? 'Save Changes' : 'Create Type'}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Tabs + Content */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="border-b border-border/50 bg-background px-6">
            <TabsList className="h-10 w-auto bg-transparent p-0 gap-0">
              <TabsTrigger
                value="general"
                className="relative h-10 rounded-none border-b-2 border-transparent px-4 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                General
              </TabsTrigger>
              <TabsTrigger
                value="schema"
                className="relative h-10 rounded-none border-b-2 border-transparent px-4 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Sections & Fields
                {totalFieldCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[9px]">
                    {totalFieldCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="relative h-10 rounded-none border-b-2 border-transparent px-4 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* ── General Tab ────────────────────────────────────── */}
            <TabsContent value="general" className="mt-0 outline-none">
              <div className="mx-auto max-w-2xl space-y-8 px-6 py-6">
                {/* Identity */}
                <section>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">Identity</h3>
                    <p className="text-xs text-muted-foreground">
                      Define the display name, unique key, and visual identity.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="type-name" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="type-name"
                          value={form.name}
                          maxLength={MAX_TYPE_LABEL_LENGTH}
                          placeholder="e.g. User Story, Bug, Task"
                          onChange={(e) =>
                            setForm((p) => {
                              const nextName = e.target.value
                              return {
                                ...p,
                                name: nextName,
                                key:
                                  p.id && p.isSystem
                                    ? p.key
                                    : p.key || slugify(nextName),
                              }
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="type-key" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          Key <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="type-key"
                          value={form.key}
                          maxLength={MAX_TYPE_KEY_LENGTH}
                          placeholder="user_story"
                          onChange={(e) =>
                            setForm((p) => ({ ...p, key: slugify(e.target.value) }))
                          }
                          className="font-mono text-xs"
                          disabled={form.isSystem && !!form.id}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="type-description" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        Description
                      </Label>
                      <Textarea
                        id="type-description"
                        value={form.description}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, description: e.target.value }))
                        }
                        rows={3}
                        placeholder="Describe when to use this work item type..."
                        className="resize-none"
                      />
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Appearance */}
                <section>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">Appearance</h3>
                    <p className="text-xs text-muted-foreground">
                      Customize how this type appears across the application.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="type-icon" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          Icon
                        </Label>
                        <Input
                          id="type-icon"
                          value={form.icon}
                          placeholder="e.g. bug, story"
                          onChange={(e) =>
                            setForm((p) => ({ ...p, icon: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="type-color" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          Color
                        </Label>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <input
                              type="color"
                              value={form.color}
                              onChange={(e) =>
                                setForm((p) => ({ ...p, color: e.target.value }))
                              }
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <div
                              className="h-9 w-9 rounded-md border border-border/50 shadow-sm"
                              style={{ backgroundColor: form.color }}
                            />
                          </div>
                          <Input
                            id="type-color"
                            value={form.color}
                            onChange={(e) =>
                              setForm((p) => ({ ...p, color: e.target.value }))
                            }
                            className="flex-1 font-mono text-xs"
                            placeholder="#64748b"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-lg border border-border/40 bg-muted/20 p-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        Preview
                      </p>
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white shadow"
                          style={{ backgroundColor: form.color || '#64748b' }}
                        >
                          {form.icon
                            ? form.icon.slice(0, 2).toUpperCase()
                            : form.name
                            ? form.name.slice(0, 2).toUpperCase()
                            : '??'}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {form.name || 'Untitled Type'}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {form.key || 'no_key'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Hierarchy */}
                <section>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">Hierarchy</h3>
                    <p className="text-xs text-muted-foreground">
                          Position this type within the work item hierarchy for parent/child relationships.
                    </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/80">
                          Lower level number means higher in the tree. Parent must be a lower level than child.
                          {userStoryType
                            ? ` User Story is currently Level ${userStoryType.hierarchyLevel}.`
                            : ''}
                        </p>
                  </div>

                  <div className="max-w-xs space-y-1.5">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      Level
                    </Label>
                    <Select
                      value={form.hierarchyLevel}
                      onValueChange={(v) =>
                        setForm((p) => ({ ...p, hierarchyLevel: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                            {hierarchyOptions.map((l) => (
                          <SelectItem key={l.value} value={l.value}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </section>
              </div>
            </TabsContent>

            {/* ── Schema Tab ─────────────────────────────────────── */}
            <TabsContent value="schema" className="mt-0 outline-none">
              <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Sections & Fields</h3>
                    <p className="text-xs text-muted-foreground">
                      Define the structure of this work item type. Sections group related fields.
                    </p>
                  </div>
                  <AddSectionPicker
                    onAdd={(sectionType) =>
                      setForm((p) => ({
                        ...p,
                        sections: [
                          ...p.sections,
                          {
                            ...emptySection(p.sections.length),
                            sectionType,
                          },
                        ],
                      }))
                    }
                  />
                </div>

                {form.sections.length > 0 ? (
                  <div className="space-y-4">
                    {form.sections.map((section, sectionIndex) => (
                      <SectionCard
                        key={`${section.key}-${sectionIndex}`}
                        section={section}
                        sectionIndex={sectionIndex}
                        totalSections={form.sections.length}
                        onUpdate={(updater) => setSection(sectionIndex, updater)}
                        onRemove={() =>
                          setForm((p) => ({
                            ...p,
                            sections: p.sections.filter((_, i) => i !== sectionIndex),
                          }))
                        }
                        onMoveUp={() => moveSection(sectionIndex, -1)}
                        onMoveDown={() => moveSection(sectionIndex, 1)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 py-16">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
                      <Layers className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium">No sections defined</p>
                    <p className="mt-1 max-w-xs text-center text-xs text-muted-foreground">
                      Add a section to start building the schema for this work item type.
                    </p>
                    <AddSectionPicker
                      onAdd={(sectionType) =>
                        setForm((p) => ({
                          ...p,
                          sections: [
                            {
                              ...emptySection(0),
                              sectionType,
                            },
                          ],
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Settings Tab ───────────────────────────────────── */}
            <TabsContent value="settings" className="mt-0 outline-none">
              <div className="mx-auto max-w-2xl space-y-8 px-6 py-6">
                <section>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">Availability</h3>
                    <p className="text-xs text-muted-foreground">
                      Control whether this type can be used to create new work items.
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 p-4">
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                      <div>
                        <p className="text-[13px] font-medium">Enabled</p>
                        <p className="text-xs text-muted-foreground">
                          When disabled, this type is preserved but hidden from creation menus.
                          Existing items of this type remain accessible.
                        </p>
                      </div>
                      <Switch
                        checked={form.isEnabled}
                        onCheckedChange={(v) =>
                          setForm((p) => ({ ...p, isEnabled: v }))
                        }
                      />
                    </label>
                  </div>
                </section>

                <Separator />

                {form.id && !form.isSystem && (
                  <section>
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
                      <p className="text-xs text-muted-foreground">
                        Irreversible actions that affect existing data.
                      </p>
                    </div>

                    <div className="rounded-lg border border-destructive/20 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[13px] font-medium">Delete this work item type</p>
                          <p className="text-xs text-muted-foreground">
                            Permanently remove this type definition. Existing work items must be
                            migrated first.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteDialogOpen(true)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete Type
                        </Button>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )

  if (isScreenMode) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {titleHeader}
        {editorBody}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete &ldquo;{form.name}&rdquo;?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this work item type definition. Existing work items
                of this type must be migrated before deletion. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  void handleDelete()
                }}
              >
                Delete Permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Types</span>
            {workItemTypes.length > 0 && (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                {workItemTypes.length}
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-[1340px] overflow-hidden p-0 gap-0">
        {titleHeader}
        {editorBody}
      </DialogContent>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{form.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this work item type definition. Existing work items
              of this type must be migrated before deletion. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteDialogOpen(false)
                void handleDelete()
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
