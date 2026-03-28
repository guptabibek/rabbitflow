import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'
import { normalizeProjectRole } from '@/lib/domain/rbac'

const guideSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(140),
  slug: z.string().trim().min(1).max(140).regex(/^[a-z0-9-]+$/),
  audienceRole: z.enum(['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer']).nullable().optional(),
  summary: z.string().trim().max(240).nullable().optional(),
  body: z.string().trim().min(1).max(15000),
  isPublished: z.boolean().optional(),
  order: z.number().int().min(0).max(999).optional(),
})

function parseGuideContent(content: unknown) {
  if (!content || typeof content !== 'object') {
    return { body: '' }
  }

  const body = 'body' in content && typeof content.body === 'string' ? content.body : ''
  return { body }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'project:read')
    if (!auth.ok) return auth.response

    const role = normalizeProjectRole(auth.actor.projectRole)
    const canManage = await requireProjectPermission(request, projectId, 'onboarding:manage')

    const guides = await db.onboardingGuide.findMany({
      where: {
        projectId,
        ...(canManage.ok
          ? {}
          : {
              isPublished: true,
              OR: [{ audienceRole: null }, { audienceRole: role }],
            }),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        createdBy: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json(
      guides.map((guide) => ({
        ...guide,
        content: parseGuideContent(guide.content),
      }))
    )
  } catch (error) {
    console.error('Error fetching onboarding guides:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding guides' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = guideSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'onboarding:manage')
    if (!auth.ok) return auth.response

    const guide = await db.onboardingGuide.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        slug: data.slug,
        audienceRole: data.audienceRole ?? null,
        summary: data.summary ?? null,
        content: { body: data.body } as Prisma.InputJsonValue,
        isPublished: data.isPublished ?? true,
        order: data.order ?? 0,
        createdById: auth.actor.userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json(
      {
        ...guide,
        content: parseGuideContent(guide.content),
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid onboarding guide', details: error.issues }, { status: 400 })
    }
    console.error('Error creating onboarding guide:', error)
    return NextResponse.json({ error: 'Failed to create onboarding guide' }, { status: 500 })
  }
}