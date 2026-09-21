import { request } from '@playwright/test'
import { test, expect } from './fixtures/app.fixture'
import {
  AUTH_STATES,
  E2E_BASE_URL,
  E2E_PREFIX,
  E2E_TEST_PASSWORD,
  makeNotificationTitle,
  makeProjectName,
  makeSignupEmail,
} from './support/env'
import {
  login,
  openDashboard,
  openNotificationPanel,
  openSidebarView,
  selectProjectFromDashboard,
} from './support/ui'

test.describe('Notifications And Permissions', () => {
  test.describe.configure({ mode: 'parallel' })

  test('notifications show empty state, appear after a trigger, and persist read status', async ({ browser, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('notifications') })

    /*
      A user of this test's own, not the shared member account.

      This is the one test that asserts an *empty* bell, and other specs seed
      notifications into the shared member while this one runs. Clearing that
      account instead would just move the race — it would delete the
      notification the chaos spec is asserting on. An account nobody else
      touches makes the assertion true by construction.
    */
    const ownerEmail = makeSignupEmail('notifications-owner')
    await seed.ensureUserAccount({ email: ownerEmail, name: 'E2E Notifications Owner' })
    await seed.addProjectMember({ projectId: project.id, email: ownerEmail, role: 'Dev' })

    const memberContext = await browser.newContext()
    const memberPage = await memberContext.newPage()
    await login(memberPage, ownerEmail, E2E_TEST_PASSWORD)
    const notificationTitle = makeNotificationTitle('member assignment')

    try {
      await openDashboard(memberPage)
      await memberPage.getByTestId('dashboard-project-search-input').fill(project.name)
      await selectProjectFromDashboard(memberPage, project.name)
      await openNotificationPanel(memberPage)

      await expect(memberPage.getByTestId('notification-empty-state')).toBeVisible()

      await seed.createNotificationFixture({
        email: ownerEmail,
        projectId: project.id,
        title: notificationTitle,
        body: `${E2E_PREFIX}: notification body`,
      })

      await memberPage.getByTestId('notification-bell-button').click()
      await memberPage.getByTestId('notification-bell-button').click()
      await expect(memberPage.getByTestId('notification-panel')).toBeVisible()
      await expect(memberPage.getByText(notificationTitle)).toBeVisible()
      await expect(memberPage.getByTestId('notification-unread-count')).toBeVisible()

      await memberPage.getByText(notificationTitle).click()

      await expect
        .poll(async () => {
          const notification = await seed.getNotificationByTitle(ownerEmail, notificationTitle)
          return notification?.isRead ?? false
        })
        .toBe(true)
    } finally {
      await memberContext.close()
    }
  })

  test('viewer users are blocked from admin surfaces and unauthorized project writes', async ({ browser, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('permissions') })
    await seed.addProjectMember({ projectId: project.id, email: accounts.viewer.email, role: 'Viewer' })

    const viewerContext = await browser.newContext({ storageState: AUTH_STATES.viewer })
    const viewerPage = await viewerContext.newPage()

    try {
      await openDashboard(viewerPage)
      await viewerPage.getByTestId('dashboard-project-search-input').fill(project.name)
      await selectProjectFromDashboard(viewerPage, project.name)
      await openSidebarView(viewerPage, 'list')

      await expect(viewerPage.getByTestId('work-items-new-button')).toHaveCount(0)

      await viewerPage.getByTestId('sidebar-settings-toggle').click()
      await expect(viewerPage.getByTestId('sidebar-members-button')).toHaveCount(0)

      await viewerPage.goto('/admin')
      await expect(viewerPage).toHaveURL(/\/dashboard$/)

      const api = await request.newContext({
        baseURL: E2E_BASE_URL,
        storageState: AUTH_STATES.viewer,
      })

      try {
        const response = await api.post('/api/issues', {
          data: {
            projectId: project.id,
            title: `${E2E_PREFIX}: unauthorized create`,
            workItemType: 'task',
          },
        })

        expect(response.status()).toBe(403)
      } finally {
        await api.dispose()
      }
    } finally {
      await viewerContext.close()
    }
  })
})