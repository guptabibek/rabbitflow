const SCRIPT_TAG_REGEX = /<script[\s\S]*?>[\s\S]*?<\/script>/gi
const JAVASCRIPT_URL_REGEX = /javascript:/gi

export function sanitizeRichText(input: string | null | undefined): string | null {
  if (input == null) return null

  const sanitized = input
    .replace(SCRIPT_TAG_REGEX, '')
    .replace(JAVASCRIPT_URL_REGEX, '')
    .trim()

  return sanitized.length > 0 ? sanitized : null
}

export function toPlainTextPreview(input: string | null | undefined, maxLength = 120): string {
  const sanitized = sanitizeRichText(input) ?? ''
  const withoutMarkdown = sanitized
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (withoutMarkdown.length <= maxLength) {
    return withoutMarkdown
  }

  return `${withoutMarkdown.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}
