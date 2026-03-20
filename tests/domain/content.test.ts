import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeRichText, toPlainTextPreview } from '../../src/lib/domain/content.ts'

test('sanitizeRichText removes script tags and javascript urls', () => {
  const input =
    '<script>alert(1)</script><a href="javascript:alert(2)">Click</a><p>Hello</p>'

  assert.equal(sanitizeRichText(input), '<a href="alert(2)">Click</a><p>Hello</p>')
})

test('toPlainTextPreview strips markdown and truncates predictably', () => {
  const preview = toPlainTextPreview(
    '# Heading [Link](https://example.com) with **formatting** and extra words',
    24
  )

  assert.equal(preview, 'Heading Link with for...')
})
