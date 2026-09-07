import { test, expect } from './fixtures/app.fixture'
import { AUTH_STATES, makeNotificationTitle, makeProjectName } from './support/env'
import {
  openDashboard,
  openNotificationPanel,
  selectProjectFromDashboard,
} from './support/ui'

test.describe('Chaos Resilience', () => {
  test.describe.configure({ mode: 'parallel' })

  test.use({ storageState: AUTH_STATES.admin })

  test('workspace initialization fails closed with retry instead of forcing a false logout', async ({ page }) => {
    let failProjects = true

    await page.route('**/api/projects', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }

      if (failProjects) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected project list failure' }),
        })
        return
      }

      await route.continue()
    })

    await page.goto('/')
    await expect(page).not.toHaveURL(/\/login$/)
    await expect(page.getByTestId('home-init-error')).toContainText('Injected project list failure')

    failProjects = false
    await page.getByTestId('home-init-retry-button').click()
    await expect(page.getByTestId('home-init-error')).toHaveCount(0)
    await expect(page).toHaveURL(/\/$/)

    await page.unroute('**/api/projects')
  })

  test('bootstrap falls back to degraded mode on API failures and malformed payloads, then recovers on retry', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('chaos-bootstrap') })
    let failBootstrap = true
    let corruptTeams = true

    await page.route('**/api/projects/bootstrap?*', async (route) => {
      if (failBootstrap) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected bootstrap outage' }),
        })
        return
      }

      await route.continue()
    })

    await page.route('**/api/teams?*', async (route) => {
      if (corruptTeams) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"broken":',
        })
        return
      }

      await route.continue()
    })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)

    await expect(page.getByTestId('home-project-data-error')).toContainText('Showing the latest successful slices')
    // The switcher, not a bare text match: the project name now appears in the
    // sidebar, the breadcrumb and the switcher, so `getByText` is ambiguous.
    await expect(page.getByTestId('workspace-project-switcher')).toContainText(project.name)

    failBootstrap = false
    corruptTeams = false
    await page.getByTestId('home-project-data-retry-button').click()
    await expect(page.getByTestId('home-project-data-error')).toHaveCount(0)

    await page.unroute('**/api/projects/bootstrap?*')
    await page.unroute('**/api/teams?*')
  })

  test('notifications survive partial API failure, offline mode, and recover with explicit retry', async ({ browser, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('chaos-notifications') })
    await seed.addProjectMember({ projectId: project.id, email: accounts.member.email, role: 'Dev' })
    const title = makeNotificationTitle('chaos notification')
    await seed.createNotificationFixture({
      email: accounts.member.email,
      projectId: project.id,
      title,
      body: 'Chaos notification body',
    })

    const context = await browser.newContext({ storageState: AUTH_STATES.member })
    const page = await context.newPage()
    let failUnreadCount = true

    await page.route('**/api/notifications?countOnly=true', async (route) => {
      if (failUnreadCount) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected unread count failure' }),
        })
        return
      }

      await route.continue()
    })

    try {
      await openDashboard(page)
      await page.getByTestId('dashboard-project-search-input').fill(project.name)
      await selectProjectFromDashboard(page, project.name)
      await openNotificationPanel(page)

      await expect(page.getByText(title)).toBeVisible()
      await expect(page.getByTestId('notification-load-error')).toContainText('Injected unread count failure')

      await context.setOffline(true)
      await page.getByTestId('notification-retry-button').click()
      await expect(page.getByTestId('notification-load-error')).toContainText('offline')

      failUnreadCount = false
      await context.setOffline(false)

      /*
        Coming back online fires the bell's own `online` handler, which clears
        the error and refetches. That regularly beats the click below, taking
        the retry button out of the DOM before it can be pressed. Click it only
        if it is still there — what matters is that the panel recovers, not
        which of the two paths got there first.
      */
      const retryButton = page.getByTestId('notification-retry-button')
      if (await retryButton.isVisible().catch(() => false)) {
        await retryButton.click()
      }

      await expect(page.getByTestId('notification-load-error')).toHaveCount(0)
      await expect(page.getByText(title)).toBeVisible()
    } finally {
      await page.unroute('**/api/notifications?countOnly=true')
      await context.close()
    }
  })
})