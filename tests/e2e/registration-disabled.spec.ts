import { test, expect } from '@playwright/test'

test.describe('Registration policy UX', () => {
  test.skip(
    process.env.ALLOW_SELF_REGISTRATION !== 'false',
    'Runs in the production-default configuration where self-registration is disabled'
  )

  test('disabled self-registration is explained before a user enters account details', async ({
    page,
  }) => {
    await page.goto('/register')

    await expect(page.getByRole('heading', { name: /registration is managed/i })).toBeVisible()
    await expect(page.getByTestId('registration-disabled-message')).toContainText(
      'Contact your administrator'
    )
    await expect(page.getByTestId('register-form')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')

    const favicon = page.locator('link[rel="icon"]')
    await expect(favicon).toHaveAttribute('href', '/logo.svg')
    const faviconResponse = await page.request.get('/logo.svg')
    expect(faviconResponse.status()).toBe(200)
  })
})
