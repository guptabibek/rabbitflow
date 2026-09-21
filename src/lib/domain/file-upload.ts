import { randomUUID } from 'node:crypto'

/**
 * Upload validation.
 *
 * Two rules govern everything here:
 *
 *  1. **Never trust the client.** `File.type` is a client-supplied string and
 *     `File.name` is attacker-controlled. Neither may decide what gets written to
 *     disk. The stored extension is derived from the *sniffed* content type only.
 *
 *  2. **Never let an upload become active content.** Files served from the
 *     application's own origin with a `text/html`, `image/svg+xml` or JavaScript
 *     content type execute in the context of the app, which turns any upload into
 *     stored XSS against every user who opens it.
 */

/** Extensions we are willing to write, keyed by the content type we detected. */
const IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
} as const

const DOCUMENT_TYPES = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/json': '.json',
} as const

const ATTACHMENT_TYPES = { ...IMAGE_TYPES, ...DOCUMENT_TYPES } as const

export type DetectedType = keyof typeof ATTACHMENT_TYPES

type Signature = {
  type: DetectedType
  offset: number
  bytes: number[]
}

/**
 * Magic-byte signatures. Deliberately excludes SVG: it is XML that browsers
 * execute scripts from, so it is not an acceptable upload format here.
 */
const SIGNATURES: Signature[] = [
  { type: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { type: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  // RIFF....WEBP — the 4-byte size field at offset 4 is skipped.
  { type: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { type: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { type: 'application/zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
]

function matchesSignature(buffer: Buffer, signature: Signature): boolean {
  if (buffer.length < signature.offset + signature.bytes.length) return false
  return signature.bytes.every((byte, index) => buffer[signature.offset + index] === byte)
}

const TAB = 9
const LINE_FEED = 10
const CARRIAGE_RETURN = 13
const SPACE = 32
const DELETE_CHAR = 127

function isDisallowedControlChar(code: number): boolean {
  if (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) return false
  return code < SPACE || code === DELETE_CHAR
}

/** True when the buffer decodes as UTF-8 without disallowed control characters. */
function looksLikeUtf8Text(buffer: Buffer): boolean {
  const text = buffer.subarray(0, 4096).toString('utf8')
  if (text.includes('�')) return false

  for (let index = 0; index < text.length; index += 1) {
    if (isDisallowedControlChar(text.charCodeAt(index))) return false
  }

  return true
}

/**
 * Text uploads are the one case where content alone cannot distinguish an
 * allowed format from a dangerous one — HTML, SVG and JavaScript are all valid
 * UTF-8. Reject anything whose leading bytes look like markup or a script.
 */
function looksLikeMarkupOrScript(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase()
  return (
    head.startsWith('<') ||
    head.includes('<script') ||
    head.includes('<svg') ||
    head.includes('<!doctype html') ||
    head.includes('<html')
  )
}

export type UploadValidationResult =
  | { ok: true; detectedType: DetectedType; extension: string; storedFileName: string }
  | { ok: false; error: string }

type ValidateOptions = {
  /** Restrict the accepted set — avatars accept images only. */
  allow: 'image' | 'attachment'
  /** Maximum size in bytes. */
  maxBytes: number
  /** Prefix for the generated filename, e.g. the issue or user id. */
  namePrefix: string
}

/**
 * Validate an uploaded file by its actual content and return a safe,
 * server-generated filename. Callers must use `storedFileName` verbatim — never
 * any part of `file.name`.
 */
export function validateUploadBuffer(
  buffer: Buffer,
  declaredName: string,
  options: ValidateOptions
): UploadValidationResult {
  if (buffer.length === 0) {
    return { ok: false, error: 'File is empty' }
  }

  if (buffer.length > options.maxBytes) {
    const limitMb = Math.floor(options.maxBytes / (1024 * 1024))
    return { ok: false, error: `File must be ${limitMb}MB or smaller` }
  }

  const allowedTypes: Record<string, string> =
    options.allow === 'image' ? IMAGE_TYPES : ATTACHMENT_TYPES

  let detectedType: DetectedType | null = null

  for (const signature of SIGNATURES) {
    if (matchesSignature(buffer, signature)) {
      detectedType = signature.type
      break
    }
  }

  // Plain-text formats have no magic bytes; accept them only for attachments, and
  // only once we are satisfied they are not markup or script.
  if (!detectedType && options.allow === 'attachment' && looksLikeUtf8Text(buffer)) {
    if (looksLikeMarkupOrScript(buffer)) {
      return {
        ok: false,
        error: 'HTML, XML, SVG and script uploads are not permitted',
      }
    }

    const lowerName = declaredName.toLowerCase()
    detectedType = lowerName.endsWith('.csv')
      ? 'text/csv'
      : lowerName.endsWith('.json')
        ? 'application/json'
        : 'text/plain'
  }

  if (!detectedType || !(detectedType in allowedTypes)) {
    const permitted = Object.keys(allowedTypes).join(', ')
    return {
      ok: false,
      error: `Unsupported file type. Permitted types: ${permitted}`,
    }
  }

  const extension = allowedTypes[detectedType]

  return {
    ok: true,
    detectedType,
    extension,
    // Fully server-generated: no component of the client's filename survives, so
    // extension smuggling and path traversal are both structurally impossible.
    storedFileName: `${options.namePrefix}-${Date.now()}-${randomUUID()}${extension}`,
  }
}

/**
 * Preserve the user's original filename for display only. Strips path separators
 * and control characters so it can never be interpreted as a path, and caps the
 * length. Safe to store and render as text — never to write to disk.
 */
export function sanitizeDisplayFileName(name: string, fallback = 'upload'): string {
  const base = name.split(/[/\\]/).pop() ?? ''

  let cleaned = ''
  for (let index = 0; index < base.length; index += 1) {
    if (!isDisallowedControlChar(base.charCodeAt(index))) {
      cleaned += base[index]
    }
  }

  cleaned = cleaned.trim()
  if (!cleaned) return fallback
  return cleaned.slice(0, 255)
}
