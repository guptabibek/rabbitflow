import { expect, test } from './fixtures/app.fixture'
import { AUTH_STATES, makeProjectName } from './support/env'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Administration form feedback', () => {
  test.describe.configure({ mode: 'parallel' })

  test('API token creation explains validation and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('token-feedback') })
    const draftName = 'Retained CI token'

    await page.goto(`/projects/${project.id}/api-tokens`)
    await page.getByRole('button', { name: 'New Token' }).click()
    await page.getByTestId('api-token-create-submit').click()
    await expect(page.getByText('Enter a token name.', { exact: true })).toBeVisible()

    await page.getByTestId('api-token-name-input').fill(draftName)
    await page.route('**/api/api-tokens', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected token failure' }) })
        return
      }
      await route.continue()
    })
    await page.getByTestId('api-token-create-submit').click()
    await expect(page.getByTestId('api-token-create-error')).toContainText('Injected token failure')
    await expect(page.getByTestId('api-token-name-input')).toHaveValue(draftName)
  })

  test('webhook creation validates URLs and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('webhook-feedback') })
    const draftName = 'Retained webhook'
    const draftUrl = 'https://example.com/hooks/rabbitflow'

    await page.goto(`/projects/${project.id}/webhooks`)
    await page.getByRole('button', { name: 'Add Webhook' }).click()
    await page.getByTestId('webhook-create-submit').click()
    await expect(page.getByText('Enter a webhook name.', { exact: true })).toBeVisible()
    await expect(page.getByText('Enter a payload URL.', { exact: true })).toBeVisible()
    await page.getByTestId('webhook-name-input').fill(draftName)
    await page.getByTestId('webhook-url-input').fill('not-a-url')
    await page.getByTestId('webhook-create-submit').click()
    await expect(page.getByText('Enter a valid absolute URL.', { exact: true })).toBeVisible()

    await page.getByTestId('webhook-url-input').fill(draftUrl)
    await page.route('**/api/webhooks', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected webhook failure' }) })
        return
      }
      await route.continue()
    })
    await page.getByTestId('webhook-create-submit').click()
    await expect(page.getByTestId('webhook-create-error')).toContainText('Injected webhook failure')
    await expect(page.getByTestId('webhook-name-input')).toHaveValue(draftName)
    await expect(page.getByTestId('webhook-url-input')).toHaveValue(draftUrl)
  })

  test('recurring task creation explains validation and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('recurring-feedback') })
    const draftTitle = 'Retained weekly checklist'

    await page.goto(`/projects/${project.id}/recurring-tasks`)
    await page.getByRole('button', { name: 'New Schedule' }).click()
    await page.getByTestId('recurring-task-create-submit').click()
    await expect(page.getByText('Enter a template title.', { exact: true })).toBeVisible()

    await page.getByTestId('recurring-task-title-input').fill(draftTitle)
    await page.route('**/api/recurring-tasks', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected recurring task failure' }) })
        return
      }
      await route.continue()
    })
    await page.getByTestId('recurring-task-create-submit').click()
    await expect(page.getByTestId('recurring-task-form-error')).toContainText('Injected recurring task failure')
    await expect(page.getByTestId('recurring-task-title-input')).toHaveValue(draftTitle)
  })

  test('automation creation rejects incomplete actions and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('automation-feedback') })
    const draftName = 'Retained automation'

    await page.goto(`/projects/${project.id}/automations`)
    await page.getByRole('button', { name: 'New Rule' }).click()
    await page.getByTestId('automation-create-submit').click()
    await expect(page.getByText('Enter a rule name.', { exact: true })).toBeVisible()
    await expect(page.getByText('Enter both a field and value.', { exact: true })).toBeVisible()

    await page.getByTestId('automation-name-input').fill(draftName)
    await page.getByPlaceholder('field').fill('priority')
    await page.getByPlaceholder('value').fill('high')
    await page.route('**/api/automations', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected automation failure' }) })
        return
      }
      await route.continue()
    })
    await page.getByTestId('automation-create-submit').click()
    await expect(page.getByTestId('automation-create-error')).toContainText('Injected automation failure')
    await expect(page.getByTestId('automation-name-input')).toHaveValue(draftName)
    await expect(page.getByPlaceholder('field')).toHaveValue('priority')
    await expect(page.getByPlaceholder('value')).toHaveValue('high')
  })

  test('objective creation explains validation and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('objective-feedback') })
    const draftTitle = 'Retained quarterly objective'

    await page.goto(`/projects/${project.id}/objectives`)
    await page.getByRole('button', { name: 'New Objective' }).click()
    await page.getByTestId('objective-create-submit').click()
    await expect(page.getByText('Enter an objective title.', { exact: true })).toBeVisible()

    await page.getByTestId('objective-title-input').fill(draftTitle)
    await page.route('**/api/objectives', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected objective failure' }) })
        return
      }
      await route.continue()
    })
    await page.getByTestId('objective-create-submit').click()
    await expect(page.getByTestId('objective-create-error')).toContainText('Injected objective failure')
    await expect(page.getByTestId('objective-title-input')).toHaveValue(draftTitle)
  })

  test('document creation explains validation and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('document-feedback') })
    const draftTitle = 'Retained operating guide'

    await page.goto(`/projects/${project.id}/documents`)
    await page.getByRole('button', { name: 'New document' }).click()
    await page.getByTestId('document-create-submit').click()
    await expect(page.getByText('Enter a document title.', { exact: true })).toBeVisible()

    await page.getByTestId('document-create-title-input').fill(draftTitle)
    await page.route('**/api/documents', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Injected document failure' }) })
        return
      }
      await route.continue()
    })
    await page.getByTestId('document-create-submit').click()
    await expect(page.getByTestId('document-create-error')).toContainText('Injected document failure')
    await expect(page.getByTestId('document-create-title-input')).toHaveValue(draftTitle)
  })
})
