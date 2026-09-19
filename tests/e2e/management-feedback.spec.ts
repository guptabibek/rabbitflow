import { expect, test } from './fixtures/app.fixture'
import { AUTH_STATES, makeProjectName } from './support/env'
import { openMembersDialog, selectRadixOption } from './support/ui'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Management form feedback', () => {
  test.describe.configure({ mode: 'parallel' })

  test('iteration validation is explicit and a failed draft remains editable', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('iteration-feedback') })
    const team = await seed.createTeamFixture({ projectId: project.id })
    const draftName = makeProjectName('retained-sprint')

    await page.goto(`/projects/${project.id}/sprints`)
    await page.getByRole('button', { name: 'Manage Sprints' }).click()
    await expect(page.getByTestId('iteration-management')).toBeVisible()

    await page.getByTestId('iteration-save-button').click()
    await expect(page.getByTestId('iteration-name-input')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter an iteration name.', { exact: true })).toBeVisible()
    await expect(page.getByText('Select the team responsible for this sprint.', { exact: true })).toBeVisible()

    await page.getByTestId('iteration-name-input').fill(draftName)
    await selectRadixOption(page, 'iteration-team-trigger', team.name)
    await page.getByTestId('iteration-start-date-input').fill('2026-09-20')
    await page.getByTestId('iteration-end-date-input').fill('2026-09-19')
    await page.getByTestId('iteration-save-button').click()
    await expect(page.getByText('End date must be on or after the start date.', { exact: true })).toBeVisible()

    await page.getByTestId('iteration-end-date-input').fill('2026-10-03')
    await page.route('**/api/iterations', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected iteration save failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByTestId('iteration-save-button').click()
    await expect(page.getByTestId('iteration-save-error')).toContainText('Injected iteration save failure')
    await expect(page.getByTestId('iteration-name-input')).toHaveValue(draftName)
    await expect(page.getByTestId('iteration-team-trigger')).toContainText(team.name)
  })

  test('team validation is explicit and a failed draft remains editable', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('team-feedback') })
    const draftName = makeProjectName('retained-team')

    await page.goto(`/projects/${project.id}/teams`)
    await expect(page.getByTestId('team-management')).toBeVisible()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByTestId('team-save-button').click()
    await expect(page.getByTestId('team-name-input')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter a team name.', { exact: true })).toBeVisible()

    await page.getByTestId('team-name-input').fill(draftName)
    await page.route('**/api/teams', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected team save failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByTestId('team-save-button').click()
    await expect(page.getByTestId('team-save-error')).toContainText('Injected team save failure')
    await expect(page.getByTestId('team-name-input')).toHaveValue(draftName)
  })

  test('label validation is explicit and a failed draft remains editable', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('label-feedback') })
    const draftName = makeProjectName('retained-label')

    await page.goto(`/projects/${project.id}/list`)
    await page.getByRole('button', { name: 'Labels', exact: true }).click()
    await expect(page.getByTestId('labels-management-dialog')).toBeVisible()
    await page.getByTestId('label-create-submit').click()
    await expect(page.getByTestId('label-create-name-input')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('Enter a label name.', { exact: true })).toBeVisible()

    await page.getByTestId('label-create-name-input').fill(draftName)
    await page.route('**/api/labels', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected label save failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByTestId('label-create-submit').click()
    await expect(page.getByTestId('label-create-error')).toContainText('Injected label save failure')
    await expect(page.getByTestId('label-create-name-input')).toHaveValue(draftName)
  })

  test('member creation explains every invalid field and retains a failed draft', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('member-feedback') })
    const name = 'Retained Member Draft'
    const email = `retained-${project.id}@example.com`
    const password = 'temporary-password'

    await page.goto(`/projects/${project.id}/list`)
    await openMembersDialog(page)
    await page.getByTestId('member-management-add-button').click()
    await page.getByTestId('member-management-create-user-toggle').click()
    await page.getByTestId('member-management-create-submit').click()

    await expect(page.getByText('Enter the user’s name.', { exact: true })).toBeVisible()
    await expect(page.getByText('Enter an email address.', { exact: true })).toBeVisible()
    await expect(page.getByText('Use at least 8 characters.', { exact: true })).toBeVisible()

    await page.getByTestId('member-management-create-name-input').fill(name)
    await page.getByTestId('member-management-create-email-input').fill(email)
    await page.getByTestId('member-management-create-password-input').fill(password)
    await page.route('**/api/users', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected member creation failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByTestId('member-management-create-submit').click()
    await expect(page.getByTestId('member-create-error')).toContainText('Injected member creation failure')
    await expect(page.getByTestId('member-management-create-name-input')).toHaveValue(name)
    await expect(page.getByTestId('member-management-create-email-input')).toHaveValue(email)
    await expect(page.getByTestId('member-management-create-password-input')).toHaveValue(password)
  })
})
