import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const updateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  slug: z.string().trim().min(1).max(140).regex(/^[a-z0-9-]+$/).optional(),
  audienceRole: z.enum(['Admin', 'PM', 'DevOps', 'Dev', 'QA', 'Viewer']).nullable().optional(),
  summary: z.string().trim().max(240).nullable().optional(),
  body: z.string().trim().min(1).max(15000).optional(),
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ onboardingGuideId: string }> }
) {
  try {
    const { onboardingGuideId: id } = await params
    const existing = await db.onboardingGuide.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'onboarding:manage')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = updateSchema.parse(body)

    const updated = await db.onboardingGuide.update({
      where: { id },
      data: {
        title: data.title,
        slug: data.slug,
        audienceRole: data.audienceRole,
        summary: data.summary,
        content:
          data.body !== undefined ? ({ body: data.body } as Prisma.InputJsonValue) : undefined,
        isPublished: data.isPublished,
        order: data.order,
      },
      include: {
        createdBy: { select: { id: true, name: true, avatar: true } },
      },
    })

    return NextResponse.json({
      ...updated,
      content: parseGuideContent(updated.content),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid onboarding guide', details: error.issues }, { status: 400 })
    }
    console.error('Error updating onboarding guide:', error)
    return NextResponse.json({ error: 'Failed to update onboarding guide' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ onboardingGuideId: string }> }
) {
  try {
    const { onboardingGuideId: id } = await params
    const existing = await db.onboardingGuide.findUnique({ where: { id } })

    if (!existing) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, existing.projectId, 'onboarding:manage')
    if (!auth.ok) return auth.response

    await db.onboardingGuide.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting onboarding guide:', error)
    return NextResponse.json({ error: 'Failed to delete onboarding guide' }, { status: 500 })
  }
}