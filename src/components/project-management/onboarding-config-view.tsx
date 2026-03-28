'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { getApiErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ── Types ──────────────────────────────────────────────────────

type StepConfig = {
  id?: string
  key: string
  title: string
  description: string | null
  icon: string | null
  targetRoute: string | null
  ctaLabel: string | null
  ctaRoute: string | null
  completionRule: string
  roles: string[]
  isEnabled: boolean
  order: number
}

type AnalyticsData = {
  stepStats: Array<{ stepKey: string; action: string; count: number }>
  totalUsers: number
  completedUsers: number
  completionRate: number
  avgCompletionTimeMs: number | null
}

const ROLE_OPTIONS = ['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer'] as const

// ── Analytics Panel ────────────────────────────────────────────

function AnalyticsPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/onboarding/analytics?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading analytics…</div>
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground py-8 text-center">No analytics data yet.</div>
  }

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  // Group step stats by stepKey
  const stepMap = new Map<string, { completed: number; dismissed: number }>()
  for (const stat of data.stepStats) {
    const existing = stepMap.get(stat.stepKey) ?? { completed: 0, dismissed: 0 }
    if (stat.action === 'completed') existing.completed = stat.count
    if (stat.action === 'dismissed') existing.dismissed = stat.count
    stepMap.set(stat.stepKey, existing)
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{data.totalUsers}</div>
            <div className="text-sm text-muted-foreground">Total users tracked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-500">{data.completionRate}%</div>
            <div className="text-sm text-muted-foreground">
              Completion rate ({data.completedUsers} users)
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">
              {data.avgCompletionTimeMs ? formatTime(data.avgCompletionTimeMs) : '—'}
            </div>
            <div className="text-sm text-muted-foreground">Avg. time to complete</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-step breakdown */}
      {stepMap.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Step Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from(stepMap.entries()).map(([stepKey, stats]) => (
                <div key={stepKey} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-muted-foreground">{stepKey}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-emerald-500">{stats.completed} completed</span>
                    <span className="text-amber-500">{stats.dismissed} skipped</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Step Editor Dialog ─────────────────────────────────────────

function StepEditorDialog({
  step,
  availableRules,
  onSave,
  onClose,
}: {
  step: StepConfig | null
  availableRules: Record<string, string>
  onSave: (step: StepConfig) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<StepConfig>(
    step ?? {
      key: '',
      title: '',
      description: '',
      icon: 'Circle',
      targetRoute: null,
      ctaLabel: 'Go',
      ctaRoute: null,
      completionRule: 'has_issue',
      roles: [],
      isEnabled: true,
      order: 999,
    }
  )

  const isNew = !step?.key

  const onSubmit = () => {
    if (!draft.key.trim() || !draft.title.trim() || !draft.completionRule.trim()) {
      toast.error('Key, title, and completion rule are required')
      return
    }
    onSave(draft)
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Step' : 'Edit Step'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Key (unique)</Label>
              <Input
                value={draft.key}
                disabled={!isNew}
                placeholder="e.g. create_project"
                onChange={(e) =>
                  setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Input
                value={draft.icon ?? ''}
                placeholder="Lucide icon name"
                onChange={(e) => setDraft({ ...draft, icon: e.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={draft.title}
              maxLength={200}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={draft.description ?? ''}
              maxLength={500}
              rows={2}
              onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
            />
          </div>

          <div className="space-y-2">
            <Label>Completion Rule</Label>
            <Select
              value={draft.completionRule}
              onValueChange={(v) => setDraft({ ...draft, completionRule: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(availableRules).map(([key, desc]) => (
                  <SelectItem key={key} value={key}>
                    <span className="font-mono text-xs">{key}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CTA Label</Label>
              <Input
                value={draft.ctaLabel ?? ''}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>CTA View Target</Label>
              <Input
                value={draft.ctaRoute ?? ''}
                placeholder="board, sprints, teams, backlog, __create_issue"
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, ctaRoute: e.target.value || null })}
              />
              <p className="text-xs text-muted-foreground">Use a view name (e.g. board, sprints, teams) or __create_issue to open the create dialog.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Target Roles</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => {
                const selected = draft.roles.includes(role)
                return (
                  <Badge
                    key={role}
                    variant={selected ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      const next = selected
                        ? draft.roles.filter((r) => r !== role)
                        : [...draft.roles, role]
                      setDraft({ ...draft, roles: next })
                    }}
                  >
                    {role}
                  </Badge>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Empty = all roles. Click to toggle.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={draft.isEnabled}
              onCheckedChange={(v) => setDraft({ ...draft, isEnabled: v })}
            />
            <Label>Enabled</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>
            <Save className="mr-2 h-4 w-4" />
            {isNew ? 'Add Step' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main config view ───────────────────────────────────────────

export function OnboardingConfigView() {
  const currentProject = useAppStore((s) => s.currentProject)
  const permissions = useAppStore((s) => s.currentProjectPermissions)
  const canManage = permissions.includes('onboarding:manage')

  const [steps, setSteps] = useState<StepConfig[]>([])
  const [availableRules, setAvailableRules] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingStep, setEditingStep] = useState<StepConfig | null | 'new'>(null)

  const fetchConfig = async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const res = await fetch(`/api/onboarding/config?projectId=${currentProject.id}`)
      if (!res.ok) throw new Error(await getApiErrorMessage(res, 'Failed to load'))
      const data = await res.json()
      setSteps(data.steps ?? [])
      setAvailableRules(data.availableRules ?? {})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load config')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchConfig()
  }, [currentProject?.id])

  const saveAll = async (updatedSteps: StepConfig[]) => {
    if (!currentProject) return
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          steps: updatedSteps.map((s, i) => ({
            key: s.key,
            title: s.title,
            description: s.description,
            icon: s.icon,
            targetRoute: s.targetRoute,
            ctaLabel: s.ctaLabel,
            ctaRoute: s.ctaRoute,
            completionRule: s.completionRule,
            roles: s.roles,
            isEnabled: s.isEnabled,
            order: i * 10,
          })),
        }),
      })
      if (!res.ok) throw new Error(await getApiErrorMessage(res, 'Failed to save'))
      const data = await res.json()
      setSteps(data.steps ?? [])
      toast.success('Onboarding config saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const newSteps = [...steps]
    const target = index + direction
    if (target < 0 || target >= newSteps.length) return
    ;[newSteps[index], newSteps[target]] = [newSteps[target], newSteps[index]]
    void saveAll(newSteps)
  }

  const removeStep = (key: string) => {
    const updated = steps.filter((s) => s.key !== key)
    void saveAll(updated)
  }

  const handleStepSave = (step: StepConfig) => {
    const existing = steps.findIndex((s) => s.key === step.key)
    let updated: StepConfig[]
    if (existing >= 0) {
      updated = steps.map((s) => (s.key === step.key ? step : s))
    } else {
      updated = [...steps, { ...step, order: steps.length * 10 }]
    }
    setEditingStep(null)
    void saveAll(updated)
  }

  const handleResetForUser = async () => {
    if (!currentProject) return
    try {
      const res = await fetch('/api/onboarding/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id }),
      })
      if (!res.ok) throw new Error(await getApiErrorMessage(res, 'Failed to reset'))
      toast.success('Onboarding state reset')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset')
    }
  }

  if (!currentProject || !canManage) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You need the <Badge variant="outline">onboarding:manage</Badge> permission to configure onboarding.
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      <Tabs defaultValue="config">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="config">Steps Configuration</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleResetForUser}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset My Progress
            </Button>
            <Button size="sm" onClick={() => setEditingStep('new')}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Step
            </Button>
          </div>
        </div>

        <TabsContent value="config" className="mt-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading configuration…
            </div>
          ) : steps.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No onboarding steps configured.</p>
                <Button className="mt-4" onClick={() => setEditingStep('new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Step
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => (
                <Card
                  key={step.key}
                  className={!step.isEnabled ? 'opacity-50' : undefined}
                >
                  <CardContent className="flex items-center gap-3 py-3 px-4">
                    <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{step.title}</span>
                        <Badge variant="outline" className="text-xs font-mono">
                          {step.completionRule}
                        </Badge>
                        {!step.isEnabled && (
                          <Badge variant="secondary" className="text-xs">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      {step.roles && (step.roles as string[]).length > 0 && (
                        <div className="mt-1 flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {(step.roles as string[]).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === 0 || saving}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === steps.length - 1 || saving}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditingStep(step)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeStep(step.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsPanel projectId={currentProject.id} />
        </TabsContent>
      </Tabs>

      {/* Step editor dialog */}
      {editingStep !== null && (
        <StepEditorDialog
          step={editingStep === 'new' ? null : editingStep}
          availableRules={availableRules}
          onSave={handleStepSave}
          onClose={() => setEditingStep(null)}
        />
      )}
    </div>
  )
}
