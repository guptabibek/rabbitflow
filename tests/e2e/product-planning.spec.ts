import { expect, test } from './fixtures/app.fixture'
import { AUTH_STATES, makeIssueTitle, makeProjectName } from './support/env'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Product planning decisions', () => {
  test('mobile board uses one status column with touch-sized controls and accessible moves', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('mobile-board') })
    const todo = await seed.createIssueFixture({ projectId: project.id, status: 'todo', title: makeIssueTitle('mobile-todo') })
    const active = await seed.createIssueFixture({ projectId: project.id, status: 'in_progress', title: makeIssueTitle('mobile-active') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/projects/${project.id}/board`)

    const mobileBoard = page.getByTestId('mobile-board')
    await expect(mobileBoard).toBeVisible()
    await expect(page.getByRole('region', { name: 'Kanban board', exact: true })).toBeHidden()
    await mobileBoard.getByLabel('Board status').selectOption('todo')
    await expect(mobileBoard.getByText(todo.title, { exact: true })).toBeVisible()
    await expect(mobileBoard.getByText(active.title, { exact: true })).toHaveCount(0)

    const statusControl = mobileBoard.getByLabel('Board status')
    const moveControl = mobileBoard.getByRole('button', { name: `Move ${todo.key} to another column` })
    expect((await statusControl.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    expect((await moveControl.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('roadmap previews dependency and objective impact before saving dates', async ({ page, seed }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const project = await seed.createProjectFixture({ name: makeProjectName('roadmap-scenario') })
    const blocker = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('scenario-blocker'),
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      dueDate: new Date('2026-10-04T00:00:00.000Z'),
    })
    const item = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('scenario-item'),
      startDate: new Date('2026-10-05T00:00:00.000Z'),
      dueDate: new Date('2026-10-07T00:00:00.000Z'),
    })
    await seed.createIssueRelationFixture(item.id, blocker.id)
    const objective = await seed.createObjectiveFixture({ projectId: project.id, issueId: item.id })

    await page.goto(`/projects/${project.id}/roadmap`)
    await page.getByRole('button', { name: `Move ${item.key} one day later` }).click()
    const proposal = page.getByTestId('roadmap-proposal')
    await expect(proposal).toContainText(blocker.key)
    await expect(proposal).toContainText(objective.title)
    expect((await seed.getIssueFixture(item.id))?.startDate?.toISOString()).toBe('2026-10-05T00:00:00.000Z')

    await page.getByRole('button', { name: 'Apply dates' }).click()
    await expect(page.getByTestId('roadmap-proposal')).toHaveCount(0)
    await expect.poll(async () => (await seed.getIssueFixture(item.id))?.startDate?.toISOString()).toBe('2026-10-06T00:00:00.000Z')
  })

  test('portfolio metrics reconcile to drill-down work and objective traceability', async ({ page, seed }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const project = await seed.createProjectFixture({ name: makeProjectName('portfolio-drill') })
    const due = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('portfolio-due'),
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    })
    const objective = await seed.createObjectiveFixture({ projectId: project.id, issueId: due.id, currentValue: 40 })

    await page.goto(`/projects/${project.id}/portfolio`)
    await page.getByTestId(`portfolio-project-${project.id}-dueSoon`).click()
    await expect(page.getByText('Due in the next 7 days', { exact: true })).toBeVisible()
    await expect(page.getByText(due.title, { exact: true })).toBeVisible()
    await expect(page.getByText(/1 matching work item/)).toBeVisible()

    await page.goto(`/projects/${project.id}/objectives`)
    const objectiveCard = page.getByTestId(`objective-card-${objective.id}`)
    await expect(objectiveCard).toContainText('Mean progress across 1 key result')
    await expect(objectiveCard).toContainText('1 linked work item')
    await expect(objectiveCard).toContainText(due.key)
  })
})
