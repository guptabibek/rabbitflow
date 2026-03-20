import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCommentMentions,
  stripMentionMarkup,
} from '../../src/lib/domain/mentions.ts'

test('parseCommentMentions extracts unique user mentions', () => {
  const content =
    'Pair with @[Alex Doe](user:abc123) and @[Alex Doe](user:abc123), then update @[Sam](user:sam9)'

  assert.deepEqual(parseCommentMentions(content), [
    {
      label: 'Alex Doe',
      userId: 'abc123',
      token: '@[Alex Doe](user:abc123)',
    },
    {
      label: 'Sam',
      userId: 'sam9',
      token: '@[Sam](user:sam9)',
    },
  ])
})

test('stripMentionMarkup converts mention markup to plain text mentions', () => {
  assert.equal(
    stripMentionMarkup('Assigned to @[Alex Doe](user:abc123) for review'),
    'Assigned to @Alex Doe for review'
  )
})
