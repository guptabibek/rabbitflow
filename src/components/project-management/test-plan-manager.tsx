'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
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
import {
  ClipboardCheck,
  Plus,
  Trash2,
  PlayCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types — aligned with actual API / Prisma schema
// ---------------------------------------------------------------------------

interface TestStep {
  order: number
  action: string
  expectedResult?: string
}

interface TestRunRecord {
  id: string
  result: string
  notes: string | null
  duration: number | null
  createdAt: string
}

interface TestCaseFromApi {
  id: string
  testPlanId: string | null
  title: string
  description: string | null
  preconditions: string | null
  steps: TestStep[]
  expectedResult: string | null
  priority: string
  linkedIssueId: string | null
  createdAt: string
  runs: TestRunRecord[]
}

interface TestPlanSummary {
  total: number
  passed: number
  failed: number
  notRun: number
  passRate: number
}

interface TestPlanFromApi {
  id: string
  projectId: string
  title: string
  description: string | null
  status: string
  createdAt: string
  _count?: { testCases: number }
  testCases?: TestCaseFromApi[]
  summary?: TestPlanSummary
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TestPlanManager() {
  const { currentProject } = useAppStore()
  const [plans, setPlans] = useState<TestPlanFromApi[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<TestPlanFromApi | null>(null)
  const [cases, setCases] = useState<TestCaseFromApi[]>([])
  const [casesLoading, setCasesLoading] = useState(false)
  const [createPlanOpen, setCreatePlanOpen] = useState(false)
  const [createCaseOpen, setCreateCaseOpen] = useState(false)
  const [runDialogCase, setRunDialogCase] = useState<TestCaseFromApi | null>(null)

  // Plan form
  const [planTitle, setPlanTitle] = useState('')
  const [planDesc, setPlanDesc] = useState('')

  // Case form
  const [caseTitle, setCaseTitle] = useState('')
  const [caseDesc, setCaseDesc] = useState('')
  const [casePreconditions, setCasePreconditions] = useState('')
  const [caseSteps, setCaseSteps] = useState<TestStep[]>([{ order: 1, action: '', expectedResult: '' }])
  const [casePriority, setCasePriority] = useState<string>('medium')

  // Run form
  const [runResult, setRunResult] = useState<string>('passed')
  const [runNotes, setRunNotes] = useState('')
  const [runDuration, setRunDuration] = useState('')

  const [saving, setSaving] = useState(false)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchPlans = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const res = await fetch(`/api/test-plans?projectId=${encodeURIComponent(currentProject.id)}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load test plans'))
      }

      const data = await res.json()
      setPlans(Array.isArray(data) ? data : data.plans ?? [])
    } catch (error) {
      setPlans([])
      toast.error(error instanceof Error ? error.message : 'Failed to load test plans')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const fetchPlanDetail = async (plan: TestPlanFromApi) => {
    setCasesLoading(true)
    setSelectedPlan(plan)
    try {
      const res = await fetch(`/api/test-plans/${plan.id}`)
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to load test plan'))
      }

      const data: TestPlanFromApi = await res.json()
      setSelectedPlan(data)
      setCases(data.testCases ?? [])
    } catch (error) {
      setCases([])
      toast.error(error instanceof Error ? error.message : 'Failed to load test plan')
    } finally {
      setCasesLoading(false)
    }
  }

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleCreatePlan = async () => {
    if (!currentProject || !planTitle.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/test-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          title: planTitle.trim(),
          description: planDesc.trim() || null,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create test plan'))
      }

      setCreatePlanOpen(false)
      setPlanTitle('')
      setPlanDesc('')
      await fetchPlans()
      toast.success('Test plan created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create test plan')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateCase = async () => {
    if (!selectedPlan || !caseTitle.trim()) return
    const validSteps = caseSteps
      .filter((s) => s.action.trim())
      .map((s, i) => ({ order: i + 1, action: s.action.trim(), expectedResult: s.expectedResult?.trim() || undefined }))
    if (validSteps.length === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/test-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testPlanId: selectedPlan.id,
          title: caseTitle.trim(),
          description: caseDesc.trim() || null,
          preconditions: casePreconditions.trim() || null,
          steps: validSteps,
          priority: casePriority,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to create test case'))
      }

      setCreateCaseOpen(false)
      resetCaseForm()
      await fetchPlanDetail(selectedPlan)
      toast.success('Test case created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create test case')
    } finally {
      setSaving(false)
    }
  }

  const handleRunTest = async () => {
    if (!runDialogCase) return
    setSaving(true)
    try {
      const res = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testCaseId: runDialogCase.id,
          result: runResult,
          notes: runNotes.trim() || null,
          duration: runDuration ? parseInt(runDuration, 10) : undefined,
        }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to record test result'))
      }

      setRunDialogCase(null)
      setRunNotes('')
      setRunDuration('')
      if (selectedPlan) {
        await fetchPlanDetail(selectedPlan)
      }
      toast.success('Test result recorded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to record test result')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePlan = async (id: string) => {
    try {
      const res = await fetch(`/api/test-plans/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to delete test plan'))
      }

      if (selectedPlan?.id === id) {
        setSelectedPlan(null)
        setCases([])
      }
      await fetchPlans()
      toast.success('Test plan deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete test plan')
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedPlan) return
    try {
      const res = await fetch(`/api/test-plans/${selectedPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, 'Failed to update test plan status'))
      }

      await fetchPlanDetail(selectedPlan)
      await fetchPlans()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update test plan status')
    }
  }

  // -----------------------------------------------------------------------
  // Step management helpers
  // -----------------------------------------------------------------------

  const resetCaseForm = () => {
    setCaseTitle('')
    setCaseDesc('')
    setCasePreconditions('')
    setCaseSteps([{ order: 1, action: '', expectedResult: '' }])
    setCasePriority('medium')
  }

  const addStep = () => {
    setCaseSteps((prev) => [...prev, { order: prev.length + 1, action: '', expectedResult: '' }])
  }

  const removeStep = (idx: number) => {
    setCaseSteps((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })) : prev)
  }

  const updateStep = (idx: number, field: 'action' | 'expectedResult', value: string) => {
    setCaseSteps((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  // -----------------------------------------------------------------------
  // Display helpers
  // -----------------------------------------------------------------------

  const latestResult = (tc: TestCaseFromApi) => tc.runs?.[0]?.result ?? 'untested'

  const statusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case 'failed':
        return <XCircle className="h-3.5 w-3.5 text-red-500" />
      case 'blocked':
        return <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
      case 'skipped':
        return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
      default:
        return <FileText className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case 'critical':
        return 'text-red-600 bg-red-500/10'
      case 'high':
        return 'text-orange-600 bg-orange-500/10'
      case 'medium':
        return 'text-yellow-600 bg-yellow-500/10'
      default:
        return 'text-muted-foreground bg-muted/50'
    }
  }

  const planStatusColor = (s: string) => {
    switch (s) {
      case 'active': return 'bg-green-500/10 text-green-600'
      case 'completed': return 'bg-blue-500/10 text-blue-600'
      case 'archived': return 'bg-muted text-muted-foreground'
      default: return 'bg-yellow-500/10 text-yellow-600'
    }
  }

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a project to manage test plans.
      </div>
    )
  }

  const summary = selectedPlan?.summary

  return (
    <div className="flex h-full">
      {/* Left: Plans list */}
      <div className="w-72 flex-shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="text-sm font-semibold">Test Plans</h3>
          <Dialog open={createPlanOpen} onOpenChange={setCreatePlanOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Test Plan</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="e.g. Sprint 12 Regression" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder="Optional" rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreatePlanOpen(false)}>Cancel</Button>
                <Button onClick={handleCreatePlan} disabled={!planTitle.trim() || saving}>
                  {saving ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : plans.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No test plans yet.
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  className={`w-full rounded-md px-2.5 py-2 text-left hover:bg-accent transition-colors ${
                    selectedPlan?.id === plan.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => fetchPlanDetail(plan)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{plan.title}</span>
                    <Badge variant="outline" className={`text-[10px] ${planStatusColor(plan.status)}`}>
                      {plan.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {plan._count?.testCases ?? 0} test cases
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: Plan detail */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedPlan ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ClipboardCheck className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="font-medium">Select a test plan</p>
              <p className="text-sm">Choose a plan from the sidebar to view test cases.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b p-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedPlan.title}</h2>
                {selectedPlan.description && (
                  <p className="text-xs text-muted-foreground">{selectedPlan.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedPlan.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={createCaseOpen} onOpenChange={(open) => { setCreateCaseOpen(open); if (!open) resetCaseForm() }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      Add Case
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add Test Case</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label>Title</Label>
                        <Input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} placeholder="e.g. Login with valid credentials" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Priority</Label>
                        <Select value={casePriority} onValueChange={setCasePriority}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="critical">Critical</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea value={caseDesc} onChange={(e) => setCaseDesc(e.target.value)} rows={2} placeholder="Optional overview" />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Preconditions</Label>
                        <Textarea value={casePreconditions} onChange={(e) => setCasePreconditions(e.target.value)} rows={2} placeholder="Optional" />
                      </div>

                      {/* Structured steps */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Steps</Label>
                          <Button type="button" variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={addStep}>
                            <Plus className="h-3 w-3" /> Step
                          </Button>
                        </div>
                        {caseSteps.map((step, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            <span className="mt-2 text-xs text-muted-foreground w-5 text-right flex-shrink-0">{idx + 1}.</span>
                            <div className="flex-1 space-y-1">
                              <Input
                                value={step.action}
                                onChange={(e) => updateStep(idx, 'action', e.target.value)}
                                placeholder="Action to perform"
                                className="text-sm"
                              />
                              <Input
                                value={step.expectedResult ?? ''}
                                onChange={(e) => updateStep(idx, 'expectedResult', e.target.value)}
                                placeholder="Expected result (optional)"
                                className="text-xs h-7"
                              />
                            </div>
                            {caseSteps.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 mt-0.5 flex-shrink-0"
                                onClick={() => removeStep(idx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setCreateCaseOpen(false); resetCaseForm() }}>Cancel</Button>
                      <Button onClick={handleCreateCase} disabled={!caseTitle.trim() || !caseSteps.some(s => s.action.trim()) || saving}>
                        {saving ? 'Adding…' : 'Add Case'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleDeletePlan(selectedPlan.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Summary badges */}
            {summary && (
              <div className="flex items-center gap-3 px-3 pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Pass rate:</span>
                  <Progress value={summary.passRate} className="w-24 h-2" />
                  <span className="font-medium">{summary.passRate}%</span>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {summary.passed} passed
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    {summary.failed} failed
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    {summary.notRun} not run
                  </Badge>
                </div>
              </div>
            )}

            {/* Cases list */}
            <ScrollArea className="flex-1 p-3">
              {casesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : cases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="mb-3 h-8 w-8 opacity-50" />
                  <p className="text-sm">No test cases yet. Add your first one.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cases.map((tc) => {
                    const result = latestResult(tc)
                    const steps = Array.isArray(tc.steps) ? tc.steps : []
                    return (
                      <Card key={tc.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            {statusIcon(result)}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{tc.title}</span>
                                <Badge className={`text-[10px] ${priorityColor(tc.priority)}`}>
                                  {tc.priority}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {result}
                                </Badge>
                              </div>
                              {steps.length > 0 && (
                                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                                  {steps.length} step{steps.length !== 1 ? 's' : ''}: {steps[0].action}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 h-7 text-xs"
                              onClick={() => {
                                setRunDialogCase(tc)
                                setRunResult('passed')
                                setRunNotes('')
                                setRunDuration('')
                              }}
                            >
                              <PlayCircle className="h-3 w-3" />
                              Run
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      {/* Run test dialog */}
      <Dialog open={!!runDialogCase} onOpenChange={() => setRunDialogCase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Test Result</DialogTitle>
          </DialogHeader>
          {runDialogCase && (
            <div className="space-y-3 py-2">
              <p className="text-sm font-medium">{runDialogCase.title}</p>

              {Array.isArray(runDialogCase.steps) && runDialogCase.steps.length > 0 && (
                <div className="rounded-md bg-muted/50 p-2 space-y-1">
                  {runDialogCase.steps.map((step, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{step.order ?? i + 1}.</span>{' '}
                      {step.action}
                      {step.expectedResult && (
                        <span className="text-muted-foreground ml-1">→ {step.expectedResult}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Result</Label>
                <Select value={runResult} onValueChange={setRunResult}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duration (seconds)</Label>
                <Input type="number" min="0" value={runDuration} onChange={(e) => setRunDuration(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={runNotes} onChange={(e) => setRunNotes(e.target.value)} rows={3} placeholder="Optional notes" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunDialogCase(null)}>Cancel</Button>
            <Button onClick={handleRunTest} disabled={saving}>
              {saving ? 'Recording…' : 'Record Result'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
