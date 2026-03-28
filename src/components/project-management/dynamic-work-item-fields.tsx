'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type {
  Area,
  Team,
  User,
  Iteration,
  WorkItemSectionDefinition,
} from '@/store/app-store'

const EMPTY_SELECT = '__none__'
const HIDDEN_SYSTEM_FIELD_KEYS = new Set(['story_points'])

type DynamicWorkItemFieldsProps = {
  sections: WorkItemSectionDefinition[]
  values: Record<string, unknown>
  users: User[]
  iterations: Iteration[]
  areas: Area[]
  teams: Team[]
  onChange: (key: string, value: unknown) => void
}

export function DynamicWorkItemFields({
  sections,
  values,
  users,
  iterations,
  areas,
  teams,
  onChange,
}: DynamicWorkItemFieldsProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  if (sections.length === 0) return null

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section
          key={section.id}
          className="p-0"
        >
          {/* Header */}
          <div className="mb-4">
            {section.isCollapsible ? (
              <Button
                type="button"
                variant="ghost"
                className="group flex items-center gap-2 px-0 py-0 text-left hover:bg-transparent"
                onClick={() =>
                  setCollapsedSections((previous) => ({
                    ...previous,
                    [section.id]: !previous[section.id],
                  }))
                }
              >
                <span className="flex items-center justify-center rounded-md border p-1">
                  {collapsedSections[section.id] ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className="text-sm font-semibold tracking-tight">
                  {section.title}
                </span>
              </Button>
            ) : (
              <h3 className="text-sm font-semibold tracking-tight">
                {section.title}
              </h3>
            )}

            {section.description && (
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {section.description}
              </p>
            )}
          </div>

          {/* Fields */}
          <div
            className={`grid gap-5 grid-cols-1 ${
              section.isCollapsible && collapsedSections[section.id]
                ? 'hidden'
                : ''
            }`}
          >
            {section.fields.map((field) => {
              if (HIDDEN_SYSTEM_FIELD_KEYS.has(field.key)) return null

              const value = values[field.key]

              const baseWrapper =
                'space-y-1.5 transition-all duration-200'

              if (field.dataType === 'markdown') {
                return (
                  <div key={field.id} className={`${baseWrapper} md:col-span-2`}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <Textarea
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => onChange(field.key, e.target.value)}
                      placeholder={field.placeholder || undefined}
                      rows={6}
                      className="w-full rounded-xl border-muted focus-visible:ring-2"
                    />
                  </div>
                )
              }

              if (field.dataType === 'text') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <Input
                      className="rounded-xl w-full"
                      value={typeof value === 'string' ? value : ''}
                      onChange={(e) => onChange(field.key, e.target.value)}
                      placeholder={field.placeholder || undefined}
                    />
                  </div>
                )
              }

              if (field.dataType === 'number') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <Input
                      type="number"
                      value={typeof value === 'number' ? String(value) : ''}
                      onChange={(e) =>
                        onChange(
                          field.key,
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                      placeholder={field.placeholder || undefined}
                      className="rounded-xl"
                    />
                  </div>
                )
              }

              if (field.dataType === 'date') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <Input
                      type="date"
                      value={typeof value === 'string' ? value.slice(0, 10) : ''}
                      onChange={(e) => onChange(field.key, e.target.value || null)}
                      className="rounded-xl"
                    />
                  </div>
                )
              }

              if (field.dataType === 'boolean') {
                return (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded-xl border bg-muted/30 p-4 hover:bg-muted/50 transition"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {field.label}
                      </div>
                      {field.description && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {field.description}
                        </p>
                      )}
                    </div>
                    <Checkbox
                      checked={Boolean(value)}
                      onCheckedChange={(checked) =>
                        onChange(field.key, checked === true)
                      }
                    />
                  </div>
                )
              }

              if (field.dataType === 'single_select') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <Select
                      value={
                        typeof value === 'string' && value
                          ? value
                          : EMPTY_SELECT
                      }
                      onValueChange={(next) =>
                        onChange(field.key, next === EMPTY_SELECT ? null : next)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={field.placeholder || 'Select'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>None</SelectItem>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

              if (field.dataType === 'multi_select') {
                const currentValues = Array.isArray(value)
                  ? value.filter((v): v is string => typeof v === 'string')
                  : []

                return (
                  <div key={field.id} className={`${baseWrapper} md:col-span-2`}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(field.options || []).map((option) => {
                        const selected = currentValues.includes(option)
                        return (
                          <Badge
                            key={option}
                            variant={selected ? 'default' : 'outline'}
                            className="cursor-pointer rounded-full px-3 py-1 text-xs transition hover:scale-105"
                            onClick={() =>
                              onChange(
                                field.key,
                                selected
                                  ? currentValues.filter((i) => i !== option)
                                  : [...currentValues, option]
                              )
                            }
                          >
                            {option}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                )
              }

              const renderSelect = (
                items: { id: string; label: string }[],
                placeholder: string
              ) => (
                <Select
                  value={
                    typeof value === 'string' && value ? value : EMPTY_SELECT
                  }
                  onValueChange={(next) =>
                    onChange(field.key, next === EMPTY_SELECT ? null : next)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT}>None</SelectItem>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )

              if (field.dataType === 'user') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    {renderSelect(
                      users.map((u) => ({ id: u.id, label: u.name })),
                      'Select a user'
                    )}
                  </div>
                )
              }

              if (field.dataType === 'iteration') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    {renderSelect(
                      iterations.map((i) => ({
                        id: i.id,
                        label: i.path || i.name,
                      })),
                      'Select an iteration'
                    )}
                  </div>
                )
              }

              if (field.dataType === 'area') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    {renderSelect(
                      areas.map((a) => ({
                        id: a.id,
                        label: a.path || a.name,
                      })),
                      'Select an area'
                    )}
                  </div>
                )
              }

              if (field.dataType === 'team') {
                return (
                  <div key={field.id} className={baseWrapper}>
                    <Label className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </Label>
                    {renderSelect(
                      teams.map((t) => ({ id: t.id, label: t.name })),
                      'Select a team'
                    )}
                  </div>
                )
              }

              return null
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
