'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Shield,
  Plus,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'
import {
  ConfirmDestructiveDialog,
  useDestructiveConfirm,
} from '@/components/project-management/confirm-destructive-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlaPolicy {
  id: string
  projectId: string
  name: string
  description: string | null
  priorityFilter: string[] | null
  typeFilter: string[] | null
  responseTimeMinutes: number
  resolutionTimeMinutes: number
  businessHoursOnly: boolean
  isActive: boolean
  createdAt: string
}

interface SlaTimer {
  id: string
  issueId: string
  policyId: string
  timerType: string
  startedAt: string
  targetAt: string
  pausedAt: string | null
  completedAt: string | null
  breachedAt: string | null
  elapsedMinutes: number
  status: string
  isBreached: boolean
  isAtRisk: boolean
  remainingMs: number | null
  issue?: {
    id: string
    key: string
    title: string
    status: string
    priority: string
  }
  policy?: {
    id: string
    name: string
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SlaDashboard() {
  const { currentProject } = useAppStore()
  const [policies, setPolicies] = useState<SlaPolicy[]>([])
  const [timers, setTimers] = useState<SlaTimer[]>([])
  const [loading, setLoading] = useState(true)
  const [timersLoading, setTimersLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [tab, setTab] = useState('timers')
  const [saving, setSaving] = useState(false)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [timerError, setTimerError] = useState<string | null>(null)

  // Policy form
  const [pName, setPName] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [pPriority, setPPriority] = useState('')
  const [pResponseMin, setPResponseMin] = useState('60')
  const [pResolutionMin, setPResolutionMin] = useState('480')

  const fetchPolicies = useCallback(async () => {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/sla-policies?projectId=${currentProject.id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load SLA policies'))
      }

      const data = await res.json()
      setPolicies(data.policies ?? data)
      setPolicyError(null)
    } catch (error) {
      setPolicies([])
      setPolicyError(error instanceof Error ? error.message : 'Failed to load SLA policies')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  const fetchTimers = useCallback(async () => {
    if (!currentProject) return
    setTimersLoading(true)
    try {
      const res = await fetch(`/api/sla-timers?projectId=${currentProject.id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load SLA timers'))
      }

      const data = await res.json()
      setTimers(data.timers ?? data)
      setTimerError(null)
    } catch (error) {
      setTimers([])
      setTimerError(error instanceof Error ? error.message : 'Failed to load SLA timers')
    } finally {
      setTimersLoading(false)
    }
  }, [currentProject])

  useEffect(() => {
    fetchPolicies()
    fetchTimers()
  }, [fetchPolicies, fetchTimers])

  const handleCreatePolicy = async () => {
    if (!currentProject || !pName) return

    const responseTimeMinutes = Number.parseInt(pResponseMin, 10)
    const resolutionTimeMinutes = Number.parseInt(pResolutionMin, 10)

    if (!Number.isInteger(responseTimeMinutes) || responseTimeMinutes < 1) {
      toast.error('Response time must be a whole number greater than 0')
      return
    }

    if (!Number.isInteger(resolutionTimeMinutes) || resolutionTimeMinutes < 1) {
      toast.error('Resolution time must be a whole number greater than 0')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/sla-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          name: pName,
          description: pDesc || undefined,
          priorityFilter: pPriority && pPriority !== 'all' ? [pPriority] : null,
          responseTimeMinutes,
          resolutionTimeMinutes,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create SLA policy'))
      }

      setCreateOpen(false)
      setPName('')
      setPDesc('')
      setPPriority('')
      setPResponseMin('60')
      setPResolutionMin('480')
      await fetchPolicies()
      toast.success('SLA policy created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create SLA policy')
    } finally {
      setSaving(false)
    }
  }

  const deleteConfirm = useDestructiveConfirm<{ id: string; name: string }>()

  const handleDeletePolicy = async (id: string) => {
    try {
      const res = await fetch(`/api/sla-policies/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to delete SLA policy'))
      }

      await fetchPolicies()
      toast.success('SLA policy deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete SLA policy')
    }
  }

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`
    return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
  }

  const formatRemaining = (ms: number | null) => {
    if (ms === null) return '—'
    if (ms <= 0) return 'Overdue'
    const minutes = Math.floor(ms / 60000)
    if (minutes < 60) return `${minutes}m left`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`
    return `${Math.floor(minutes / 1440)}d left`
  }

  // Stats
  const breached = timers.filter((t) => t.isBreached).length
  const atRisk = timers.filter((t) => t.isAtRisk && !t.isBreached).length
  const onTrack = timers.filter((t) => !t.isBreached && !t.isAtRisk && t.status !== 'completed').length
  const resolved = timers.filter((t) => t.status === 'completed').length

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a project to view SLA dashboard.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">SLA Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Monitor service level agreements and response times.
          </p>
          {policyError || timerError ? (
            <p className="mt-2 text-sm text-destructive">{timerError ?? policyError}</p>
          ) : null}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{onTrack}</p>
              <p className="text-xs text-muted-foreground">On Track</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{atRisk}</p>
              <p className="text-xs text-muted-foreground">At Risk</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-lg bg-danger/10 p-2">
              <XCircle className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-2xl font-bold">{breached}</p>
              <p className="text-xs text-muted-foreground">Breached</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-lg bg-info/10 p-2">
              <TrendingUp className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold">{resolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="timers">Active Timers</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="timers" className="mt-3">
          {timersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : timers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Timer className="mb-3 h-10 w-10 opacity-50" />
                <p className="font-medium">No active SLA timers</p>
                <p className="text-sm">Timers are created when issues match an SLA policy.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {timers.map((timer) => (
                <Card key={timer.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    {timer.isBreached ? (
                      <XCircle className="h-4 w-4 text-danger flex-shrink-0" />
                    ) : timer.isAtRisk ? (
                      <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                    ) : timer.status === 'paused' ? (
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {timer.issue?.key ?? timer.issueId}
                        </span>
                        {timer.issue?.title && (
                          <span className="text-sm text-muted-foreground truncate">
                            {timer.issue.title}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{timer.policy?.name ?? 'SLA Policy'}</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{timer.timerType}</Badge>
                        <span>Deadline: {new Date(timer.targetAt).toLocaleString()}</span>
                        {timer.status === 'paused' && <span className="text-warning">Paused</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={timer.isBreached ? 'destructive' : timer.isAtRisk ? 'secondary' : 'default'}
                        className="text-[10px]"
                      >
                        {timer.isBreached
                          ? 'Breached'
                          : timer.isAtRisk
                          ? 'At Risk'
                          : timer.status === 'completed'
                          ? 'Met'
                          : timer.status === 'paused'
                          ? 'Paused'
                          : 'On Track'}
                      </Badge>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatRemaining(timer.remainingMs)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="policies" className="mt-3">
          <div className="mb-3 flex justify-end">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Policy
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create SLA Policy</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Critical Bug SLA" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Input value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="Optional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Priority Filter</Label>
                    <Select value={pPriority} onValueChange={setPPriority}>
                      <SelectTrigger>
                        <SelectValue placeholder="All priorities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Response Time (min)</Label>
                      <Input type="number" min={1} step={1} value={pResponseMin} onChange={(e) => setPResponseMin(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Resolution Time (min)</Label>
                      <Input type="number" min={1} step={1} value={pResolutionMin} onChange={(e) => setPResolutionMin(e.target.value)} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreatePolicy} disabled={!pName || saving}>
                    {saving ? 'Creating…' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : policies.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Shield className="mb-3 h-10 w-10 opacity-50" />
                <p className="font-medium">No SLA policies</p>
                <p className="text-sm">Create a policy to start tracking SLAs.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {policies.map((policy) => (
                <Card key={policy.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <Shield className={`h-4 w-4 ${policy.isActive ? 'text-info' : 'text-muted-foreground'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{policy.name}</span>
                        {policy.priorityFilter && policy.priorityFilter.length > 0 && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {policy.priorityFilter.join(', ')}
                          </Badge>
                        )}
                        <Badge variant={policy.isActive ? 'default' : 'secondary'} className="text-[10px]">
                          {policy.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Response: {formatDuration(policy.responseTimeMinutes)}</span>
                        <span>Resolution: {formatDuration(policy.resolutionTimeMinutes)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      aria-label="Delete SLA policy"
                      onClick={() => deleteConfirm.request(policy)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title={`Delete SLA policy "${deleteConfirm.target?.name ?? ''}"?`}
        description="Work items currently tracked against this policy stop being measured and their running timers are discarded. This cannot be undone."
        onConfirm={async () => {
          if (deleteConfirm.target) await handleDeletePolicy(deleteConfirm.target.id)
        }}
      />
    </div>
  )
}
