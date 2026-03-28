import { test, expect } from './fixtures/app.fixture'
import { AUTH_STATES, E2E_PREFIX, makeIssueTitle, makeProjectName } from './support/env'
import {
  closeEmbeddedWorkItem,
  createWorkItem,
  expectToast,
  openDashboard,
  openSidebarView,
  openWorkItemFromList,
  selectProjectFromDashboard,
  selectRadixOption,
  selectWorkItemCheckboxByTitle,
  visibleWorkItemRow,
} from './support/ui'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Work Item Flows', () => {
  test.describe.configure({ mode: 'parallel' })

  test('issues support create, search, assign, bulk operations, status updates, and delete', async ({ page, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('issue-lifecycle') })
    await seed.addProjectMember({ projectId: project.id, email: accounts.member.email, role: 'Dev' })

    const alphaTitle = makeIssueTitle('alpha')
    const betaTitle = makeIssueTitle('beta')
    const gammaTitle = makeIssueTitle('gamma')
    const memberUser = await seed.getUserByEmail(accounts.member.email)
    const doneState = await seed.getDoneState(project.id)

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)
    await openSidebarView(page, 'list')

    expect((await createWorkItem(page, alphaTitle, `${E2E_PREFIX}: alpha description`)).status()).toBe(201)
    expect((await createWorkItem(page, betaTitle, `${E2E_PREFIX}: beta description`)).status()).toBe(201)
    expect((await createWorkItem(page, gammaTitle, `${E2E_PREFIX}: gamma description`)).status()).toBe(201)

    expect(await seed.findIssueByTitle(project.id, alphaTitle)).not.toBeNull()
    expect(await seed.findIssueByTitle(project.id, betaTitle)).not.toBeNull()
    expect(await seed.findIssueByTitle(project.id, gammaTitle)).not.toBeNull()

    await page.getByTestId('work-items-search-input').fill(alphaTitle)
    await expect(visibleWorkItemRow(page, alphaTitle)).toBeVisible()
    await expect(visibleWorkItemRow(page, betaTitle)).toHaveCount(0)
    await page.getByTestId('work-items-search-input').fill('')

    await openWorkItemFromList(page, alphaTitle)
    await selectRadixOption(page, 'work-item-assignee-trigger', accounts.member.name)
    await selectRadixOption(page, 'work-item-state-trigger', doneState!.name)

    const updateResponsePromise = page.waitForResponse(
      (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'PUT'
    )

    await page.getByTestId('work-item-save-button').click()
    const updateResponse = await updateResponsePromise

    expect(updateResponse.ok()).toBeTruthy()

    const alphaIssue = await seed.findIssueByTitle(project.id, alphaTitle)
    expect(alphaIssue?.assignee?.id).toBe(memberUser?.id)
    expect(alphaIssue?.stateRecord?.name).toBe(doneState?.name)

    await closeEmbeddedWorkItem(page)

    await selectWorkItemCheckboxByTitle(page, betaTitle)
    await selectWorkItemCheckboxByTitle(page, gammaTitle)
    await page.getByTestId('bulk-assign-trigger').click()

    const bulkAssignResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/issues/bulk') && response.request().method() === 'POST'
    )

    await page.getByTestId(`bulk-assign-user-${memberUser!.id}`).click()
    const bulkAssignResponse = await bulkAssignResponsePromise
    const bulkAssignPayload = await bulkAssignResponse.json()

    expect(bulkAssignResponse.ok()).toBeTruthy()
    expect(bulkAssignPayload.action).toBe('updated')
    expect((await seed.findIssueByTitle(project.id, betaTitle))?.assignee?.id).toBe(memberUser?.id)
    expect((await seed.findIssueByTitle(project.id, gammaTitle))?.assignee?.id).toBe(memberUser?.id)

    await selectWorkItemCheckboxByTitle(page, betaTitle)
    await selectWorkItemCheckboxByTitle(page, gammaTitle)

    const bulkDeleteResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/issues/bulk') && response.request().method() === 'POST'
    )

    await page.getByTestId('bulk-delete-button').click()
    const bulkDeleteResponse = await bulkDeleteResponsePromise

    expect(bulkDeleteResponse.ok()).toBeTruthy()
    expect(await seed.findIssueByTitle(project.id, betaTitle)).toBeNull()
    expect(await seed.findIssueByTitle(project.id, gammaTitle)).toBeNull()

    await openWorkItemFromList(page, alphaTitle)

    const dialogPromise = page.waitForEvent('dialog')
    const deleteResponsePromise = page.waitForResponse(
      (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'DELETE'
    )

    await page.getByTestId('work-item-more-options-button').click()
    await page.getByTestId('work-item-delete-button').click()

    const dialog = await dialogPromise
    await dialog.accept()

    const deleteResponse = await deleteResponsePromise
    expect(deleteResponse.ok()).toBeTruthy()
    expect(await seed.findIssueByTitle(project.id, alphaTitle)).toBeNull()
  })

  test('issue creation validates invalid dates, prevents duplicate submits, and surfaces save failures', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('issue-validation') })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)
    await openSidebarView(page, 'list')

    const invalidTitle = makeIssueTitle('invalid-dates')
    await page.getByTestId('work-items-new-button').click()
    await page.getByTestId('create-work-item-title-input').fill(invalidTitle)
    await page.getByTestId('create-work-item-start-date-input').fill('2026-04-10')
    await page.getByTestId('create-work-item-due-date-input').fill('2026-04-01')
    await page.getByTestId('create-work-item-submit-button').click()

    await expectToast(page, /due date cannot be earlier than start date/i)
    expect(await seed.findIssueByTitle(project.id, invalidTitle)).toBeNull()

    await page.getByTestId('create-work-item-cancel-button').click()

    const delayedTitle = makeIssueTitle('delayed-submit')
    let createRequestCount = 0

    await page.route('**/api/issues', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }

      createRequestCount += 1
      await new Promise((resolve) => setTimeout(resolve, 700))
      await route.continue()
    })

    await page.getByTestId('work-items-new-button').click()
    await page.getByTestId('create-work-item-title-input').fill(delayedTitle)
    await page.getByTestId('create-work-item-description-input').fill(`${E2E_PREFIX}: delayed submission`) 

    const createResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/issues') && response.request().method() === 'POST'
    )

    await Promise.allSettled([
      page.getByTestId('create-work-item-submit-button').click(),
      page.getByTestId('create-work-item-submit-button').click(),
    ])

    await expect(page.getByTestId('create-work-item-submit-button')).toBeDisabled()

    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    expect(createRequestCount).toBe(1)
    expect(await seed.findIssueByTitle(project.id, delayedTitle)).not.toBeNull()

    await page.unroute('**/api/issues')

    await openWorkItemFromList(page, delayedTitle)
    await page.getByTestId('work-item-title-input').fill(`${delayedTitle} edited`)

    await page.route('**/api/issues/*', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Injected work item save failure' }),
      })
    })

    await page.getByTestId('work-item-save-button').click()
    await expectToast(page, /injected work item save failure/i)

    const unchangedIssue = await seed.findIssueByTitle(project.id, delayedTitle)
    expect(unchangedIssue?.title).toBe(delayedTitle)
  })

  test('multi-tab edits reject stale work item updates with a conflict', async ({ browser, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('multitab') })
    const issue = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('multitab'),
      description: `${E2E_PREFIX}: original multitab description`,
    })

    const adminContext = await browser.newContext({ storageState: AUTH_STATES.admin })
    const firstTab = await adminContext.newPage()
    const secondTab = await adminContext.newPage()

    try {
      await Promise.all([
        firstTab.goto(`/work-items/${issue.id}`),
        secondTab.goto(`/work-items/${issue.id}`),
      ])

      await expect(firstTab.getByTestId('work-item-title-input')).toBeVisible()
      await expect(secondTab.getByTestId('work-item-title-input')).toBeVisible()

      const winningTitle = `${issue.title} updated`
      await firstTab.getByTestId('work-item-title-input').fill(winningTitle)

      const firstSaveResponsePromise = firstTab.waitForResponse(
        (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'PUT'
      )

      await firstTab.getByTestId('work-item-save-button').click()
      const firstSaveResponse = await firstSaveResponsePromise
      expect(firstSaveResponse.ok()).toBeTruthy()

      await secondTab.getByTestId('work-item-description-input').fill(`${E2E_PREFIX}: stale description update`)

      const secondSaveResponsePromise = secondTab.waitForResponse(
        (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'PUT'
      )

      await secondTab.getByTestId('work-item-save-button').click()
      const secondSaveResponse = await secondSaveResponsePromise

      expect(secondSaveResponse.status()).toBe(409)
      await expectToast(secondTab, /modified by another user/i)

      const finalIssue = await seed.findIssueByTitle(project.id, winningTitle)
      expect(finalIssue?.title).toBe(winningTitle)
      expect(finalIssue?.description).toBe(`${E2E_PREFIX}: original multitab description`)
    } finally {
      await adminContext.close()
    }
  })
})