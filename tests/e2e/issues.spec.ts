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

  test('board move menu exposes only workflow-valid columns and completes a legal move', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('board-workflow') })
    const workflow = await seed.getTypeWorkflow(project.id, 'story')
    const initial = workflow.stateMappings.find((mapping) => mapping.isInitial) ?? workflow.stateMappings[0]
    const issue = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('board-workflow'),
      workItemType: 'story',
      status: 'backlog',
      stateId: initial.stateId,
    })

    const columns = [
      { id: 'backlog', label: 'Backlog', category: 'proposed' },
      { id: 'todo', label: 'To Do', category: 'proposed' },
      { id: 'in_progress', label: 'In Progress', category: 'in progress' },
      { id: 'in_review', label: 'In Review', category: 'in progress' },
      { id: 'done', label: 'Done', category: 'completed' },
    ] as const
    const normalizeCategory = (category: string) => {
      const value = category.trim().toLowerCase()
      if (value === 'done' || value === 'resolved') return 'completed'
      if (value === 'inprogress') return 'in progress'
      if (value === 'new') return 'proposed'
      return value
    }
    const enabledTransitions = workflow.stateTransitions.filter((transition) => transition.isEnabled)
    const expected = columns.filter((column) => {
      const initialCategory = normalizeCategory(initial.state.category)
      const matching = workflow.stateMappings.filter(
        (mapping) => normalizeCategory(mapping.state.category) === column.category
      )
      const target =
        initialCategory === column.category
          ? initial
          : column.id === 'done'
            ? matching.find((mapping) => mapping.state.isFinal) ?? matching[matching.length - 1]
            : matching[0]

      if (!target) return false
      if (target.stateId === initial.stateId || enabledTransitions.length === 0) return true
      return enabledTransitions.some(
        (transition) =>
          transition.fromStateId === initial.stateId && transition.toStateId === target.stateId
      )
    })

    await page.goto(`/projects/${project.id}/board`)
    const moveButton = page.getByRole('button', { name: `Move ${issue.key} to another column` })
    await expect(moveButton).toBeVisible()
    await moveButton.click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const expectedAlternatives = expected.filter((column) => column.id !== issue.status)
    for (const column of expectedAlternatives) {
      await expect(menu.getByRole('menuitem', { name: column.label, exact: true })).toBeVisible()
    }
    for (const column of columns.filter((candidate) => !expected.includes(candidate))) {
      await expect(menu.getByRole('menuitem', { name: column.label, exact: true })).toHaveCount(0)
    }

    const crossCategoryTarget = expectedAlternatives.find(
      (column) => column.category !== normalizeCategory(initial.state.category)
    )
    expect(crossCategoryTarget).toBeTruthy()

    const moveResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/board') && response.request().method() === 'PATCH'
    )
    await menu.getByRole('menuitem', { name: crossCategoryTarget!.label, exact: true }).click()
    const moveResponse = await moveResponsePromise
    expect(moveResponse.status()).toBe(200)

    const updated = await seed.findIssueByTitle(project.id, issue.title)
    expect(updated?.status).toBe(crossCategoryTarget!.id)
    expect(normalizeCategory(updated!.stateRecord!.category)).toBe(crossCategoryTarget!.category)
    await expect(page.getByText('Move not completed.')).toHaveCount(0)
  })

  test('board remembers layout, warns at WIP limits, and identifies blocked work', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('board-layout') })
    const workflow = await seed.getTypeWorkflow(project.id, 'story')
    const initial = workflow.stateMappings.find((mapping) => mapping.isInitial) ?? workflow.stateMappings[0]
    const inProgress = workflow.stateMappings.find((mapping) =>
      mapping.state.category.toLowerCase().replaceAll('_', ' ').includes('progress')
    )
    const completed =
      workflow.stateMappings.find((mapping) => mapping.state.isFinal) ??
      workflow.stateMappings.find((mapping) =>
        ['done', 'completed', 'resolved'].includes(mapping.state.category.toLowerCase())
      )

    expect(inProgress).toBeTruthy()
    expect(completed).toBeTruthy()

    const blocker = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('blocker'),
      workItemType: 'story',
      status: 'todo',
      stateId: initial.stateId,
    })
    const blocked = await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('blocked'),
      workItemType: 'story',
      status: 'in_progress',
      stateId: inProgress!.stateId,
    })
    await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('completed'),
      workItemType: 'story',
      status: 'done',
      stateId: completed!.stateId,
    })

    const relationResponse = await page.request.post('/api/relations', {
      data: {
        sourceIssueId: blocked.id,
        targetIssueId: blocker.id,
        relationType: 'blocked_by',
      },
    })
    expect(relationResponse.status()).toBe(201)

    await page.goto(`/projects/${project.id}/board`)
    await expect(
      page.getByRole('button', { name: new RegExp(`${blocked.key}.*Blocked by ${blocker.key}`) })
    ).toBeVisible()

    await page.getByTestId('board-layout-button').click()
    const inProgressLimit = page.getByLabel('In Progress WIP limit')
    await inProgressLimit.fill('1')
    await page.getByLabel('Hide completed column').click()
    await page.keyboard.press('Escape')

    await expect(page.getByLabel('WIP limit of 1 reached')).toBeVisible()
    await expect(page.getByRole('region', { name: /^Done,/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Collapse In Progress column' }).click()
    await expect(page.getByRole('button', { name: 'Expand In Progress column' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand In Progress column' })).toBeVisible()
    await expect(page.getByRole('region', { name: /^Done,/ })).toHaveCount(0)

    await page.getByTestId('board-layout-button').click()
    await expect(page.getByLabel('Hide completed column')).toBeChecked()
    await expect(page.getByLabel('In Progress WIP limit')).toHaveValue('1')
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
    const bulkDeleteConfirmation = page.getByRole('alertdialog')
    await expect(bulkDeleteConfirmation).toContainText('2 selected work items')
    await bulkDeleteConfirmation.getByRole('button', { name: 'Delete work items' }).click()
    const bulkDeleteResponse = await bulkDeleteResponsePromise

    expect(bulkDeleteResponse.ok()).toBeTruthy()
    expect(await seed.findIssueByTitle(project.id, betaTitle)).toBeNull()
    expect(await seed.findIssueByTitle(project.id, gammaTitle)).toBeNull()

    await openWorkItemFromList(page, alphaTitle)

    await page.getByTestId('work-item-more-options-button').click()
    await page.getByTestId('work-item-delete-button').click()
    const deleteConfirmation = page.getByRole('alertdialog')
    await expect(deleteConfirmation).toContainText(alphaTitle)
    await expect(deleteConfirmation).toContainText('comments')

    // Cancellation is a real branch: it must leave both the item and the
    // current list context intact.
    await deleteConfirmation.getByRole('button', { name: 'Cancel' }).click()
    await expect(deleteConfirmation).toHaveCount(0)
    expect(await seed.findIssueByTitle(project.id, alphaTitle)).not.toBeNull()
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/list$`))

    await page.getByTestId('work-item-more-options-button').click()
    await page.getByTestId('work-item-delete-button').click()
    let rejectDelete = true
    await page.route('**/api/issues/*', async (route) => {
      if (route.request().method() === 'DELETE' && rejectDelete) {
        rejectDelete = false
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected delete failure' }),
        })
        return
      }
      await route.continue()
    })

    const retryableConfirmation = page.getByRole('alertdialog')
    await retryableConfirmation.getByRole('button', { name: 'Delete work item' }).click()
    await expectToast(page, 'Injected delete failure')
    await expect(retryableConfirmation).toBeVisible()
    expect(await seed.findIssueByTitle(project.id, alphaTitle)).not.toBeNull()

    const deleteResponsePromise = page.waitForResponse(
      (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'DELETE' && response.ok()
    )
    await retryableConfirmation.getByRole('button', { name: 'Delete work item' }).click()

    const deleteResponse = await deleteResponsePromise
    expect(deleteResponse.ok()).toBeTruthy()
    expect(await seed.findIssueByTitle(project.id, alphaTitle)).toBeNull()
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/list$`))
    await page.unroute('**/api/issues/*')
  })

  test('issue creation validates invalid dates, prevents duplicate submits, and surfaces save failures', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('issue-validation') })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)
    await openSidebarView(page, 'list')

    const invalidTitle = makeIssueTitle('invalid-dates')
    await page.getByTestId('work-items-new-button').click()
    await selectWorkItemType(page, 'task')
    await page.getByTestId('create-work-item-submit-button').click()
    await expect(page.getByTestId('create-work-item-validation-summary')).toContainText('Title is required.')
    await expect(page.getByTestId('create-work-item-validation-summary')).toContainText('Scope is required.')
    await expect(page.getByTestId('create-work-item-title-input')).toBeFocused()
    await expect(page.getByLabel('1 basic field error')).toBeVisible()

    await page.getByTestId('create-work-item-title-input').fill(invalidTitle)
    await page.getByTestId('create-work-item-submit-button').click()
    await expect(page.locator('#work-item-field-scope-error')).toHaveText('Scope is required.')
    await expect(page.getByTestId('work-item-field-scope')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('work-item-field-scope')).toBeFocused()

    await fillRequiredScope(page)
    // Dates live on the Planning tab, not alongside the title.
    await page.getByTestId('create-work-item-tab-metadata').click()
    await page.getByTestId('create-work-item-start-date-input').fill('2026-04-10')
    await page.getByTestId('create-work-item-due-date-input').fill('2026-04-01')
    await page.getByTestId('create-work-item-submit-button').click()

    await expect(page.locator('#create-due-date-error')).toHaveText(/due date cannot be earlier than start date/i)
    await expect(page.getByTestId('create-work-item-due-date-input')).toHaveAttribute('aria-invalid', 'true')
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
    await page.getByTestId('create-work-item-tab-metadata').click()
    await page.getByTestId('create-work-item-state-trigger').click()
    await page.getByRole('option', { name: 'Development in Progress', exact: true }).click()

    const createResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/issues') && response.request().method() === 'POST'
    )

    const submitButton = page.getByTestId('create-work-item-submit-button')
    await submitButton.click()
    await expect(submitButton).toBeDisabled()
    await submitButton.evaluate((button: HTMLButtonElement) => button.click())

    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    expect(createRequestCount).toBe(1)
    const createdIssue = await seed.findIssueByTitle(project.id, delayedTitle)
    expect(createdIssue?.stateRecord?.category).toBe('In Progress')
    expect(createdIssue?.status).toBe('in_progress')

    const contradictoryTitle = makeIssueTitle('state-status-source-of-truth')
    const contradictoryCreate = await page.request.post('/api/issues', {
      data: {
        projectId: project.id,
        title: contradictoryTitle,
        workItemType: 'task',
        stateId: createdIssue?.stateRecord?.id,
        status: 'backlog',
        customFields: { scope: 'In Scope' },
      },
    })
    expect(contradictoryCreate.status()).toBe(201)
    const normalizedIssue = await seed.findIssueByTitle(project.id, contradictoryTitle)
    expect(normalizedIssue?.stateRecord?.category).toBe('In Progress')
    expect(normalizedIssue?.status).toBe('in_progress')

    await page.unroute('**/api/issues')

    const rejectedTitle = makeIssueTitle('rejected-create')
    await page.route('**/api/issues', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected create failure' }),
        })
        return
      }
      await route.continue()
    })

    await page.getByTestId('work-items-new-button').click()
    await selectWorkItemType(page, 'task')
    await page.getByTestId('create-work-item-title-input').fill(rejectedTitle)
    await fillRequiredScope(page)
    await page.getByTestId('create-work-item-submit-button').click()
    await expect(page.getByTestId('create-work-item-submit-error')).toContainText('Injected create failure')
    await expect(page.getByTestId('create-work-item-title-input')).toHaveValue(rejectedTitle)
    expect(await seed.findIssueByTitle(project.id, rejectedTitle)).toBeNull()
    await page.getByTestId('create-work-item-cancel-button').click()
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
    await expect(page.getByTestId('work-item-save-error')).toContainText(/injected work item save failure/i)

    const unchangedIssue = await seed.findIssueByTitle(project.id, delayedTitle)
    expect(unchangedIssue?.title).toBe(delayedTitle)
  })

  test('quick create remembers the project type and reapplies a personal template', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('quick-create') })
    const templateName = `Implementation setup ${Date.now()}`
    const templateDescription = `${E2E_PREFIX}: reusable implementation details`

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)
    await openSidebarView(page, 'list')

    const searchInput = page.getByTestId('work-items-search-input')
    await searchInput.focus()
    await page.keyboard.press('c')
    await expect(searchInput).toHaveValue('c')
    await expect(page.getByTestId('create-work-item-surface')).toHaveCount(0)
    await searchInput.fill('')
    await searchInput.blur()

    await page.keyboard.press('c')
    await expect(page.getByTestId('create-work-item-surface')).toBeVisible()
    await expect(page.getByTestId('create-work-item-title-input')).toBeFocused()

    await selectWorkItemType(page, 'task')
    await page.getByTestId('create-work-item-description-input').fill(templateDescription)
    await page.getByTestId('create-work-item-priority-trigger').click()
    await page.getByRole('option', { name: 'High', exact: true }).click()
    await fillRequiredScope(page)

    await page.getByTestId('create-work-item-save-template-button').click()
    await page.getByTestId('create-work-item-template-name-input').fill(templateName)
    await page.getByTestId('create-work-item-template-confirm-button').click()
    await expectToast(page, `Template “${templateName}” saved`)
    await expect.poll(() => page.evaluate((projectId) => {
      const raw = window.localStorage.getItem('rabbitflow-work-item-creation-preferences')
      if (!raw) return null
      const persisted = JSON.parse(raw) as {
        lastWorkItemTypeByProject?: Record<string, string>
      }
      return persisted.lastWorkItemTypeByProject?.[projectId] ?? null
    }, project.id)).toBe('task')
    await page.getByTestId('create-work-item-cancel-button').click()

    await page.reload()
    await expect(page.getByTestId('work-items-new-button')).toBeVisible()
    await expect.poll(() => page.evaluate((projectId) => {
      const raw = window.localStorage.getItem('rabbitflow-work-item-creation-preferences')
      if (!raw) return null
      const persisted = JSON.parse(raw) as {
        lastWorkItemTypeByProject?: Record<string, string>
      }
      return persisted.lastWorkItemTypeByProject?.[projectId] ?? null
    }, project.id)).toBe('task')
    await page.keyboard.press('c')
    await expect.poll(() => page.evaluate((projectId) => {
      const raw = window.localStorage.getItem('rabbitflow-work-item-creation-preferences')
      if (!raw) return null
      const persisted = JSON.parse(raw) as {
        lastWorkItemTypeByProject?: Record<string, string>
      }
      return persisted.lastWorkItemTypeByProject?.[projectId] ?? null
    }, project.id)).toBe('task')
    await expect(page.getByTestId('create-work-item-type-trigger')).toContainText('Task')
    await expect(page.getByTestId('create-work-item-description-input')).toHaveValue('')

    await page.getByTestId('create-work-item-template-trigger').click()
    await page.getByRole('option', { name: templateName, exact: true }).click()
    await expect(page.getByTestId('create-work-item-description-input')).toHaveValue(templateDescription)
    await expect(page.getByTestId('create-work-item-priority-trigger')).toContainText('High')
    await page.getByTestId('create-work-item-tab-fields').click()
    await expect(page.getByTestId('work-item-field-scope')).toContainText('In Scope')
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
      const conflictAlert = secondTab.getByTestId('work-item-save-error')
      await expect(conflictAlert).toContainText(/modified by another user/i)
      await expect(conflictAlert.getByRole('button', { name: 'Reload latest' })).toBeVisible()
      await expect(conflictAlert.getByRole('button', { name: 'Review my edits' })).toBeVisible()

      await conflictAlert.getByRole('button', { name: 'Review my edits' }).click()
      await expect(conflictAlert).toBeHidden()
      await expect(secondTab.getByTestId('work-item-description-input')).toHaveValue(`${E2E_PREFIX}: stale description update`)

      await secondTab.getByTestId('work-item-save-button').click()
      await expect(conflictAlert).toBeVisible()
      await conflictAlert.getByRole('button', { name: 'Reload latest' }).click()
      await expect(secondTab.getByTestId('work-item-title-input')).toHaveValue(winningTitle)
      await expect(secondTab.getByTestId('work-item-description-input')).toHaveValue(`${E2E_PREFIX}: original multitab description`)

      const finalIssue = await seed.findIssueByTitle(project.id, winningTitle)
      expect(finalIssue?.title).toBe(winningTitle)
      expect(finalIssue?.description).toBe(`${E2E_PREFIX}: original multitab description`)
    } finally {
      await adminContext.close()
    }
  })
})
