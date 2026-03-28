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
})

export { expect }