import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { globalSearch } from '@/lib/domain/search-service'
import { withCache } from '@/lib/redis'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim()
    const projectId = searchParams.get('projectId')
    const types = searchParams.get('types')?.split(',').filter(Boolean)
    const pageRaw = Number.parseInt(searchParams.get('page') || '1', 10)
    const pageSizeRaw = Number.parseInt(searchParams.get('pageSize') || '20', 10)
    const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw
    const pageSize = Number.isNaN(pageSizeRaw) || pageSizeRaw < 1 ? 20 : Math.min(pageSizeRaw, 50)

    if (!q || q.length < 2) {
      return NextResponse.json({ items: [], total: 0, query: q ?? '' })
    }

    if (q.length > 200) {
      return NextResponse.json({ error: 'Query too long (max 200 characters)' }, { status: 400 })
    }

    const cacheKey = `search:${auth.user.id}:${q}:${projectId ?? 'all'}:${(types ?? []).join(',')}:${page}:${pageSize}`

    const results = await withCache(cacheKey, 5, () =>
      globalSearch(q, {
        userId: auth.user.id,
        projectId: projectId || undefined,
        types,
        page,
        pageSize,
      })
    )

    return NextResponse.json(results)
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
