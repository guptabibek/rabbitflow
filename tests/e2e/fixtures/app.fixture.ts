import { test as base, expect } from '@playwright/test'
import * as seedUtils from '../support/db'
import { TEST_ACCOUNTS } from '../support/env'

type AppFixtures = {
  accounts: typeof TEST_ACCOUNTS
  seed: typeof seedUtils
}

export const test = base.extend<AppFixtures>({
  accounts: async ({}, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(TEST_ACCOUNTS)
  },
  seed: async ({}, use) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(seedUtils)
  },
  /*
    Surface a view that crashed.

    React's error boundary catches a render failure and swaps in the "Something
    went wrong" panel, so the browser never raises `pageerror` and the run only
    reports whatever locator went missing afterwards. A real crash — the store
    once received an object where the issue list belonged, and every subsequent
    `issues.filter(...)` threw — read as "element(s) not found" several steps
    away from the cause.

    Logging the console error puts the actual exception in the test output. It
    does not fail the test on its own.
  */
  page: async ({ page }, use) => {
    page.on('console', (message) => {
      const text = message.text()
      if (message.type() === 'error' && text.includes('Unhandled view error')) {
        console.log(`[view crash] ${text.slice(0, 500)}`)
      }
    })
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
  },
})

export { expect }