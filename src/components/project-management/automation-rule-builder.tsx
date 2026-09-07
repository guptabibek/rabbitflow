'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
  Zap,
  Plus,
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  Clock,
  X,
} from 'lucide-react'
import { getApiErrorMessage } from '@/lib/utils'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerType =
  | 'issue_created'
  | 'issue_updated'
  | 'status_changed'
  | 'assignee_changed'
  | 'comment_added'
  | 'label_changed'

type ActionType =
  | 'set_field'
  | 'change_status'
  | 'assign_user'
  | 'add_label'
  | 'remove_label'
  | 'add_comment'
  | 'move_to_iteration'

const TRIGGER_LABELS: Record<TriggerType, string> = {
  issue_created: 'Issue Created',
  issue_updated: 'Issue Updated',
  status_changed: 'Status Changed',
  assignee_changed: 'Assignee Changed',
  comment_added: 'Comment Added',
  label_changed: 'Label Changed',
}

const ACTION_LABELS: Record<ActionType, string> = {
  set_field: 'Set Field',
  change_status: 'Change Status',
  assign_user: 'Assign User',
  add_label: 'Add Label',
  remove_label: 'Remove Label',
  add_comment: 'Add Comment',
  move_to_iteration: 'Move to Iteration',
}

const OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'in',
  'not_in',
  'is_empty',
  'is_not_empty',
]

interface Condition {
  field: string
  operator: string
  value: string
}

interface Action {
  type: ActionType
  config: Record<string, string>
  field?: string
  value?: unknown
}

interface AutomationRule {
  id: string
  projectId: string
  name: string
  description: string | null
  trigger: TriggerType
  triggerConfig: Record<string, unknown>
  conditions: Condition[]
  actions: Action[]
  isActive: boolean
  runCount: number
  lastRunAt: string | null
  createdAt: string
}

interface AutomationLog {
  id: string
  ruleId: string
  issueId: string
  triggeredBy: string | null
  status: string
  error: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutomationRuleBuilder() {
  const { currentProject, users, labels, states, iterations } = useAppStore()
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, AutomationLog[]>>({})

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trigger, setTrigger] = useState<TriggerType>('issue_created')
  const [conditions, setConditions] = useState<Condition[]>([])
  const [actions, setActions] = useState<Action[]>([
    { type: 'set_field', config: {} },
  ])
  const [saving, setSaving] = useState(false)

