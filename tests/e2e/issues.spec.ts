import { test, expect } from './fixtures/app.fixture'
import {
  AUTH_STATES,
  E2E_PREFIX,
  E2E_TEST_PASSWORD,
  makeIssueTitle,
  makeProjectName,
  makeSignupEmail,
} from './support/env'
import {
  closeEmbeddedWorkItem,
  createWorkItem,
  expectToast,
  fillRequiredScope,
  openDashboard,
  openSidebarView,
  openWorkItemFromList,
  selectProjectFromDashboard,
  selectRadixOption,
  selectWorkItemCheckboxByTitle,
  selectWorkItemType,
  visibleWorkItemRow,
  login,
} from './support/ui'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Work Item Flows', () => {
  test.describe.configure({ mode: 'parallel' })

  test('user story state picker exposes every legal edge and no invalid transitions', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('story-workflow') })
    const workflow = await seed.getTypeWorkflow(project.id, 'story')
    const browserErrors: string[] = []
    const serverFailures: string[] = []

    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('response', (response) => {
      if (response.status() >= 500) {
        serverFailures.push(`${response.status()} ${response.request().method()} ${response.url()}`)
      }
    })

    const issuesByState = new Map<string, Awaited<ReturnType<typeof seed.createIssueFixture>>>()
    for (const mapping of workflow.stateMappings) {
      const category = mapping.state.category.trim().toLowerCase()
      const status = category === 'completed' ? 'done' : category === 'in progress' ? 'in_progress' : 'backlog'
      const issue = await seed.createIssueFixture({
        projectId: project.id,
        title: makeIssueTitle(`story-${mapping.order}`),
        workItemType: 'story',
        status,
        stateId: mapping.stateId,
      })
      issuesByState.set(mapping.stateId, issue)
    }

    for (const mapping of workflow.stateMappings) {
      const issue = issuesByState.get(mapping.stateId)!
      const outgoingIds = workflow.stateTransitions
        .filter((transition) => transition.fromStateId === mapping.stateId)
        .map((transition) => transition.toStateId)
      const expectedIds = new Set([mapping.stateId, ...outgoingIds])
      const expectedNames = workflow.stateMappings
        .filter((candidate) => expectedIds.has(candidate.stateId))
        .map((candidate) => candidate.state.name)

      await page.goto(`/work-items/${issue.id}`)
      const stateTrigger = page.getByTestId('work-item-state-trigger')
      await expect(stateTrigger).toBeVisible()
      await stateTrigger.click()

      await expect(page.getByRole('option')).toHaveCount(expectedNames.length)
      expect(await page.getByRole('option').allTextContents()).toEqual(expectedNames)
      await page.keyboard.press('Escape')
    }

    const initial = workflow.stateMappings.find((mapping) => mapping.isInitial) ?? workflow.stateMappings[0]
    const initialIssue = issuesByState.get(initial.stateId)!
    const unreachable = workflow.stateMappings.find(
      (mapping) =>
        mapping.stateId !== initial.stateId &&
        !workflow.stateTransitions.some(
          (transition) =>
            transition.fromStateId === initial.stateId && transition.toStateId === mapping.stateId
        )
    )
    expect(unreachable).toBeTruthy()

    const invalidResponse = await page.request.put(`/api/issues/${initialIssue.id}`, {
      data: { stateId: unreachable!.stateId, version: initialIssue.version },
    })
    expect(invalidResponse.status()).toBe(400)
    const invalidPayload = await invalidResponse.json()
    expect(invalidPayload.error).toBe('Invalid workflow transition')
    expect(invalidPayload.details.userMessage).toMatch(/choose one of the available State options/i)

    const next = workflow.stateTransitions.find(
      (transition) =>
        transition.fromStateId === initial.stateId && transition.toStateId !== initial.stateId
    )
    expect(next).toBeTruthy()
    const nextState = workflow.stateMappings.find((mapping) => mapping.stateId === next!.toStateId)!.state

    await page.goto(`/work-items/${initialIssue.id}`)
    await selectRadixOption(page, 'work-item-state-trigger', nextState.name)
    const saveResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/issues/${initialIssue.id}`) &&
        response.request().method() === 'PUT'
    )
    await page.getByTestId('work-item-save-button').click()
    expect((await saveResponsePromise).status()).toBe(200)
    await expectToast(page, /work item saved/i)

    const updated = await seed.findIssueByTitle(project.id, initialIssue.title)
    expect(updated?.stateId).toBe(nextState.id)
    expect(browserErrors).toEqual([])
    expect(serverFailures).toEqual([])
  })

  test('state controls match transition permissions for every project role', async ({ browser, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('workflow-roles') })
    const workflow = await seed.getTypeWorkflow(project.id, 'story')
    const initial = workflow.stateMappings.find((mapping) => mapping.isInitial) ?? workflow.stateMappings[0]
    const roleCases = [
      ['PM', true],
      ['Dev', true],
      ['QA', true],
      ['DevOps', false],
      ['Viewer', false],
    ] as const

    for (const [role, canTransition] of roleCases) {
      const email = makeSignupEmail(`workflow-${role}`)
      await seed.ensureUserAccount({ email, name: `E2E ${role}` })
      await seed.addProjectMember({ projectId: project.id, email, role })
      const issue = await seed.createIssueFixture({
        projectId: project.id,
        title: makeIssueTitle(`workflow-${role}`),
        workItemType: 'story',
        status: 'backlog',
        stateId: initial.stateId,
      })
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const rolePage = await context.newPage()

      try {
        await login(rolePage, email, E2E_TEST_PASSWORD)
        await rolePage.goto(`/work-items/${issue.id}`)
        const stateTrigger = rolePage.getByTestId('work-item-state-trigger')
        await expect(stateTrigger).toBeVisible()
        if (canTransition) {
          await expect(stateTrigger).toBeEnabled()
        } else {
          await expect(stateTrigger).toBeDisabled()
        }
      } finally {
        await context.close()
      }
    }
  })

  test('issues support create, search, assign, bulk operations, status updates, and delete', async ({ page, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('issue-lifecycle') })
    await seed.addProjectMember({ projectId: project.id, email: accounts.member.email, role: 'Dev' })

    const alphaTitle = makeIssueTitle('alpha')
    const betaTitle = makeIssueTitle('beta')
    const gammaTitle = makeIssueTitle('gamma')
    const memberUser = await seed.getUserByEmail(accounts.member.email)

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

    // A state one legal hop away. Jumping straight to Done is rejected by the
    // workflow, which is correct — but it is not what this test is checking.
    const alphaBeforeUpdate = await seed.findIssueByTitle(project.id, alphaTitle)
    const nextState = await seed.getAllowedNextState(alphaBeforeUpdate!.id)
    expect(nextState).not.toBeNull()

    await openWorkItemFromList(page, alphaTitle)
    await selectRadixOption(page, 'work-item-assignee-trigger', accounts.member.name)
    await selectRadixOption(page, 'work-item-state-trigger', nextState!.name)

    const updateResponsePromise = page.waitForResponse(
      (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'PUT'
    )

    await page.getByTestId('work-item-save-button').click()
    const updateResponse = await updateResponsePromise

    expect(updateResponse.ok()).toBeTruthy()

    const alphaIssue = await seed.findIssueByTitle(project.id, alphaTitle)
    expect(alphaIssue?.assignee?.id).toBe(memberUser?.id)
    expect(alphaIssue?.stateRecord?.name).toBe(nextState?.name)

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

    /*
      Accept the confirm() from a listener, not from an awaited promise.

      Attaching any 'dialog' listener turns off Playwright's auto-dismiss, so
      the native dialog stays on screen until something accepts it — and while
      it is up, the click that opened it cannot settle. Awaiting the click
      before awaiting the dialog therefore deadlocks: the click times out, then
      the dialog and the DELETE both time out behind it.
    */
    page.once('dialog', (dialog) => void dialog.accept())

    const deleteResponsePromise = page.waitForResponse(
      (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'DELETE'
    )

    await page.getByTestId('work-item-more-options-button').click()
    await page.getByTestId('work-item-delete-button').click()

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
    // Required fields are checked before the date rule, so leaving Scope empty
    // would fail on Scope and never exercise what this test is about.
    await fillRequiredScope(page)
    // Dates live on the Planning tab, not alongside the title.
    await page.getByTestId('create-work-item-tab-metadata').click()
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
    // Task plus Scope, so nothing is missing. Otherwise the first click is
    // spent on a required-field warning and the duplicate-submit guard — the
    // thing under test — is never reached.
    await selectWorkItemType(page, 'task')
    await page.getByTestId('create-work-item-title-input').fill(delayedTitle)
    await page.getByTestId('create-work-item-description-input').fill(`${E2E_PREFIX}: delayed submission`)
    await fillRequiredScope(page)

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
