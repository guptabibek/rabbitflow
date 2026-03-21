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
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.id} className="space-y-4">
          <div>
            {section.isCollapsible ? (
              <Button
                type="button"
                variant="ghost"
                className="h-auto px-0 py-0 text-left hover:bg-transparent"
                onClick={() =>
                  setCollapsedSections((previous) => ({
                    ...previous,
                    [section.id]: !previous[section.id],
                  }))
                }
              >
                {collapsedSections[section.id] ? (
                  <ChevronRight className="mr-2 h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold text-foreground">{section.title}</span>
              </Button>
            ) : (
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            )}
            {section.description ? (
              <p className="mt-1 text-xs text-muted-foreground">{section.description}</p>
            ) : null}
          </div>

          <div
            className={`grid gap-4 md:grid-cols-2 ${section.isCollapsible && collapsedSections[section.id] ? 'hidden' : ''}`}
          >
            {section.fields.map((field) => {
              if (HIDDEN_SYSTEM_FIELD_KEYS.has(field.key)) {
                return null
              }

              const value = values[field.key]

              if (field.dataType === 'markdown') {
                return (
                  <div key={field.id} className="md:col-span-2">
                    <Label className="text-xs">{field.label}</Label>
                    <Textarea
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => onChange(field.key, event.target.value)}
                      placeholder={field.placeholder || undefined}
                      rows={6}
                      className="mt-1.5"
                    />
                  </div>
                )
              }

              if (field.dataType === 'text') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) => onChange(field.key, event.target.value)}
                      placeholder={field.placeholder || undefined}
                      className="mt-1.5"
                    />
                  </div>
                )
              }

              if (field.dataType === 'number') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      type="number"
                      value={typeof value === 'number' ? String(value) : ''}
                      onChange={(event) =>
                        onChange(
                          field.key,
                          event.target.value === '' ? null : Number(event.target.value)
                        )
                      }
                      placeholder={field.placeholder || undefined}
                      className="mt-1.5"
                    />
                  </div>
                )
              }

              if (field.dataType === 'date') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      type="date"
                      value={typeof value === 'string' ? value.slice(0, 10) : ''}
                      onChange={(event) => onChange(field.key, event.target.value || null)}
                      className="mt-1.5"
                    />
                  </div>
                )
              }

              if (field.dataType === 'boolean') {
                return (
                  <div key={field.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <div className="text-sm font-medium">{field.label}</div>
                      {field.description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
                      ) : null}
                    </div>
                    <Checkbox
                      checked={Boolean(value)}
                      onCheckedChange={(checked) => onChange(field.key, checked === true)}
                    />
                  </div>
                )
              }

              if (field.dataType === 'single_select') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={typeof value === 'string' && value ? value : EMPTY_SELECT}
                      onValueChange={(nextValue) =>
                        onChange(field.key, nextValue === EMPTY_SELECT ? null : nextValue)
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder={field.placeholder || 'Select'} />
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
                  ? value.filter((item): item is string => typeof item === 'string')
                  : []

                return (
                  <div key={field.id} className="md:col-span-2">
                    <Label className="text-xs">{field.label}</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(field.options || []).map((option) => {
                        const selected = currentValues.includes(option)

                        return (
                          <Badge
                            key={option}
                            variant={selected ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() =>
                              onChange(
                                field.key,
                                selected
                                  ? currentValues.filter((item) => item !== option)
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

              if (field.dataType === 'user') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={typeof value === 'string' && value ? value : EMPTY_SELECT}
                      onValueChange={(nextValue) =>
                        onChange(field.key, nextValue === EMPTY_SELECT ? null : nextValue)
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>None</SelectItem>
                        {users.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

              if (field.dataType === 'iteration') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={typeof value === 'string' && value ? value : EMPTY_SELECT}
                      onValueChange={(nextValue) =>
                        onChange(field.key, nextValue === EMPTY_SELECT ? null : nextValue)
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select an iteration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>None</SelectItem>
                        {iterations.map((iteration) => (
                          <SelectItem key={iteration.id} value={iteration.id}>
                            {iteration.path || iteration.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

              if (field.dataType === 'area') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={typeof value === 'string' && value ? value : EMPTY_SELECT}
                      onValueChange={(nextValue) =>
                        onChange(field.key, nextValue === EMPTY_SELECT ? null : nextValue)
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select an area" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>None</SelectItem>
                        {areas.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.path || area.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }

              if (field.dataType === 'team') {
                return (
                  <div key={field.id}>
                    <Label className="text-xs">{field.label}</Label>
                    <Select
                      value={typeof value === 'string' && value ? value : EMPTY_SELECT}
                      onValueChange={(nextValue) =>
                        onChange(field.key, nextValue === EMPTY_SELECT ? null : nextValue)
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select a team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>None</SelectItem>
                        {teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
