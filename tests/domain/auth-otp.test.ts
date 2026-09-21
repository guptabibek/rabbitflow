import test from 'node:test'
import assert from 'node:assert/strict'
import { generateNumericOtp, secretsMatch } from '../../src/lib/auth-otp.ts'

/**
 * Regression tests for SEC-004 and SEC-023.
 *
 * OTPs were previously generated with `Math.random()` — a non-cryptographic PRNG
 * whose state is recoverable from observed output, on the account-recovery path.
 * Secrets were compared with `!==`, which leaks length and content by timing.
 */

test('SEC-004: generated OTPs always have the requested digit length', () => {
  for (let i = 0; i < 500; i += 1) {
    const otp = generateNumericOtp()
    assert.match(otp, /^[0-9]{6}$/)
  }
})

test('SEC-004: custom lengths are honoured and never zero-padded short', () => {
  for (const length of [4, 6, 8]) {
    for (let i = 0; i < 100; i += 1) {
      const otp = generateNumericOtp(length)
      assert.equal(otp.length, length)
      // A leading zero would silently shrink the effective keyspace.
      assert.notEqual(otp[0], '0')
    }
  }
})

test('SEC-004: OTPs are drawn across the full range, not a narrow band', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 1000; i += 1) {
    seen.add(generateNumericOtp())
  }

  // 1000 draws from 900k values should essentially never repeat; a broken or
  // seeded generator would collapse the distribution.
  assert.ok(seen.size > 990, `expected near-unique draws, got ${seen.size}`)
})

test('SEC-023: secretsMatch accepts identical values', () => {
  assert.equal(secretsMatch('123456', '123456'), true)
  assert.equal(secretsMatch('a-long-shared-cron-secret', 'a-long-shared-cron-secret'), true)
})

test('SEC-023: secretsMatch rejects differing values without throwing', () => {
  assert.equal(secretsMatch('123456', '123457'), false)
  assert.equal(secretsMatch('123456', '654321'), false)
})

test('SEC-023: secretsMatch handles length mismatch without throwing', () => {
  // timingSafeEqual throws on unequal buffer lengths, so the guard must handle
  // this rather than letting a short guess produce a 500.
  assert.equal(secretsMatch('123456', ''), false)
  assert.equal(secretsMatch('123456', '1'), false)
  assert.equal(secretsMatch('123456', '1234567890'), false)
  assert.equal(secretsMatch('', '123456'), false)
})

test('SEC-023: secretsMatch is not fooled by unicode width differences', () => {
  assert.equal(secretsMatch('secret', 'sécret'), false)
})
