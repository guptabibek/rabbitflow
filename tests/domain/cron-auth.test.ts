import test from 'node:test'
import assert from 'node:assert/strict'
import { getAuthorizedCronSecret } from '../../src/lib/cron-auth.ts'

function requestWithSecret(secret: string | null) {
  return {
    headers: {
      get(name: string) {
        return name === 'x-cron-secret' ? secret : null
      },
    },
  }
}

test('cron authorization reads the current runtime secret after module import', () => {
  const original = process.env.CRON_SECRET

  try {
    process.env.CRON_SECRET = 'first-runtime-secret'
    assert.equal(getAuthorizedCronSecret(requestWithSecret('first-runtime-secret')), 'first-runtime-secret')

    process.env.CRON_SECRET = 'rotated-runtime-secret'
    assert.equal(
      getAuthorizedCronSecret(requestWithSecret('rotated-runtime-secret')),
      'rotated-runtime-secret'
    )
    assert.equal(getAuthorizedCronSecret(requestWithSecret('first-runtime-secret')), null)
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  }
})

test('cron authorization fails closed for missing or incorrect secrets', () => {
  const original = process.env.CRON_SECRET

  try {
    delete process.env.CRON_SECRET
    assert.equal(getAuthorizedCronSecret(requestWithSecret('provided')), null)

    process.env.CRON_SECRET = 'expected'
    assert.equal(getAuthorizedCronSecret(requestWithSecret(null)), null)
    assert.equal(getAuthorizedCronSecret(requestWithSecret('different')), null)
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  }
})
