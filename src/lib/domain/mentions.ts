const COMMENT_MENTION_REGEX = /@\[(.+?)\]\(user:([a-z0-9]+)\)/gi

export type ParsedMention = {
  label: string
  userId: string
  token: string
}

export function parseCommentMentions(content: string): ParsedMention[] {
  const mentions = new Map<string, ParsedMention>()

  for (const match of content.matchAll(COMMENT_MENTION_REGEX)) {
    const label = match[1]?.trim()
    const userId = match[2]?.trim()

    if (!label || !userId) continue

    const token = `@[${label}](user:${userId})`

    if (!mentions.has(token)) {
      mentions.set(token, { label, userId, token })
    }
  }

  return Array.from(mentions.values())
}

export function stripMentionMarkup(content: string): string {
  return content.replace(COMMENT_MENTION_REGEX, '@$1')
}
