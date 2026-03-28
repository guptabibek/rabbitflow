import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'

// DELETE /api/api-tokens/[tokenId] - Revoke a token
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { tokenId: id } = await params

    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const token = await db.apiToken.findUnique({
      where: { id },
      select: { id: true, userId: true },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    if (token.userId !== auth.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.apiToken.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error revoking API token:', error)
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 })
  }
}
