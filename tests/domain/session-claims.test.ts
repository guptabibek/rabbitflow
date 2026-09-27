import test from 'node:test'
import assert from 'node:assert/strict'
import { readSessionClaims } from '../../src/lib/session-claims.ts'

/**
 * Every session token the app issues names its user and its AuthSession row.
 * A token missing either was never issued here, and once skipped the session
 * check entirely — see the module comment.
 */

test('a session token yields its user and session', () => {
  assert.deepEqual(readSessionClaims({ sub: 'user-1', sid: 'session-1' }), {
    userId: 'user-1',
    sessionId: 'session-1',
  })
})

test('a token without a session id is not a session token', () => {
  assert.equal(readSessionClaims({ sub: 'user-1' }), null)
  assert.equal(readSessionClaims({ sub: 'user-1', sid: '' }), null)
  assert.equal(readSessionClaims({ sub: 'user-1', sid: '   ' }), null)
  assert.equal(readSessionClaims({ sub: 'user-1', sid: 42 }), null)
})

test('a token without a subject is not a session token', () => {
  assert.equal(readSessionClaims({ sid: 'session-1' }), null)
  assert.equal(readSessionClaims({ sub: '', sid: 'session-1' }), null)
  assert.equal(readSessionClaims({ sub: null, sid: 'session-1' }), null)
})
