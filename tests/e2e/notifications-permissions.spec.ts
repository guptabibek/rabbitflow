import { request } from '@playwright/test'
import { test, expect } from './fixtures/app.fixture'
import { AUTH_STATES, E2E_BASE_URL, E2E_PREFIX, makeNotificationTitle, makeProjectName } from './support/env'
import {
  openDashboard,
  openNotificationPanel,
  openSidebarView,
  selectProjectFromDashboard,
} from './support/ui'

test.describe('Notifications And Permissions', () => {
  test.describe.configure({ mode: 'parallel' })

  test('notifications show empty state, appear after a trigger, and persist read status', async ({ browser, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('notifications') })
    await seed.addProjectMember({ projectId: project.id, email: accounts.member.email, role: 'Dev' })

    const memberContext = await browser.newContext({ storageState: AUTH_STATES.member })
    const memberPage = await memberContext.newPage()
    const notificationTitle = makeNotificationTitle('member assignment')

    try {
      await openDashboard(memberPage)
      await memberPage.getByTestId('dashboard-project-search-input').fill(project.name)
      await selectProjectFromDashboard(memberPage, project.name)
      await openNotificationPanel(memberPage)

      await expect(memberPage.getByTestId('notification-empty-state')).toBeVisible()

      await seed.createNotificationFixture({
        email: accounts.member.email,
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
          const notification = await seed.getNotificationByTitle(accounts.member.email, notificationTitle)
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