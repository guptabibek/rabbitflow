import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectPermission } from '@/lib/domain/auth'
import { getDocument, updateDocument, deleteDocument, getDocumentRevisions } from '@/lib/domain/document-service'

const updateDocSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  content: z.string().max(500000).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId: id } = await params
    const { searchParams } = new URL(request.url)
    const includeRevisions = searchParams.get('revisions') === 'true'

    const doc = await getDocument(id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, doc.projectId, 'project:read')
    if (!auth.ok) return auth.response

    const response: Record<string, unknown> = { ...doc }
    if (includeRevisions) {
      response.revisions = await getDocumentRevisions(id)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching document:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId: id } = await params

    const doc = await getDocument(id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, doc.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateDocSchema.parse(body)

    const updated = await updateDocument(id, auth.actor.userId, data)
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating document:', error)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId: id } = await params

    const doc = await getDocument(id)
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, doc.projectId, 'project:update')
    if (!auth.ok) return auth.response

    await deleteDocument(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
