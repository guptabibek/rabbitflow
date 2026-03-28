import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

// GET /api/import/[importJobId] - Get import job status/details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ importJobId: string }> }
) {
  try {
    const { importJobId: id } = await params

    const job = await db.importJob.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        fileName: true,
        status: true,
        totalRows: true,
        processedRows: true,
        successRows: true,
        failedRows: true,
        errors: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!job) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, job.projectId, 'workitem:create')
    if (!auth.ok) return auth.response

    return NextResponse.json(job)
  } catch (error) {
    console.error('Error fetching import job:', error)
    return NextResponse.json({ error: 'Failed to fetch import job' }, { status: 500 })
  }
}
