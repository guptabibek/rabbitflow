import { test, expect } from './fixtures/app.fixture'
import { E2E_TEST_PASSWORD, TEST_ACCOUNTS, makeSignupEmail } from './support/env'
import { expectToast, login, logout } from './support/ui'

test.describe('Authentication', () => {
  test.describe.configure({ mode: 'parallel' })

  test('user can sign up, log in, and log out through the real UI', async ({ page, seed }) => {
    const email = makeSignupEmail('signup')
    const name = 'Playwright Signup User'

    try {
      await page.goto('/register')
      await page.getByTestId('register-name-input').fill(name)
      await page.getByTestId('register-email-input').fill(email)
      await page.getByTestId('register-password-input').fill(E2E_TEST_PASSWORD)

      const registerResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/register') && response.request().method() === 'POST'
      )

      await page.getByTestId('register-submit-button').click()
      const registerResponse = await registerResponsePromise
      const registerPayload = await registerResponse.json()

      expect(registerResponse.status()).toBe(201)
      expect(registerPayload.user.email).toBe(email)
      await expect(page).toHaveURL(/\/dashboard$/)

      const createdUser = await seed.getUserByEmail(email)
      expect(createdUser?.email).toBe(email)

      await logout(page)

      const loginResponse = await login(page, email, E2E_TEST_PASSWORD)
      const loginPayload = await loginResponse.json()

      expect(loginPayload.user.email).toBe(email)
      await logout(page)
    } finally {
      await seed.deleteUserByEmail(email)
    }
  })

  test('duplicate registration and invalid credentials surface actionable errors', async ({ page, seed }) => {
    const duplicateEmail = makeSignupEmail('duplicate')

    try {
      await seed.ensureUserAccount({
        email: duplicateEmail,
        name: 'Existing Duplicate User',
      })

      await page.goto('/register')
      await page.getByTestId('register-name-input').fill('Duplicate Attempt')
      await page.getByTestId('register-email-input').fill(duplicateEmail)
      await page.getByTestId('register-password-input').fill(E2E_TEST_PASSWORD)

      const duplicateResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/register') && response.request().method() === 'POST'
      )

      await page.getByTestId('register-submit-button').click()
      const duplicateResponse = await duplicateResponsePromise

      expect(duplicateResponse.status()).toBe(409)
      await expectToast(page, /already exists/i)

      await page.goto('/login')
      await page.getByTestId('login-email-input').fill(TEST_ACCOUNTS.member.email)
      await page.getByTestId('login-password-input').fill('wrong-password')

      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/login') && response.request().method() === 'POST'
      )

      await page.getByTestId('login-submit-button').click()
      const loginResponse = await loginResponsePromise

      expect(loginResponse.status()).toBe(401)
      await expectToast(page, /invalid email or password/i)
    } finally {
      await seed.deleteUserByEmail(duplicateEmail)
    }
  })

  test('login disables duplicate submits during delays and reports server failures', async ({ page, seed }) => {
    const email = makeSignupEmail('delayed-login')
    let loginRequestCount = 0

    try {
      await seed.ensureUserAccount({
        email,
        name: 'Delayed Login User',
      })

      await page.route('**/api/auth/login', async (route) => {
        loginRequestCount += 1
        await new Promise((resolve) => setTimeout(resolve, 800))

        if (loginRequestCount === 1) {
          await route.continue()
          return
        }

        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected duplicate submit failure' }),
        })
      })

      await page.goto('/login')
      await page.getByTestId('login-email-input').fill(email)
      await page.getByTestId('login-password-input').fill(E2E_TEST_PASSWORD)

      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/auth/login') && response.request().method() === 'POST'
      )

      await Promise.allSettled([
        page.getByTestId('login-submit-button').click(),
        page.getByTestId('login-submit-button').click(),
      ])

      await expect(page.getByTestId('login-submit-button')).toBeDisabled()

      const loginResponse = await loginResponsePromise
      expect(loginResponse.ok()).toBeTruthy()
      expect(loginRequestCount).toBe(1)
      await expect(page).toHaveURL(/\/dashboard$/)

      await logout(page)
      await page.unroute('**/api/auth/login')

      await page.route('**/api/auth/login', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected login failure' }),
        })
      })

      await page.goto('/login')
      await page.getByTestId('login-email-input').fill(email)
      await page.getByTestId('login-password-input').fill(E2E_TEST_PASSWORD)
      await page.getByTestId('login-submit-button').click()

      await expectToast(page, /injected login failure/i)
      await expect(page).toHaveURL(/\/login$/)
    } finally {
      await seed.deleteUserByEmail(email)
    }
  })
})