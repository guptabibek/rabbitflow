import { test as base, expect } from '@playwright/test'
import * as seedUtils from '../support/db'
import { TEST_ACCOUNTS } from '../support/env'
import { createHash } from 'node:crypto'

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
  page: async ({ page }, use, testInfo) => {
    // Distinct synthetic clients keep production rate limits enabled without
    // combining every browser/retry into one loopback registration bucket.
    // Production nginx overwrites client-supplied forwarding headers; this
    // fixture talks directly to the isolated test server.
    const identity = createHash('sha256').update(`${testInfo.testId}:${testInfo.retry}`).digest()
    await page.setExtraHTTPHeaders({ 'x-forwarded-for': `10.${identity[0]}.${identity[1]}.${identity[2]}` })
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
