import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { formatProjectIssueKey } from '@/lib/domain/issue-key-format'
import { getMaxProjectIssueNumber, lockProjectIssueSequence } from '@/lib/domain/issue-key-sequence'
import { parseCsv, parseCsvLine, validateImportData, MAX_ROWS, inferFieldMapping } from '@/lib/domain/csv-parser'
import type { FieldMapping, ImportValidationResult } from '@/lib/domain/csv-parser'

export { parseCsv, parseCsvLine, validateImportData, MAX_ROWS, inferFieldMapping }
export type { FieldMapping, ImportValidationResult }

// ============================================================================
// CSV IMPORT SERVICE
// ============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const SYSTEM_FIELDS = [
  'title', 'description', 'workItemType', 'status', 'priority',
  'severity', 'storyPoints', 'estimatedHours', 'dueDate',
  'assigneeEmail', 'labels', 'areaPath', 'iterationPath',
] as const

export async function claimImportJobStart(jobId: string): Promise<'claimed' | 'missing' | 'invalid-status'> {
  const existing = await db.importJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  })

  if (!existing) {
    return 'missing'
  }

  if (existing.status !== 'validated') {
    return 'invalid-status'
  }

  const result = await db.importJob.updateMany({
    where: { id: jobId, status: 'validated' },
    data: { status: 'processing', startedAt: new Date() },
  })

  return result.count === 1 ? 'claimed' : 'invalid-status'
}

export async function markImportJobFailed(jobId: string, error: unknown): Promise<void> {
  await db.importJob.updateMany({
    where: {
      id: jobId,
      status: {
        notIn: ['completed', 'failed'],
      },
    },
    data: {
      status: 'failed',
      errors: [{ row: 0, error: error instanceof Error ? error.message : 'Unknown error' }] as never,
      completedAt: new Date(),
    },
  })
}

export async function processImportJob(jobId: string): Promise<void> {
  const job = await db.importJob.findUnique({
    where: { id: jobId },
    include: {
      project: { select: { id: true, key: true } },
    },
  })

  if (!job) return

  if (job.status === 'validated') {
    const claimed = await claimImportJobStart(jobId)
    if (claimed !== 'claimed') {
      return
    }
  } else if (job.status !== 'processing') {
    return
  }

  try {
    const config = job.config as { csvData: string; defaultWorkItemType?: string | null } | null
    if (!config?.csvData) throw new Error('No CSV data found')

    const { rows } = parseCsv(config.csvData)
    const fieldMapping = job.fieldMapping as FieldMapping
    let successCount = 0
    let failCount = 0
    const importErrors: Array<{ row: number; error: string }> = []

    // Resolve email → userId mapping upfront
    const emailField = Object.entries(fieldMapping).find(([, v]) => v === 'assigneeEmail')?.[0]
    let emailToUserMap = new Map<string, string>()
    if (emailField) {
      const emails = [...new Set(rows.map((r) => r[emailField]?.trim().toLowerCase()).filter(Boolean))]
      if (emails.length > 0) {
        const users = await db.user.findMany({
          where: { email: { in: emails } },
          select: { id: true, email: true },
        })
        emailToUserMap = new Map(users.map((u) => [u.email.toLowerCase(), u.id]))
      }
    }

    // Process in batches of 50
    const batchSize = 50
    for (let batchStart = 0; batchStart < rows.length; batchStart += batchSize) {
      const batch = rows.slice(batchStart, batchStart + batchSize)
      const preparedRows: Array<{
        rowNum: number
        data: Omit<Prisma.IssueCreateManyInput, 'key'>
      }> = []

      for (let i = 0; i < batch.length; i++) {
        const row = batch[i]
        const rowNum = batchStart + i + 2

        try {
          const getValue = (systemField: string) => {
            const csvCol = Object.entries(fieldMapping).find(([, v]) => v === systemField)?.[0]
            return csvCol ? row[csvCol]?.trim() : undefined
          }

          const title = getValue('title')
          if (!title) {
            importErrors.push({ row: rowNum, error: 'Missing title' })
            failCount++
            continue
          }

          const priority = getValue('priority')?.toLowerCase()
          const validPriorities = ['lowest', 'low', 'medium', 'high', 'highest']

          preparedRows.push({
            rowNum,
            data: {
              projectId: job.projectId,
              title,
              description: getValue('description') ?? null,
              workItemType: getValue('workItemType') || config.defaultWorkItemType || 'task',
              status: 'backlog',
              priority: validPriorities.includes(priority ?? '') ? (priority as string) : 'medium',
              storyPoints: getValue('storyPoints') ? Number.parseInt(getValue('storyPoints')!, 10) || null : null,
              estimatedHours: getValue('estimatedHours') ? Number.parseFloat(getValue('estimatedHours')!) || null : null,
              dueDate: getValue('dueDate') ? new Date(getValue('dueDate')!) : null,
              assigneeId: emailField && row[emailField] ? emailToUserMap.get(row[emailField].trim().toLowerCase()) ?? null : null,
              reporterId: job.userId,
              columnOrder: batchStart + i,
            },
          })
        } catch (err) {
          importErrors.push({
            row: rowNum,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
          failCount++
        }
      }

      if (preparedRows.length > 0) {
        try {
          await db.$transaction(async (tx) => {
            await lockProjectIssueSequence(tx, job.projectId)
            let keyCounter = await getMaxProjectIssueNumber(tx, job.projectId, job.project.key)
            const createData = preparedRows.map(({ data }) => ({
              ...data,
              key: formatProjectIssueKey(job.project.key, ++keyCounter),
            }))

            await tx.issue.createMany({ data: createData })
          })

          successCount += preparedRows.length
        } catch (err) {
          // Fall back to individual creates on batch failure
          for (const preparedRow of preparedRows) {
            try {
              await db.$transaction(async (tx) => {
                await lockProjectIssueSequence(tx, job.projectId)
                const keyCounter = await getMaxProjectIssueNumber(tx, job.projectId, job.project.key)

                await tx.issue.create({
                  data: {
                    ...preparedRow.data,
                    key: formatProjectIssueKey(job.project.key, keyCounter + 1),
                  } as Prisma.IssueUncheckedCreateInput,
                })
              })

              successCount++
            } catch (individualErr) {
              failCount++
              importErrors.push({
                row: preparedRow.rowNum,
                error: individualErr instanceof Error ? individualErr.message : 'Unknown error',
              })
            }
          }
        }
      }

      // Update progress
      await db.importJob.update({
        where: { id: jobId },
        data: {
          processedRows: batchStart + batch.length,
          successRows: successCount,
          failedRows: failCount,
        },
      })
    }

    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: failCount > 0 && successCount === 0 ? 'failed' : 'completed',
        processedRows: rows.length,
        successRows: successCount,
        failedRows: failCount,
        errors: importErrors.length > 0 ? importErrors as unknown as undefined : undefined,
        completedAt: new Date(),
      },
    })

    await createAuditLog({
      projectId: job.projectId,
      userId: job.userId,
      action: 'import_completed',
      details: {
        fileName: job.fileName,
        totalRows: rows.length,
        successRows: successCount,
        failedRows: failCount,
      },
    })
  } catch (error) {
    console.error('Import job failed:', error)
    await markImportJobFailed(jobId, error)
  }
}
