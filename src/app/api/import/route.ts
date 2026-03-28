import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import {
  claimImportJobStart,
  markImportJobFailed,
  parseCsv,
  processImportJob,
  validateImportData,
  type FieldMapping,
} from '@/lib/domain/import-service'

const MAX_FILE_SIZE = 10 * 1024 * 1024

const validateSchema = z.object({
  projectId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255).optional(),
  csvData: z.string().min(1).max(MAX_FILE_SIZE),
  fieldMapping: z.record(z.string(), z.string()),
  defaultWorkItemType: z.string().trim().min(1).max(100).optional(),
})

const startImportSchema = z.object({
  jobId: z.string().trim().min(1),
})

// GET /api/import?projectId=xxx - List import jobs for project
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:create')
    if (!auth.ok) return auth.response

    const jobs = await db.importJob.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        totalRows: true,
        processedRows: true,
        successRows: true,
        failedRows: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    return NextResponse.json(jobs)
  } catch (error) {
    console.error('Error fetching import jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch import jobs' }, { status: 500 })
  }
}

// POST /api/import - Validate or start import
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    if (action === 'validate') {
      const data = validateSchema.parse(body)

      const auth = await requireProjectPermission(request, data.projectId, 'workitem:create')
      if (!auth.ok) return auth.response

      if (data.csvData.length > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
      }

      const { headers, rows } = parseCsv(data.csvData)

      if (rows.length === 0) {
        return NextResponse.json({ error: 'CSV file has no data rows' }, { status: 400 })
      }

      const fieldMapping = data.fieldMapping as FieldMapping
      const result = validateImportData(rows, fieldMapping)

      // Create import job in 'validated' state
      let jobId: string | null = null
      if (result.valid) {
        const job = await db.importJob.create({
          data: {
            projectId: data.projectId,
            userId: auth.actor.userId,
            fileName: data.fileName ?? `import-${Date.now()}.csv`,
            status: 'validated',
            totalRows: rows.length,
            fieldMapping: data.fieldMapping,
            config: {
              csvData: data.csvData,
              defaultWorkItemType: data.defaultWorkItemType ?? null,
            },
          },
        })
        jobId = job.id
      }

      return NextResponse.json({ ...result, jobId, headers })
    }

    if (action === 'start') {
      const data = startImportSchema.parse(body)

      const job = await db.importJob.findUnique({
        where: { id: data.jobId },
        select: { id: true, projectId: true, status: true },
      })

      if (!job) {
        return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
      }

      const auth = await requireProjectPermission(request, job.projectId, 'workitem:create')
      if (!auth.ok) return auth.response

      if (job.status !== 'validated') {
        return NextResponse.json(
          { error: `Cannot start import with status "${job.status}"` },
          { status: 400 }
        )
      }

      const claim = await claimImportJobStart(job.id)
      if (claim === 'missing') {
        return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
      }
      if (claim !== 'claimed') {
        return NextResponse.json(
          { error: 'Import job is already running or no longer startable' },
          { status: 409 }
        )
      }

      void processImportJob(job.id).catch(async (err) => {
        console.error('Import job failed:', err)
        await markImportJobFailed(job.id, err)
      })

      return NextResponse.json({ id: job.id, status: 'processing' })
    }

    return NextResponse.json({ error: 'Invalid action. Use "validate" or "start"' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Import error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
