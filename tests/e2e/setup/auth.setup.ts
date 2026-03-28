import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { test } from '@playwright/test'
import { AUTH_STATES, E2E_TEST_PASSWORD, TEST_ACCOUNTS } from '../support/env'
import { ensureBaseUsers, resetE2EArtifacts } from '../support/db'
import { login } from '../support/ui'

test('generate reusable auth states', async ({ browser }) => {
  await resetE2EArtifacts()
  await ensureBaseUsers()

  mkdirSync(dirname(AUTH_STATES.admin), { recursive: true })

  for (const [role, account] of Object.entries(TEST_ACCOUNTS) as Array<
    [keyof typeof TEST_ACCOUNTS, (typeof TEST_ACCOUNTS)[keyof typeof TEST_ACCOUNTS]]
  >) {
    const context = await browser.newContext()
    const page = await context.newPage()

    await login(page, account.email, E2E_TEST_PASSWORD)
    await context.storageState({ path: AUTH_STATES[role] })
    await context.close()
  }
})