import { NextRequest, NextResponse } from 'next/server'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { requireProjectPermission } from '@/lib/domain/auth'
import { invalidateSprintCaches } from '@/lib/domain/cache'

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issueId')

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 })
    }

    const issue = await db.issue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, issue.projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const attachments = await db.attachment.findMany({
      where: { issueId },
      orderBy: { uploadedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json(attachments)
  } catch (error) {
    console.error('Error fetching attachments:', error)
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const issueId = String(formData.get('issueId') || '')
    const file = formData.get('file')

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Attachment file is required' }, { status: 400 })
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json(
        { error: 'Attachments must be 10MB or smaller' },
        { status: 400 }
      )
    }

    const issue = await db.issue.findUnique({
      where: { id: issueId },
      select: { id: true, projectId: true, iterationId: true, key: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, issue.projectId, 'workitem:update')
    if (!auth.ok) return auth.response

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'attachments')
    await mkdir(uploadDir, { recursive: true })

    const extension = path.extname(file.name) || ''
    const safeName = `${issue.id}-${Date.now()}${extension}`
    const filePath = path.join(uploadDir, safeName)
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()))

    const attachment = await db.attachment.create({
      data: {
        issueId,
        fileName: file.name,
        filePath: `/uploads/attachments/${safeName}`,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        uploadedBy: auth.actor.userId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    })

    await createAuditLog({
      projectId: issue.projectId,
      issueId,
      userId: auth.actor.userId,
      action: 'attachment_added',
      details: {
        key: issue.key,
        fileName: file.name,
      },
    })

    await invalidateSprintCaches(issue.projectId, issue.iterationId)

    return NextResponse.json(attachment, { status: 201 })
  } catch (error) {
    console.error('Error creating attachment:', error)
    return NextResponse.json({ error: 'Failed to create attachment' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const attachment = await db.attachment.findUnique({
      where: { id },
      include: {
        issue: { select: { projectId: true, iterationId: true, key: true } },
      },
    })

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, attachment.issue.projectId, 'workitem:update')
    if (!auth.ok) return auth.response

    await db.attachment.delete({ where: { id } })

    const filePath = path.join(process.cwd(), 'public', attachment.filePath)
    try {
      await unlink(filePath)
    } catch {
      // File may already be missing — not critical
    }

    await createAuditLog({
      projectId: attachment.issue.projectId,
      issueId: attachment.issueId,
      userId: auth.actor.userId,
      action: 'attachment_removed',
      details: {
        key: attachment.issue.key,
        fileName: attachment.fileName,
      },
    })

    await invalidateSprintCaches(attachment.issue.projectId, attachment.issue.iterationId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting attachment:', error)
    return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 })
  }
}
