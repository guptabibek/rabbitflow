import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures/app.fixture'
import { AUTH_STATES, makeProjectName } from './support/env'

test.use({ storageState: AUTH_STATES.admin })

test.describe('WCAG regression checks', () => {
  test('critical product views have no critical or serious automated violations', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('accessibility') })
    await seed.createIssueFixture({
      projectId: project.id,
      startDate: new Date(Date.now()),
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })

    for (const view of ['board', 'roadmap', 'calendar', 'portfolio', 'objectives']) {
      await page.goto(`/projects/${project.id}/${view}`)
      await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0)
      const results = await new AxeBuilder({ page }).analyze()
      const blocking = results.violations.filter((violation) =>
        violation.impact === 'critical' || violation.impact === 'serious'
      )
      expect(blocking, `${view}: ${blocking.map((violation) => `${violation.id} (${violation.nodes.length})`).join(', ')}`).toEqual([])
    }
  })

  test('mobile planning views avoid page overflow and unnamed controls', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('mobile-accessibility') })
    await seed.createIssueFixture({ projectId: project.id })
    await page.setViewportSize({ width: 390, height: 844 })

    for (const view of ['board', 'roadmap', 'calendar']) {
      await page.goto(`/projects/${project.id}/${view}`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${view} has horizontal page overflow`).toBe(true)
      const unnamed = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => {
        const element = button as HTMLElement
        const label = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.textContent?.trim() || element.getAttribute('title')
        return !label
      }).length)
      expect(unnamed, `${view} has unnamed visible buttons`).toBe(0)
    }
  })
})
