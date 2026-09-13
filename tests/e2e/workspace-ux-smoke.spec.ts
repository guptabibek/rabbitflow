import { test, expect } from './fixtures/app.fixture'
import { AUTH_STATES, makeProjectName } from './support/env'
import { openDashboard, selectProjectFromDashboard } from './support/ui'

test.use({ storageState: AUTH_STATES.admin })

const primaryViews = [
  ['dashboard', 'Overview'],
  ['backlog', 'Backlog'],
  ['board', 'Board'],
  ['list', 'Work items'],
  ['sprints', 'Sprints'],
  ['roadmap', 'Roadmap'],
  ['calendar', 'Calendar'],
  ['portfolio', 'Portfolio'],
  ['dependency-graph', 'Dependencies'],
  ['objectives', 'Goals'],
  ['approvals', 'Approvals'],
  ['activity', 'Activity'],
  ['reports', 'Reports'],
  ['documents', 'Documents'],
  ['retrospectives', 'Retros'],
] as const

const settingsViews = [
  ['teams', 'Teams'],
  ['webhooks', 'Webhooks'],
  ['automations', 'Automations'],
  ['imports', 'Import'],
  ['recurring-tasks', 'Recurring tasks'],
  ['test-plans', 'Test plans'],
  ['sla', 'SLA policies'],
  ['api-tokens', 'API tokens'],
  ['branding', 'Branding'],
  ['acl', 'ACL rules'],
  ['onboarding-config', 'Onboarding'],
] as const

test.describe('Workspace UX smoke coverage', () => {
  test('every admin workspace destination loads without a crash or server failure', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('workspace-smoke') })
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    const serverFailures: string[] = []

    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('response', (response) => {
      if (response.status() >= 500) {
        serverFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`)
      }
    })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    for (const [view, label] of primaryViews) {
      const target = page.getByTestId(`sidebar-nav-${view}`)
      await target.click()
      await expect(target).toHaveAttribute('aria-current', 'page')
      await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(label)
      await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0)
    }

    const settingsToggle = page.getByTestId('sidebar-settings-toggle')
    if ((await settingsToggle.getAttribute('aria-expanded')) !== 'true') {
      await settingsToggle.click()
    }
    await expect(settingsToggle).toHaveAttribute('aria-expanded', 'true')
    for (const [, label] of settingsViews) {
      const target = page
        .getByRole('navigation', { name: 'Project navigation' })
        .getByRole('button', { name: label, exact: true })
      await expect(target).toBeVisible()
      await target.click()
      await expect(target).toHaveAttribute('aria-current', 'page')
      await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(label)
      await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0)
    }

    await page.waitForTimeout(500)
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(serverFailures).toEqual([])
  })

  test('mobile navigation opens, navigates, and dismisses its drawer', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('mobile-navigation') })
    await page.setViewportSize({ width: 390, height: 844 })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)

    await page.getByRole('button', { name: 'Open navigation' }).click()
    const mobileNavigation = page.getByRole('dialog').getByRole('navigation', {
      name: 'Project navigation',
    })
    await expect(mobileNavigation).toBeVisible()
    await mobileNavigation.getByTestId('sidebar-nav-board').click()

    await expect(page).toHaveURL(/\?view=board$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')
    ).toHaveText('Board')
  })

  test('unknown and removed workspace routes fall back to overview', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('invalid-view') })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)
    await page.goto('/?view=settings')

    await expect(page.getByTestId('sidebar-nav-dashboard')).toHaveAttribute('aria-current', 'page')
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')
    ).toHaveText('Overview')
  })
})
