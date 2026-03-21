import { db } from '@/lib/db'
import { enqueueEmail } from '@/lib/email-queue'
import { toPlainTextPreview } from '@/lib/domain/content'
import { stripMentionMarkup } from '@/lib/domain/mentions'
import { buildMentionEmail, buildAssignmentEmail } from '@/lib/domain/email-templates'

type MentionNotificationArgs = {
  issueId: string
  mentionUserIds: string[]
  actorUserId: string
  commentContent: string
}

type AssignmentNotificationArgs = {
  issueId: string
  assigneeUserId: string
  actorUserId: string
}

function resolveAppBaseUrl() {
  const configuredUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (!configuredUrl) {
    throw new Error('APP_URL (or NEXT_PUBLIC_APP_URL) is not configured')
  }

  try {
    const normalizedUrl = /^https?:\/\//i.test(configuredUrl)
      ? configuredUrl
      : `http://${configuredUrl}`
    const base = new URL(normalizedUrl)
    if (!base.pathname.endsWith('/')) {
      base.pathname = `${base.pathname}/`
    }
    return base
  } catch {
    throw new Error('APP_URL (or NEXT_PUBLIC_APP_URL) must be a valid absolute URL')
  }
}

function workItemUrl(issueId: string) {
  const base = resolveAppBaseUrl()
  return new URL(`work-items/${encodeURIComponent(issueId)}`, base).toString()
}

export async function sendMentionNotificationEmails(args: MentionNotificationArgs) {
  const recipientIds = Array.from(new Set(args.mentionUserIds)).filter(
    (userId) => userId !== args.actorUserId
  )

  if (recipientIds.length === 0) return

  try {
    const [issue, actor, recipients] = await Promise.all([
      db.issue.findUnique({
        where: { id: args.issueId },
        select: {
          id: true,
          key: true,
          title: true,
          project: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      }),
      db.user.findUnique({
        where: { id: args.actorUserId },
        select: { id: true, name: true },
      }),
      db.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, name: true, email: true },
      }),
    ])

    if (!issue || !actor) return

    const preview = toPlainTextPreview(stripMentionMarkup(args.commentContent), 240)
    const url = workItemUrl(issue.id)

    await Promise.allSettled(
      recipients
        .filter((recipient) => Boolean(recipient.email))
        .map((recipient) => {
          const email = buildMentionEmail({
            recipientName: recipient.name,
            actorName: actor.name,
            issueKey: issue.key,
            issueTitle: issue.title,
            projectKey: issue.project.key,
            commentPreview: preview,
            actionUrl: url,
          })
          return enqueueEmail({ to: recipient.email, ...email })
        })
    )
  } catch (error) {
    console.error('Mention notification email failed:', error)
  }
}

export async function sendWorkItemAssignmentEmail(args: AssignmentNotificationArgs) {
  if (args.assigneeUserId === args.actorUserId) return

  try {
    const [issue, actor, assignee] = await Promise.all([
      db.issue.findUnique({
        where: { id: args.issueId },
        select: {
          id: true,
          key: true,
          title: true,
          project: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      }),
      db.user.findUnique({
        where: { id: args.actorUserId },
        select: { id: true, name: true },
      }),
      db.user.findUnique({
        where: { id: args.assigneeUserId },
        select: { id: true, name: true, email: true },
      }),
    ])

    if (!issue || !actor || !assignee?.email) return

    const url = workItemUrl(issue.id)
    const email = buildAssignmentEmail({
      assigneeName: assignee.name,
      actorName: actor.name,
      issueKey: issue.key,
      issueTitle: issue.title,
      projectKey: issue.project.key,
      actionUrl: url,
    })
    await enqueueEmail({ to: assignee.email, ...email })
  } catch (error) {
    console.error('Assignment notification email failed:', error)
  }
}
