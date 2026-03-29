'use client'

import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/app-store'
import { inferFieldMapping, parseCsv } from '@/lib/domain/csv-parser'
import { getApiErrorMessage } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ValidationSummary {
  jobId: string | null
  headers: string[]
  warnings: ValidationError[]
}

interface ImportJob {
  id: string
  fileName: string
  status: 'pending' | 'validated' | 'processing' | 'completed' | 'failed'
  totalRows: number
  processedRows: number
  successRows?: number
  failedRows: number
  errors: ValidationError[]
  createdAt: string
  completedAt: string | null
}

type Step = 'upload' | 'validate' | 'importing' | 'done'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImportWizard() {
  const { currentProject } = useAppStore()
  const [step, setStep] = useState<Step>('upload')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [workItemType, setWorkItemType] = useState('task')
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null)
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)

  const fetchJobs = useCallback(async () => {
    if (!currentProject) return
    try {
      const res = await fetch(`/api/import?projectId=${currentProject.id}`)
      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to load import history'))
        setJobs([])
        return
      }

      const data = await res.json()
      setJobs(Array.isArray(data) ? data : (data.jobs ?? []))
    } catch {
      toast.error('Failed to load import history')
    }
    finally {
      setJobsLoaded(true)
    }
  }, [currentProject])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) {
      setFile(f)
      return
    }

    if (f) {
      setFile(null)
      toast.error('Only CSV files can be imported')
    }
  }

  const handleValidate = async () => {
    if (!currentProject || !file) return
    setLoading(true)
    try {
      const text = await file.text()
      const { headers } = parseCsv(text)
      const fieldMapping = inferFieldMapping(headers)
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          projectId: currentProject.id,
          fileName: file.name,
          csvData: text,
          fieldMapping,
          defaultWorkItemType: workItemType,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(await getApiErrorMessage(res, 'Validation failed'))
        setValidationErrors(data.details ?? data.errors ?? [{ row: 0, field: '', message: data.error }])
        setValidationSummary(null)
        setStep('validate')
      } else {
        const data = await res.json()
        if (!data.jobId) {
          const message = 'Validation completed but the import job could not be created'
          setValidationErrors([{ row: 0, field: 'jobId', message }])
          setValidationSummary(null)
          setStep('validate')
          toast.error(message)
          return
        }

        setValidationErrors(data.errors ?? [])
        setValidationSummary({
          jobId: data.jobId,
          headers: data.headers ?? headers,
          warnings: data.warnings ?? [],
        })
        setStep('validate')
      }
    } catch {
      toast.error('Failed to validate CSV')
    } finally {
      setLoading(false)
    }
  }

  const handleStartImport = async () => {
    if (!validationSummary?.jobId) {
      toast.error('Validate the file before starting the import')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          jobId: validationSummary.jobId,
        }),
      })

      if (!res.ok) {
        toast.error(await getApiErrorMessage(res, 'Failed to start import'))
        return
      }

      const data = await res.json()
      const startedJobId = data.job?.id ?? data.id
      if (!startedJobId) {
        toast.error('Import started, but the job ID was missing from the response')
        return
      }

      setImportJob(data.job ?? data)
      setStep('importing')
      void pollJob(startedJobId)
    } catch {
      toast.error('Failed to start import')
    } finally {
      setLoading(false)
    }
  }

  const pollJob = async (jobId: string) => {
    let attempts = 0
    const maxAttempts = 60
    const poll = async () => {
      if (attempts >= maxAttempts) {
        toast.error('Import status check timed out. Refresh import history to continue tracking progress.')
        void fetchJobs()
        return
      }

      attempts++
      try {
        const res = await fetch(`/api/import/${jobId}`)

        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) {
            toast.error(await getApiErrorMessage(res, 'Import job is no longer available'))
            setStep('done')
            void fetchJobs()
            return
          }

          setTimeout(poll, 2000)
          return
        }

        const data = await res.json()
        const job = data.job ?? data
        setImportJob(job)
        if (job.status === 'completed' || job.status === 'failed') {
          setStep('done')
          void fetchJobs()
          return
        }
      } catch {
        setTimeout(poll, 2000)
        return
      }

      setTimeout(poll, 2000)
    }

    setTimeout(poll, 2000)
  }

  const reset = () => {
    setStep('upload')
    setFile(null)
    setWorkItemType('task')
    setValidationErrors([])
    setValidationSummary(null)
    setImportJob(null)
  }

  const handleOpen = (open: boolean) => {
    setDialogOpen(open)
    if (open) {
      reset()
      void fetchJobs()
    }
  }

  if (!currentProject) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select a project to import data.
      </div>
    )
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      case 'failed':
        return <XCircle className="h-3.5 w-3.5 text-red-500" />
      case 'processing':
      case 'validating':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
      default:
        return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">CSV Import</h2>
          <p className="text-sm text-muted-foreground">
            Import work items from CSV files.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={handleOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              Import CSV
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {step === 'upload' && 'Upload CSV'}
                {step === 'validate' && 'Validation Results'}
                {step === 'importing' && 'Importing…'}
                {step === 'done' && 'Import Complete'}
              </DialogTitle>
            </DialogHeader>

            {step === 'upload' && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Work Item Type</Label>
                  <Select value={workItemType} onValueChange={setWorkItemType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Task</SelectItem>
                      <SelectItem value="dev_task">Dev Task</SelectItem>
                      <SelectItem value="qc_task">QC Task</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="prod_bug">Prod Bug</SelectItem>
                      <SelectItem value="story">Story</SelectItem>
                      <SelectItem value="epic">Epic</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="design_doc">Design Doc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>CSV File</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileChange}
                      className="cursor-pointer"
                    />
                  </div>
                  {file && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {file.name} ({(file.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  CSV must include a <code className="font-mono bg-muted px-1 rounded">title</code> column.
                  Optional: description, priority, assigneeEmail, status.
                </p>
              </div>
            )}

            {step === 'validate' && (
              <div className="space-y-3 py-2">
                {validationErrors.length === 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-3 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Validation passed. Ready to import.
                    </div>
                    {validationSummary && (
                      <p className="text-xs text-muted-foreground">
                        Detected columns: {validationSummary.headers.join(', ')}
                      </p>
                    )}
                    {validationSummary && validationSummary.warnings.length > 0 && (
                      <ScrollArea className="max-h-32">
                        <div className="space-y-1">
                          {validationSummary.warnings.slice(0, 10).map((warning, index) => (
                            <div key={`${warning.row}-${warning.field}-${index}`} className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
                              <span className="font-medium">Row {warning.row}</span>{' '}
                              {warning.field && <span>[{warning.field}]</span>}{' '}
                              {warning.message}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 rounded-md bg-red-500/10 p-3 text-sm text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      {validationErrors.length} validation error(s)
                    </div>
                    <ScrollArea className="max-h-48">
                      <div className="space-y-1">
                        {validationErrors.slice(0, 20).map((e, i) => (
                          <div key={i} className="rounded bg-muted/50 px-2 py-1 text-xs">
                            <span className="font-medium">Row {e.row}</span>{' '}
                            {e.field && <span className="text-muted-foreground">[{e.field}]</span>}{' '}
                            {e.message}
                          </div>
                        ))}
                        {validationErrors.length > 20 && (
                          <p className="text-xs text-muted-foreground">
                            …and {validationErrors.length - 20} more
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </div>
            )}

            {step === 'importing' && importJob && (
              <div className="space-y-3 py-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Processing rows…</span>
                </div>
                <Progress
                  value={
                    importJob.totalRows
                      ? (importJob.processedRows / importJob.totalRows) * 100
                      : 0
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {importJob.processedRows} / {importJob.totalRows} rows
                </p>
              </div>
            )}

            {step === 'done' && importJob && (
              <div className="space-y-3 py-2">
                <div
                  className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                    importJob.status === 'completed'
                      ? 'bg-green-500/10 text-green-600'
                      : 'bg-red-500/10 text-red-600'
                  }`}
                >
                  {importJob.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {importJob.status === 'completed'
                    ? `Successfully imported ${importJob.successRows ?? (importJob.processedRows - importJob.failedRows)} items.`
                    : 'Import failed.'}
                </div>
                {importJob.failedRows > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {importJob.failedRows} row(s) failed to import.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              {step === 'upload' && (
                <Button onClick={handleValidate} disabled={!file || loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Validating…
                    </>
                  ) : (
                    'Validate'
                  )}
                </Button>
              )}
              {step === 'validate' && (
                <>
                  <Button variant="outline" onClick={reset}>
                    Back
                  </Button>
                  <Button
                    onClick={handleStartImport}
                    disabled={loading || validationErrors.length > 0 || !validationSummary?.jobId}
                  >
                    {loading ? 'Starting…' : 'Start Import'}
                  </Button>
                </>
              )}
              {step === 'done' && (
                <Button onClick={() => handleOpen(false)}>Close</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Past import jobs */}
      {jobsLoaded && jobs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Import History</h3>
          {jobs.map((j) => (
            <Card key={j.id}>
              <CardContent className="flex items-center gap-3 p-3">
                {statusIcon(j.status)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{j.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.processedRows}/{j.totalRows} rows ·{' '}
                    {j.failedRows > 0 && (
                      <span className="text-red-500">{j.failedRows} failed · </span>
                    )}
                    {new Date(j.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'}
                  className="text-[10px]"
                >
                  {j.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {jobsLoaded && jobs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileSpreadsheet className="mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">No imports yet</p>
            <p className="text-sm">Click &quot;Import CSV&quot; to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
