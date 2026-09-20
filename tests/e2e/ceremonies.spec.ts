import { expect, test } from './fixtures/app.fixture'
import { AUTH_STATES, makeIssueTitle, makeProjectName } from './support/env'
import { fillRequiredScope } from './support/ui'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Sprint ceremonies', () => {
  test('daily risks, review outcomes, and retrospective follow-ups stay connected', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('ceremonies') })
    const sprint = await seed.createSprintFixture(project.id, null, {
      status: 'Active',
      goal: 'Ship the verified onboarding outcome',
      startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    })
    const blocker = await seed.createIssueFixture({
      projectId: project.id,
      iterationId: sprint.id,
      status: 'in_progress',
      title: makeIssueTitle('daily-blocker'),
      assigneeEmail: 'e2e-admin@rabbitflow.local',
    })
    const blocked = await seed.createIssueFixture({
      projectId: project.id,
      iterationId: sprint.id,
      status: 'in_progress',
      title: makeIssueTitle('daily-blocked'),
      assigneeEmail: 'e2e-admin@rabbitflow.local',
    })
    await seed.createIssueRelationFixture(blocked.id, blocker.id)
    const stale = await seed.createIssueFixture({
      projectId: project.id,
      iterationId: sprint.id,
      status: 'todo',
      title: makeIssueTitle('daily-stale'),
    })
    await seed.ageIssueFixture(stale.id, 5)
    const completed = await seed.createIssueFixture({
      projectId: project.id,
      iterationId: sprint.id,
      status: 'todo',
      storyPoints: 5,
      title: makeIssueTitle('review-outcome'),
      assigneeEmail: 'e2e-admin@rabbitflow.local',
    })
    await seed.completeIssue(completed.id)

    const actionText = makeIssueTitle('retro-follow-up')
    const retrospective = await seed.createRetrospectiveFixture({
      projectId: project.id,
      iterationId: sprint.id,
      title: makeProjectName('ceremony-retro'),
      actionItem: actionText,
    })
    const actionItem = retrospective.items[0]

    await page.goto(`/projects/${project.id}/sprints?sprintId=${sprint.id}&sprintTab=daily`)
    await expect(page.getByTestId('sprint-daily-view')).toBeVisible()
    await expect(page.getByTestId(`daily-focus-${blocked.id}`)).toContainText(`Blocked by ${blocker.key}`)
    await expect(page.getByTestId(`daily-focus-${stale.id}`)).toContainText('5d stale')

    await page.getByRole('tab', { name: 'Review', exact: true }).click()
    await expect(page).toHaveURL(/sprintTab=review/)
    await expect(page.getByTestId('sprint-review-view')).toContainText('Ship the verified onboarding outcome')
    await expect(page.getByTestId(`review-outcome-${completed.id}`)).toContainText('5 SP')

    await page.goto(`/projects/${project.id}/retrospectives`)
    await page.getByText(retrospective.title, { exact: true }).click()
    await expect(page.getByText(actionText, { exact: true })).toBeVisible()
    await page.getByTestId(`retro-action-create-work-item-${actionItem.id}`).click()

    await expect(page.getByTestId('create-work-item-title-input')).toHaveValue(actionText)
    await page.getByTestId('create-work-item-tab-metadata').click()
    await expect(page.getByTestId('create-work-item-assignee-trigger')).toContainText('E2E Admin')
    await fillRequiredScope(page)
    await page.getByTestId('create-work-item-submit-button').click()

    await expect.poll(async () => {
      const persisted = await seed.getRetroActionItem(actionItem.id)
      return {
        linked: Boolean(persisted?.actionItemIssueId),
        assignee: persisted?.actionItemIssue?.assignee?.email ?? null,
      }
    }).toEqual({ linked: true, assignee: 'e2e-admin@rabbitflow.local' })

    await page.getByText(retrospective.title, { exact: true }).click()
    await expect(page.getByTestId(`retro-action-work-item-${actionItem.id}`)).toBeVisible()
  })
})
