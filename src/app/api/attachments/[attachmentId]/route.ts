import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import {
  fileExists,
  resolveStoredFilePath,
  storedNameFromFilePath,
} from '@/lib/domain/upload-storage'

/**
 * Download an attachment.
 *
 * Attachments were previously written into `public/uploads/attachments` and
 * served by the static file handler, so any authenticated user who learned a
 * URL could read any project's files — the only gate was the proxy's blanket
 * "is there a session" check. This route authorises against the parent work
 * item before returning a single byte.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params

    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        fileName: true,
        filePath: true,
        mimeType: true,
        issue: { select: { projectId: true, areaId: true } },
      },
    })

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    // The same permission that governs reading the work item itself, including
    // any area-level ACL scoping applied to it.
    const auth = await requireProjectPermission(
      request,
      attachment.issue.projectId,
      'workitem:read',
      undefined,
      { areaId: attachment.issue.areaId ?? null }
    )
    if (!auth.ok) return auth.response

    const storedName = storedNameFromFilePath(attachment.filePath)
    const absolutePath = resolveStoredFilePath('attachments', storedName)

    if (!absolutePath || !(await fileExists(absolutePath))) {
      return NextResponse.json({ error: 'Attachment file is unavailable' }, { status: 404 })
    }

    const data = await readFile(absolutePath)

    return new NextResponse(new Uint8Array(data), {
      headers: {
        // The detected type recorded at upload, never a client-supplied one.
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        // Download rather than render, so a stored file can never execute as
        // active content on this origin.
        'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        // Per-user authorisation, so this must not be cached by shared proxies.
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Error serving attachment:', error)
    return NextResponse.json({ error: 'Failed to serve attachment' }, { status: 500 })
  }
}
