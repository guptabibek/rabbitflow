import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { type Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireProjectPermission, requireAuthenticatedUser } from '@/lib/domain/auth'

const createGitLinkSchema = z.object({
  issueId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  provider: z.enum(['github', 'gitlab', 'bitbucket', 'azure_devops']),
  linkType: z.enum(['branch', 'commit', 'pull_request']),
  externalId: z.string().trim().min(1).max(500),
  externalUrl: z.string().url().max(2048),
  title: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// GET /api/git-links?issueId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issueId')
    const projectId = searchParams.get('projectId')

    if (!issueId || !projectId) {
      return NextResponse.json({ error: 'issueId and projectId are required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    const issue = await db.issue.findFirst({
      where: { id: issueId, projectId },
      select: { id: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found in project' }, { status: 404 })
    }

    const links = await db.gitLink.findMany({
      where: { issueId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(links)
  } catch (error) {
    console.error('Error fetching git links:', error)
    return NextResponse.json({ error: 'Failed to fetch git links' }, { status: 500 })
  }
}

// POST /api/git-links - Create or auto-link
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createGitLinkSchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'workitem:update')
    if (!auth.ok) return auth.response

    // Verify issue belongs to project
    const issue = await db.issue.findFirst({
      where: { id: data.issueId, projectId: data.projectId },
      select: { id: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found in project' }, { status: 404 })
    }

    // Check for duplicate
    const existing = await db.gitLink.findFirst({
      where: {
        issueId: data.issueId,
        provider: data.provider,
        externalId: data.externalId,
        linkType: data.linkType,
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'This git link already exists' }, { status: 409 })
    }

    const link = await db.gitLink.create({
      data: {
        issueId: data.issueId,
        provider: data.provider,
        linkType: data.linkType,
        externalId: data.externalId,
        externalUrl: data.externalUrl,
        title: data.title ?? '',
        metadata: data.metadata as Prisma.InputJsonValue ?? undefined,
      },
    })

    return NextResponse.json(link, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating git link:', error)
    return NextResponse.json({ error: 'Failed to create git link' }, { status: 500 })
  }
}

// DELETE is on [gitLinkId] route
