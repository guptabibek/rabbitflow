import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectPermission } from '@/lib/domain/auth'
import { getDocumentTree, createDocument } from '@/lib/domain/document-service'

const createDocSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(500),
  content: z.string().max(500000).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const tree = await getDocumentTree(projectId)
    return NextResponse.json(tree)
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createDocSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const doc = await createDocument({
      projectId: data.projectId,
      title: data.title,
      content: data.content,
      parentId: data.parentId,
      userId: auth.actor.userId,
    })

    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}
