import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { canFavoriteEntity, listFavoritesForUser } from '@/lib/domain/favorites'

const createFavoriteSchema = z.object({
  entityType: z.enum(['project', 'issue', 'view', 'document']),
  entityId: z.string().trim().min(1),
})

// GET /api/favorites - List user's favorites
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entityType')

    const favorites = await listFavoritesForUser({
      userId: auth.user.id,
      isAdmin: auth.user.globalRole === 'admin',
      entityType: entityType as 'project' | 'issue' | 'view' | 'document' | null,
      projectId: searchParams.get('projectId'),
    })

    return NextResponse.json(favorites)
  } catch (error) {
    console.error('Error fetching favorites:', error)
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 })
  }
}

// POST /api/favorites - Toggle favorite
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = createFavoriteSchema.parse(body)

    const accessible = await canFavoriteEntity({
      userId: auth.user.id,
      isAdmin: auth.user.globalRole === 'admin',
      entityType: data.entityType,
      entityId: data.entityId,
    })

    if (!accessible) {
      return NextResponse.json({ error: 'Favorite target not found' }, { status: 404 })
    }

    // Check if already favorited
    const existing = await db.favorite.findFirst({
      where: {
        userId: auth.user.id,
        entityType: data.entityType,
        entityId: data.entityId,
      },
    })

    if (existing) {
      // Unfavorite (toggle)
      await db.favorite.delete({ where: { id: existing.id } })
      return NextResponse.json({ favorited: false })
    }

    // Create favorite
    const fav = await db.favorite.create({
      data: {
        userId: auth.user.id,
        entityType: data.entityType,
        entityId: data.entityId,
      },
    })

    return NextResponse.json({ ...fav, favorited: true }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error toggling favorite:', error)
    return NextResponse.json({ error: 'Failed to toggle favorite' }, { status: 500 })
  }
}
