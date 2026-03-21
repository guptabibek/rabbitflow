import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { sanitizeRichText, toPlainTextPreview } from '@/lib/domain/content'
import { parseCommentMentions } from '@/lib/domain/mentions'
import { requireProjectPermission } from '@/lib/domain/auth'
import { sendMentionNotificationEmails } from '@/lib/domain/notifications'

const createCommentSchema = z.object({
  issueId: z.string(),
  content: z.string().min(1),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueId = searchParams.get('issueId')
    const cursor = searchParams.get('cursor')
    const takeParam = parseInt(searchParams.get('take') || '0', 10)
    const paginate = searchParams.get('paginate') === 'true' || takeParam > 0
    const take = Math.min(Math.max(takeParam || 30, 1), 100)
    const includeRevisions = searchParams.get('includeRevisions') === 'true'

    if (!issueId) {
      return NextResponse.json({ error: 'issueId is required' }, { status: 400 })
    }

    const issue = await db.issue.findUnique({
      where: { id: issueId },
      select: { projectId: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, issue.projectId, 'workitem:read')
    if (!auth.ok) return auth.response

    if (paginate) {
      const rows = await db.comment.findMany({
        where: { issueId },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'desc' },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          mentions: {
            include: {
              user: { select: { id: true, name: true, avatar: true } },
            },
          },
          ...(includeRevisions
            ? {
                revisions: {
                  orderBy: { createdAt: 'desc' },
                  include: {
                    editor: { select: { id: true, name: true, avatar: true } },
                  },
                },
              }
            : {}),
        },
      })

      const hasMore = rows.length > take
      const items = hasMore ? rows.slice(0, take) : rows
      const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null

      return NextResponse.json({ items, nextCursor, hasMore })
    }

    const comments = await db.comment.findMany({
      where: { issueId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        mentions: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        revisions: {
          orderBy: { createdAt: 'desc' },
          include: {
            editor: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(comments)
  } catch (error) {
    console.error('Error fetching comments:', error)
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createCommentSchema.parse(body)

    const issue = await db.issue.findUnique({
      where: { id: data.issueId },
      select: { projectId: true, iterationId: true },
    })

    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(request, issue.projectId, 'workitem:comment')
    if (!auth.ok) return auth.response

    const sanitizedContent = sanitizeRichText(data.content)
    if (!sanitizedContent) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const parsedMentions = parseCommentMentions(sanitizedContent)
    const validMentionUsers =
      parsedMentions.length > 0
        ? await db.projectMember.findMany({
            where: {
              projectId: issue.projectId,
              userId: { in: parsedMentions.map((mention) => mention.userId) },
            },
            select: { userId: true },
          })
        : []
    const validMentionUserIds = new Set(validMentionUsers.map((member) => member.userId))

    const comment = await db.comment.create({
      data: {
        issueId: data.issueId,
        authorId: auth.actor.userId,
        content: sanitizedContent,
        mentions: parsedMentions.length
          ? {
              create: parsedMentions
                .filter((mention) => validMentionUserIds.has(mention.userId))
                .map((mention) => ({
                  userId: mention.userId,
                  token: mention.token,
                })),
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        mentions: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        revisions: true,
      },
    })

    await createAuditLog({
      projectId: issue.projectId,
      issueId: data.issueId,
      userId: auth.actor.userId,
      action: 'work_item_commented',
      details: { contentPreview: toPlainTextPreview(sanitizedContent, 100) },
    })

    if (comment.mentions.length > 0) {
      await createAuditLog({
        projectId: issue.projectId,
        issueId: data.issueId,
        userId: auth.actor.userId,
        action: 'work_item_mentioned_users',
        details: {
          userIds: comment.mentions.map((mention) => mention.userId),
        },
      })

      void sendMentionNotificationEmails({
        issueId: data.issueId,
        mentionUserIds: comment.mentions.map((mention) => mention.userId),
        actorUserId: auth.actor.userId,
        commentContent: sanitizedContent,
      })
    }

    await invalidateSprintCaches(issue.projectId, issue.iterationId)

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}
