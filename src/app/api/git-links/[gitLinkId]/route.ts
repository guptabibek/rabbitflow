import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ gitLinkId: string }> }
) {
  try {
    const { gitLinkId: id } = await params

    const link = await db.gitLink.findUnique({
      where: { id },
      select: {
        id: true,
        issue: {
          select: {
            projectId: true,
          },
        },
      },
    })

    if (!link) {
      return NextResponse.json({ error: 'Git link not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, link.issue.projectId, 'workitem:update')
    if (!auth.ok) return auth.response

    await db.gitLink.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting git link:', error)
    return NextResponse.json({ error: 'Failed to delete git link' }, { status: 500 })
  }
}
