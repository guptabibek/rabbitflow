import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createAuditLog } from '@/lib/domain/audit'
import { invalidateSprintCaches } from '@/lib/domain/cache'
import { requireProjectPermission } from '@/lib/domain/auth'
import { sanitizeRichText, toPlainTextPreview } from '@/lib/domain/content'
import { parseCommentMentions } from '@/lib/domain/mentions'
import { normalizeProjectRole } from '@/lib/domain/rbac'
import { sendMentionNotificationEmails } from '@/lib/domain/notifications'
import { createNotifications } from '@/lib/domain/notification-service'
import { dispatchWebhookEvent } from '@/lib/domain/webhook-service'

const updateCommentSchema = z.object({
  content: z.string().min(1),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId: id } = await params
    const body = await request.json()
    const data = updateCommentSchema.parse(body)

    const existing = await db.comment.findUnique({
      where: { id },
      include: {
        mentions: {
          select: {
            userId: true,
          },
        },
        issue: {
          select: {
            projectId: true,
            iterationId: true,
            key: true,
            title: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      existing.issue.projectId,
      'workitem:comment'
    )
    if (!auth.ok) return auth.response

    const normalizedRole = normalizeProjectRole(auth.actor.projectRole)
    if (existing.authorId !== auth.actor.userId && !['Admin', 'PM'].includes(normalizedRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const sanitizedContent = sanitizeRichText(data.content)
    if (!sanitizedContent) {
      return NextResponse.json({ error: 'Comment content is required' }, { status: 400 })
    }

    const parsedMentions = parseCommentMentions(sanitizedContent)
    const validMentionUsers =
      parsedMentions.length > 0
        ? await db.projectMember.findMany({
            where: {
              projectId: existing.issue.projectId,
              userId: { in: parsedMentions.map((mention) => mention.userId) },
            },
            select: { userId: true },
          })
        : []
    const validMentionUserIds = new Set(validMentionUsers.map((member) => member.userId))

    const comment = await db.$transaction(async (tx) => {
      await tx.commentRevision.create({
        data: {
          commentId: id,
          editorId: auth.actor.userId,
          previousContent: existing.content,
        },
      })

      await tx.commentMention.deleteMany({ where: { commentId: id } })

      return tx.comment.update({
        where: { id },
        data: {
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
          revisions: {
            orderBy: { createdAt: 'desc' },
            include: {
              editor: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
      })
    })

    await createAuditLog({
      projectId: existing.issue.projectId,
      issueId: existing.issueId,
      userId: auth.actor.userId,
      action: 'comment_updated',
      details: {
        contentPreview: toPlainTextPreview(sanitizedContent, 100),
      },
    })

    const previousMentionUserIds = new Set(existing.mentions.map((mention) => mention.userId))
    const newlyMentionedUserIds = comment.mentions
      .map((mention) => mention.userId)
      .filter((userId) => !previousMentionUserIds.has(userId))

    if (newlyMentionedUserIds.length > 0) {
      await createNotifications(newlyMentionedUserIds, {
        projectId: existing.issue.projectId,
        issueId: existing.issueId,
        actorId: auth.actor.userId,
        type: 'mention',
        title: `${comment.author.name} mentioned you in ${existing.issue.key}`,
        body: toPlainTextPreview(sanitizedContent, 160),
        entityType: 'issue',
        entityId: existing.issueId,
        actionUrl: `/work-items/${existing.issueId}`,
        metadata: {
          issueKey: existing.issue.key,
          issueTitle: existing.issue.title,
          commentId: comment.id,
        },
      })

      void sendMentionNotificationEmails({
        issueId: existing.issueId,
        mentionUserIds: newlyMentionedUserIds,
        actorUserId: auth.actor.userId,
        commentContent: sanitizedContent,
      })
    }

    void dispatchWebhookEvent(existing.issue.projectId, 'comment.updated', {
      comment: {
        id: comment.id,
        issueId: comment.issueId,
        authorId: comment.authorId,
        contentPreview: toPlainTextPreview(comment.content, 120),
      },
      actorUserId: auth.actor.userId,
    })

    await invalidateSprintCaches(existing.issue.projectId, existing.issue.iterationId)

    return NextResponse.json(comment)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    console.error('Error updating comment:', error)
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId: id } = await params

    const existing = await db.comment.findUnique({
      where: { id },
      include: {
        issue: {
          select: {
            projectId: true,
            iterationId: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const auth = await requireProjectPermission(
      request,
      existing.issue.projectId,
      'workitem:comment'
    )
    if (!auth.ok) return auth.response

    const normalizedRole = normalizeProjectRole(auth.actor.projectRole)
    if (existing.authorId !== auth.actor.userId && !['Admin', 'PM'].includes(normalizedRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.comment.delete({ where: { id } })

    await createAuditLog({
      projectId: existing.issue.projectId,
      issueId: existing.issueId,
      userId: auth.actor.userId,
      action: 'comment_deleted',
    })

    void dispatchWebhookEvent(existing.issue.projectId, 'comment.deleted', {
      comment: {
        id,
        issueId: existing.issueId,
        authorId: existing.authorId,
      },
      actorUserId: auth.actor.userId,
    })

    await invalidateSprintCaches(existing.issue.projectId, existing.issue.iterationId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting comment:', error)
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}
