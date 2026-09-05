import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeDisplayFileName,
  validateUploadBuffer,
} from '../../src/lib/domain/file-upload.ts'

/**
 * Regression tests for SEC-001.
 *
 * The original avatar endpoint trusted the client-supplied `File.type` and took
 * the stored extension from the client-supplied `File.name`, so an HTML payload
 * declared as `image/png` was written as `<id>-<ts>.html` and served back as
 * `text/html` from the application's own origin — stored XSS. The attachment
 * endpoint performed no type check at all.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const GIF = Buffer.from('GIF89a', 'latin1')
const PDF = Buffer.from('%PDF-1.7\nstuff', 'latin1')

const imageOptions = { allow: 'image' as const, maxBytes: 5 * 1024 * 1024, namePrefix: 'user1' }
const attachmentOptions = {
  allow: 'attachment' as const,
  maxBytes: 10 * 1024 * 1024,
  namePrefix: 'issue1',
}

test('SEC-001: HTML disguised as a PNG by filename and MIME is rejected', () => {
  const payload = Buffer.from('<html><body><script>alert(document.domain)</script></body></html>')

  // This is exactly the exploit that was reproduced against the running app:
  // an HTML body uploaded with a `.png` name and an `image/png` content type.
  const result = validateUploadBuffer(payload, 'totally-an-image.png', imageOptions)

  assert.equal(result.ok, false)
})

test('SEC-001: SVG is rejected even though it is a legitimate image format', () => {
  // SVG is XML that browsers execute script from, so it is deliberately absent
  // from the allow-list regardless of how it is declared.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

  assert.equal(validateUploadBuffer(svg, 'logo.svg', imageOptions).ok, false)
  assert.equal(validateUploadBuffer(svg, 'logo.svg', attachmentOptions).ok, false)
})

test('SEC-001: markup uploaded as a text attachment is rejected', () => {
  const html = Buffer.from('   <!DOCTYPE html><html><head></head></html>')

  assert.equal(validateUploadBuffer(html, 'notes.txt', attachmentOptions).ok, false)
})

test('SEC-001: stored filename never contains any part of the client filename', () => {
  const result = validateUploadBuffer(PNG, '../../../etc/passwd.png', imageOptions)

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.ok(!result.storedFileName.includes('passwd'))
  assert.ok(!result.storedFileName.includes('..'))
  assert.ok(!result.storedFileName.includes('/'))
  assert.ok(!result.storedFileName.includes('\\'))
  assert.ok(result.storedFileName.startsWith('user1-'))
  assert.ok(result.storedFileName.endsWith('.png'))
})

test('SEC-001: extension is derived from detected content, not the declared name', () => {
  // A genuine PNG named ".html" must still be stored as .png.
  const result = validateUploadBuffer(PNG, 'payload.html', imageOptions)

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.extension, '.png')
  assert.equal(result.detectedType, 'image/png')
  assert.ok(result.storedFileName.endsWith('.png'))
})

test('genuine image formats are accepted for avatars', () => {
  for (const [buffer, expected] of [
    [PNG, 'image/png'],
    [JPEG, 'image/jpeg'],
    [GIF, 'image/gif'],
  ] as const) {
    const result = validateUploadBuffer(buffer, 'upload.bin', imageOptions)
    assert.equal(result.ok, true, `expected ${expected} to be accepted`)
    if (result.ok) assert.equal(result.detectedType, expected)
  }
})

test('avatars reject non-image types that attachments allow', () => {
  assert.equal(validateUploadBuffer(PDF, 'doc.pdf', imageOptions).ok, false)
  assert.equal(validateUploadBuffer(PDF, 'doc.pdf', attachmentOptions).ok, true)
})

test('plain text and CSV attachments are accepted and typed by extension', () => {
  const csv = validateUploadBuffer(Buffer.from('id,name\n1,Ada\n'), 'export.csv', attachmentOptions)
  assert.equal(csv.ok, true)
  if (csv.ok) assert.equal(csv.detectedType, 'text/csv')

  const txt = validateUploadBuffer(Buffer.from('release notes'), 'notes.txt', attachmentOptions)
  assert.equal(txt.ok, true)
  if (txt.ok) assert.equal(txt.detectedType, 'text/plain')
})

test('empty and oversized uploads are rejected', () => {
  assert.equal(validateUploadBuffer(Buffer.alloc(0), 'x.png', imageOptions).ok, false)

  const oversized = validateUploadBuffer(PNG, 'x.png', {
    ...imageOptions,
    maxBytes: 4,
  })
  assert.equal(oversized.ok, false)
})

test('unrecognised binary content is rejected rather than stored blindly', () => {
  const random = Buffer.from([0x13, 0x37, 0xde, 0xad, 0xbe, 0xef])

  assert.equal(validateUploadBuffer(random, 'thing.png', imageOptions).ok, false)
  assert.equal(validateUploadBuffer(random, 'thing.bin', attachmentOptions).ok, false)
})

test('each upload gets a unique stored name so concurrent writes cannot collide', () => {
  const first = validateUploadBuffer(PNG, 'a.png', imageOptions)
  const second = validateUploadBuffer(PNG, 'a.png', imageOptions)

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  if (!first.ok || !second.ok) return

  assert.notEqual(first.storedFileName, second.storedFileName)
})

test('sanitizeDisplayFileName strips path separators but keeps a readable name', () => {
  assert.equal(sanitizeDisplayFileName('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeDisplayFileName('C:\\Users\\me\\report.pdf'), 'report.pdf')
  assert.equal(sanitizeDisplayFileName('  '), 'upload')
  assert.equal(sanitizeDisplayFileName('quarterly report.pdf'), 'quarterly report.pdf')
  assert.equal(sanitizeDisplayFileName('a'.repeat(400)).length, 255)
})
