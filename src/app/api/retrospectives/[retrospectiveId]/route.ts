import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const updateRetroSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  status: z.enum(['active', 'voting', 'discussing', 'closed']).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ retrospectiveId: string }> }
) {
  try {
    const { retrospectiveId: id } = await params

    const retro = await db.retrospective.findUnique({
      where: { id },
      include: {
        iteration: { select: { id: true, name: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true } },
            retroVotes: { select: { userId: true } },
          },
        },
      },
    })

    if (!retro) {
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, retro.projectId, 'project:read')
    if (!auth.ok) return auth.response

    // Group items by category and add vote count
    const itemsByCategory = {
      went_well: retro.items.filter((i) => i.category === 'went_well').map((i) => ({
        ...i,
        voteCount: i.retroVotes.length,
        hasVoted: i.retroVotes.some((v) => v.userId === auth.actor.userId),
      })),
      to_improve: retro.items.filter((i) => i.category === 'to_improve').map((i) => ({
        ...i,
        voteCount: i.retroVotes.length,
        hasVoted: i.retroVotes.some((v) => v.userId === auth.actor.userId),
      })),
      action_item: retro.items.filter((i) => i.category === 'action_item').map((i) => ({
        ...i,
        voteCount: i.retroVotes.length,
        hasVoted: i.retroVotes.some((v) => v.userId === auth.actor.userId),
      })),
    }

    return NextResponse.json({
      ...retro,
      items: undefined,
      itemsByCategory,
    })
  } catch (error) {
    console.error('Error fetching retrospective:', error)
    return NextResponse.json({ error: 'Failed to fetch retrospective' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ retrospectiveId: string }> }
) {
  try {
    const { retrospectiveId: id } = await params

    const retro = await db.retrospective.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })

    if (!retro) {
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, retro.projectId, 'project:update')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateRetroSchema.parse(body)

    const updated = await db.retrospective.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error updating retrospective:', error)
    return NextResponse.json({ error: 'Failed to update retrospective' }, { status: 500 })
  }
}

// POST for voting on items
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ retrospectiveId: string }> }
) {
  try {
    const { retrospectiveId: id } = await params
    const body = await request.json()
    const { itemId } = body

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    const retro = await db.retrospective.findUnique({
      where: { id },
      select: { id: true, projectId: true, status: true },
    })

    if (!retro) {
      return NextResponse.json({ error: 'Retrospective not found' }, { status: 404 })
    }

    if (retro.status !== 'voting' && retro.status !== 'active') {
      return NextResponse.json({ error: 'Voting is not active for this retrospective' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, retro.projectId, 'project:read')
    if (!auth.ok) return auth.response

    // Toggle vote
    const existing = await db.retroVote.findFirst({
      where: { retroItemId: itemId, userId: auth.actor.userId },
    })

    if (existing) {
      await db.retroVote.delete({ where: { id: existing.id } })
      return NextResponse.json({ voted: false })
    }

    await db.retroVote.create({
      data: { retroItemId: itemId, userId: auth.actor.userId },
    })

    return NextResponse.json({ voted: true }, { status: 201 })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 })
  }
}