  const fetchRules = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const res = await fetch(`/api/automations?projectId=${currentProject.id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load automation rules'))
      }
      const data = await res.json()
      setRules(data.rules ?? data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load automation rules')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchRules() }, [fetchRules])

  const fetchLogs = async (ruleId: string) => {
    const res = await fetch(`/api/automations/${ruleId}`)
    if (!res.ok) {
      toast.error(await getApiErrorMessage(res, 'Failed to load automation logs'))
      return
    }

    const data = await res.json()
    setLogs((prev) => ({ ...prev, [ruleId]: data.logs ?? [] }))
  }

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      if (!logs[id]) fetchLogs(id)
    }
  }

  const handleCreate = async () => {
    if (!currentProject || !name) return
    setSaving(true)
    try {
      // Translate frontend action format {type, config} to API format {type, field?, value?}
      const apiActions = actions.map((a) => {
        switch (a.type) {
          case 'change_status': return { type: a.type, field: 'status', value: a.config.stateId }
          case 'assign_user': return { type: a.type, field: 'assigneeId', value: a.config.userId }
          case 'add_label': return { type: a.type, value: a.config.labelId }
          case 'remove_label': return { type: a.type, value: a.config.labelId }
          case 'add_comment': return { type: a.type, value: a.config.body }
          case 'move_to_iteration': return { type: a.type, field: 'iterationId', value: a.config.iterationId }
          case 'set_field': return { type: a.type, field: a.config.field, value: a.config.value }
          default: return { type: a.type }
        }
      })

      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          name,
          description: description || undefined,
          trigger,
          conditions,
          actions: apiActions,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create automation rule'))
      }
      setCreateOpen(false)
      resetForm()
      await fetchRules()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create automation rule')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rule: AutomationRule) => {
    const res = await fetch(`/api/automations/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    })
    if (!res.ok) {
      toast.error(await getApiErrorMessage(res, 'Failed to update automation rule'))
      return
    }

    await fetchRules()
  }

  const deleteConfirm = useDestructiveConfirm<{ id: string; name: string }>()

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error(await getApiErrorMessage(res, 'Failed to delete automation rule'))
      return
    }

    await fetchRules()
  }

  const resetForm = () => {
    setName('')
    setDescription('')
    setTrigger('issue_created')
    setConditions([])
    setActions([{ type: 'set_field', config: {} }])
  }

  const addCondition = () => {
    setConditions((prev) => [...prev, { field: 'priority', operator: 'equals', value: '' }])
  }

  const removeCondition = (i: number) => {
    setConditions((prev) => prev.filter((_, idx) => idx !== i))
  }

  const updateCondition = (i: number, patch: Partial<Condition>) => {
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    )
  }

  const addAction = () => {
    setActions((prev) => [...prev, { type: 'set_field', config: {} }])
  }

  const removeAction = (i: number) => {
    setActions((prev) => prev.filter((_, idx) => idx !== i))
  }

  const updateAction = (i: number, patch: Partial<Action>) => {
    setActions((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a))
    )
  }

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a project to manage automations.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Automation Rules</h2>
          <p className="text-sm text-muted-foreground">
            Automate work item actions based on triggers and conditions.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Automation Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Name / description */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. Auto-assign bugs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    placeholder="Optional"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Trigger */}
              <div className="space-y-1.5">
                <Label>When (Trigger)</Label>
                <Select value={trigger} onValueChange={(v) => setTrigger(v as TriggerType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRIGGER_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Conditions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>If (Conditions)</Label>
                  <Button variant="ghost" size="sm" onClick={addCondition} className="h-6 text-xs gap-1">
                    <Plus className="h-3 w-3" />
                    Add Condition
                  </Button>
                </div>
                {conditions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No conditions — rule triggers on every event.</p>
                )}
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                    <Input
                      placeholder="field"
                      value={c.field}
                      onChange={(e) => updateCondition(i, { field: e.target.value })}
                      className="h-7 text-xs w-28"
                    />
                    <Select value={c.operator} onValueChange={(v) => updateCondition(i, { operator: v })}>
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map((op) => (
                          <SelectItem key={op} value={op}>
                            {op.replaceAll('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="value"
                      value={c.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      className="h-7 text-xs flex-1"
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Remove condition" onClick={() => removeCondition(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Then (Actions)</Label>
                  <Button variant="ghost" size="sm" onClick={addAction} className="h-6 text-xs gap-1">
                    <Plus className="h-3 w-3" />
                    Add Action
                  </Button>
                </div>
                {actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                    <Select
                      value={a.type}
                      onValueChange={(v) =>
                        updateAction(i, { type: v as ActionType, config: {} })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ACTION_LABELS) as ActionType[]).map((at) => (
                          <SelectItem key={at} value={at}>
                            {ACTION_LABELS[at]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Dynamic config based on action type */}
                    {a.type === 'change_status' && (
                      <Select
                        value={a.config.stateId ?? ''}
                        onValueChange={(v) =>
                          updateAction(i, { config: { ...a.config, stateId: v } })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {a.type === 'assign_user' && (
                      <Select
                        value={a.config.userId ?? ''}
                        onValueChange={(v) =>
                          updateAction(i, { config: { ...a.config, userId: v } })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {(a.type === 'add_label' || a.type === 'remove_label') && (
                      <Select
                        value={a.config.labelId ?? ''}
                        onValueChange={(v) =>
                          updateAction(i, { config: { ...a.config, labelId: v } })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Select label" />
                        </SelectTrigger>
                        <SelectContent>
                          {labels.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {a.type === 'move_to_iteration' && (
                      <Select
                        value={a.config.iterationId ?? ''}
                        onValueChange={(v) =>
                          updateAction(i, { config: { ...a.config, iterationId: v } })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Select iteration" />
                        </SelectTrigger>
                        <SelectContent>
                          {iterations.map((it) => (
                            <SelectItem key={it.id} value={it.id}>
                              {it.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {a.type === 'set_field' && (
                      <>
                        <Input
                          placeholder="field"
                          value={a.config.field ?? ''}
                          onChange={(e) =>
                            updateAction(i, { config: { ...a.config, field: e.target.value } })
                          }
                          className="h-7 text-xs w-24"
                        />
                        <Input
                          placeholder="value"
                          value={a.config.value ?? ''}
                          onChange={(e) =>
                            updateAction(i, { config: { ...a.config, value: e.target.value } })
                          }
                          className="h-7 text-xs flex-1"
                        />
                      </>
                    )}

                    {a.type === 'add_comment' && (
                      <Input
                        placeholder="Comment text"
                        value={a.config.body ?? ''}
                        onChange={(e) =>
                          updateAction(i, { config: { ...a.config, body: e.target.value } })
                        }
                        className="h-7 text-xs flex-1"
                      />
                    )}

                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Remove action" onClick={() => removeAction(i)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name || actions.length === 0 || saving}>
                {saving ? 'Creating…' : 'Create Rule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Zap className="mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No automation rules</p>
            <p className="text-sm">Create your first rule to automate repetitive tasks.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <button className="flex-shrink-0" onClick={() => toggleExpand(rule.id)}>
                    {expandedId === rule.id ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  <Zap className={`h-4 w-4 ${rule.isActive ? 'text-warning' : 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{rule.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {TRIGGER_LABELS[rule.trigger as TriggerType] ?? rule.trigger}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {rule.description}
                      </p>
                    )}
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{(Array.isArray(rule.conditions) ? rule.conditions : []).length} condition(s)</span>
                      <span>{(Array.isArray(rule.actions) ? rule.actions : []).length} action(s)</span>
                      <span className="flex items-center gap-1">
                        <Play className="h-2.5 w-2.5" />
                        {rule.runCount} runs
                      </span>
                      {rule.lastRunAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(rule.lastRunAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      aria-label="Delete automation rule"
                      onClick={() => deleteConfirm.request(rule)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === rule.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {/* Conditions display */}
                    {Array.isArray(rule.conditions) && rule.conditions.length > 0 && (
                      <div>
                        <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Conditions</h4>
                        <div className="flex flex-wrap gap-1">
                          {rule.conditions.map((c: Condition, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-mono">
                              {c.field} {c.operator} {c.value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions display */}
                    <div>
                      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Actions</h4>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(rule.actions) ? rule.actions : []).map((a: Action, i: number) => {
                          const displayValues = a.config
                            ? Object.values(a.config).filter(Boolean)
                            : [a.field, a.value].filter(Boolean)
                          return (
                            <Badge key={i} variant="secondary" className="text-[10px]">
                              {ACTION_LABELS[a.type] ?? a.type}
                              {displayValues.length > 0 && (
                                <span className="ml-1 opacity-70">
                                  ({displayValues.join(', ')})
                                </span>
                              )}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>

                    {/* Execution logs */}
                    <div>
                      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Recent Logs</h4>
                      {!logs[rule.id] ? (
                        <Skeleton className="h-8 w-full" />
                      ) : logs[rule.id].length === 0 ? (
                        <p className="text-xs text-muted-foreground">No executions yet.</p>
                      ) : (
                        <ScrollArea className="max-h-32">
                          <div className="space-y-1">
                            {logs[rule.id].slice(0, 10).map((log) => (
                              <div
                                key={log.id}
                                className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
                              >
                                {log.status === 'success' ? (
                                  <Badge className="h-4 bg-success/10 text-success text-[9px]">OK</Badge>
                                ) : (
                                  <Badge variant="destructive" className="h-4 text-[9px]">FAIL</Badge>
                                )}
                                <span className="font-mono text-muted-foreground">{log.triggeredBy ?? ''}</span>
                                {log.error && (
                                  <span className="truncate text-danger">{log.error}</span>
                                )}
                                <span className="ml-auto text-muted-foreground">
                                  {new Date(log.createdAt).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title={`Delete automation rule "${deleteConfirm.target?.name ?? ''}"?`}
        description="This rule will stop running immediately. Work items it already changed are not reverted. This cannot be undone."
        onConfirm={async () => {
          if (deleteConfirm.target) await handleDelete(deleteConfirm.target.id)
        }}
      />
    </div>
  )
}
