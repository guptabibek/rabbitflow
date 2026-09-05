import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue,
  isSecretEncryptionEnabled,
  reencryptIfNeeded,
  resetKeyCacheForTests,
} from '../../src/lib/crypto-box.ts'

/**
 * Regression tests for SEC-014.
 *
 * TOTP seeds were stored in the clear, so anyone with a database dump could mint
 * valid second factors for every enrolled user indefinitely — without the
 * password and without leaving a trace.
 */

const KEY = randomBytes(32).toString('base64')
const originalKey = process.env.MFA_ENCRYPTION_KEY

function withKey(value: string | undefined) {
  if (value === undefined) delete process.env.MFA_ENCRYPTION_KEY
  else process.env.MFA_ENCRYPTION_KEY = value
  resetKeyCacheForTests()
}

beforeEach(() => withKey(KEY))
after(() => withKey(originalKey))

test('SEC-014: an encrypted secret does not contain its plaintext', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const stored = encryptSecret(secret)

  assert.ok(!stored.includes(secret), 'the plaintext seed must not survive in storage')
  assert.ok(isEncryptedValue(stored))
})

test('SEC-014: encryption round-trips', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  assert.equal(decryptSecret(encryptSecret(secret)), secret)
})

test('SEC-014: each encryption uses a fresh IV', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const first = encryptSecret(secret)
  const second = encryptSecret(secret)

  // Identical plaintext must not produce identical ciphertext, or an observer
  // could tell which users share a seed.
  assert.notEqual(first, second)
  assert.equal(decryptSecret(first), secret)
  assert.equal(decryptSecret(second), secret)
})

test('SEC-014: tampering is detected rather than silently decrypting', () => {
  const stored = encryptSecret('JBSWY3DPEHPK3PXP')
  const [version, iv, tag, data] = stored.split(':')

  // Flip a byte of ciphertext.
  const corrupted = Buffer.from(data, 'base64')
  corrupted[0] ^= 0xff

  const tampered = [version, iv, tag, corrupted.toString('base64')].join(':')
  assert.equal(decryptSecret(tampered), null, 'GCM authentication must reject the change')
})

test('SEC-014: a wrong key yields null rather than throwing', () => {
  const stored = encryptSecret('JBSWY3DPEHPK3PXP')

  withKey(randomBytes(32).toString('base64'))

  // One unreadable row must not take down sign-in for everyone.
  assert.equal(decryptSecret(stored), null)
})

test('SEC-014: a malformed envelope yields null', () => {
  assert.equal(decryptSecret('v1:not-valid'), null)
  assert.equal(decryptSecret('v1:::'), null)
})

test('SEC-014: values stored before encryption are still readable', () => {
  // Existing deployments must not lock their enrolled users out when the key is
  // introduced.
  const legacy = 'JBSWY3DPEHPK3PXP'
  assert.equal(isEncryptedValue(legacy), false)
  assert.equal(decryptSecret(legacy), legacy)
})

test('SEC-014: plaintext values are upgraded, encrypted ones are left alone', () => {
  const legacy = 'JBSWY3DPEHPK3PXP'

  const upgraded = reencryptIfNeeded(legacy)
  assert.ok(upgraded)
  assert.ok(isEncryptedValue(upgraded))
  assert.equal(decryptSecret(upgraded), legacy)

  // Already encrypted: nothing to do.
  assert.equal(reencryptIfNeeded(upgraded), null)
})

test('SEC-014: without a key, values pass through unchanged', () => {
  withKey(undefined)

  assert.equal(isSecretEncryptionEnabled(), false)
  assert.equal(encryptSecret('JBSWY3DPEHPK3PXP'), 'JBSWY3DPEHPK3PXP')
  assert.equal(reencryptIfNeeded('JBSWY3DPEHPK3PXP'), null)
})

test('SEC-014: hex keys and passphrases are both accepted', () => {
  withKey(randomBytes(32).toString('hex'))
  assert.equal(decryptSecret(encryptSecret('seed-a')), 'seed-a')

  withKey('a-human-chosen-passphrase-of-any-length')
  assert.equal(decryptSecret(encryptSecret('seed-b')), 'seed-b')
})
