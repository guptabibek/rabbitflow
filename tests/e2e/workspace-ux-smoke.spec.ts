import { test, expect } from './fixtures/app.fixture'
import { AUTH_STATES, makeIssueTitle, makeProjectName } from './support/env'
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
  test('workspace loading shell keeps the authenticated layout geometry stable', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('stable-loading-shell') })
    await page.setViewportSize({ width: 1280, height: 720 })

    let releaseCurrentUser!: () => void
    const currentUserGate = new Promise<void>((resolve) => {
      releaseCurrentUser = resolve
    })

    await page.route('**/api/auth/me', async (route) => {
      await currentUserGate
      await route.continue()
    })

    await page.goto(`/projects/${project.id}/overview`)

    const loadingShell = page.getByTestId('workspace-shell-skeleton')
    await expect(loadingShell).toBeVisible()
    const loadingSidebarBox = await page
      .getByTestId('workspace-shell-skeleton-sidebar')
      .boundingBox()
    const loadingToolbarBox = await page
      .getByTestId('workspace-shell-skeleton-toolbar')
      .boundingBox()
    expect(loadingSidebarBox).not.toBeNull()
    expect(loadingToolbarBox).not.toBeNull()

    releaseCurrentUser()
    await expect(loadingShell).toHaveCount(0)

    const workspaceSidebarBox = await page
      .locator('aside[aria-label="Project navigation"]')
      .boundingBox()
    const workspaceToolbarBox = await page.getByTestId('workspace-toolbar').boundingBox()
    expect(workspaceSidebarBox).not.toBeNull()
    expect(workspaceToolbarBox).not.toBeNull()

    expect(workspaceSidebarBox).toEqual(loadingSidebarBox)
    expect(workspaceToolbarBox).toEqual(loadingToolbarBox)
  })

  test('workspace chrome stays mounted while switching project views', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('persistent-shell') })
    await page.goto(`/projects/${project.id}/overview`)

    const toolbar = page.getByTestId('workspace-toolbar')
    await expect(toolbar).toBeVisible()
    await page.evaluate(() => {
      ;(window as Window & { __rabbitflowToolbar?: Element }).__rabbitflowToolbar =
        document.querySelector('[data-testid="workspace-toolbar"]') ?? undefined
    })

    await page.getByTestId('sidebar-nav-board').click()
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board(?:\\?|$)`))
    await expect(page.getByTestId('workspace-shell-skeleton')).toHaveCount(0)
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __rabbitflowToolbar?: Element }).__rabbitflowToolbar ===
          document.querySelector('[data-testid="workspace-toolbar"]')
      )
    ).toBe(true)
  })

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

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board$`))
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
    await page.goto(`/projects/${project.id}/settings`)

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/overview$`))

    await expect(page.getByTestId('sidebar-nav-dashboard')).toHaveAttribute('aria-current', 'page')
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')
    ).toHaveText('Overview')
  })

  test('copied routes restore the requested project and browser history restores the view', async ({ page, seed }) => {
    const firstProject = await seed.createProjectFixture({ name: makeProjectName('route-first') })
    const requestedProject = await seed.createProjectFixture({ name: makeProjectName('route-requested') })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(firstProject.name)
    await selectProjectFromDashboard(page, firstProject.name)

    await page.goto(`/projects/${requestedProject.id}/board?assignee=me`)
    await expect(page.getByTestId('workspace-project-switcher')).toContainText(requestedProject.name)
    await expect(page.getByTestId('sidebar-nav-board')).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveURL(new RegExp(`/projects/${requestedProject.id}/board\\?assignee=me$`))

    await page.getByTestId('sidebar-nav-reports').click()
    await expect(page).toHaveURL(new RegExp(`/projects/${requestedProject.id}/reports\\?assignee=me$`))

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/projects/${requestedProject.id}/board\\?assignee=me$`))
    await expect(page.getByTestId('sidebar-nav-board')).toHaveAttribute('aria-current', 'page')

    await page.reload()
    await expect(page.getByTestId('workspace-project-switcher')).toContainText(requestedProject.name)
    await expect(page.getByTestId('sidebar-nav-board')).toHaveAttribute('aria-current', 'page')
  })

  test('legacy query links migrate to the canonical project route', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('legacy-route') })

    await openDashboard(page)
    await page.getByTestId('dashboard-project-search-input').fill(project.name)
    await selectProjectFromDashboard(page, project.name)
    await page.goto('/?view=board&sprint=current')

    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/board\\?sprint=current$`))
    await expect(page.getByTestId('sidebar-nav-board')).toHaveAttribute('aria-current', 'page')
  })

  test('work-item filters survive copy, view changes, clear, and refresh', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('filter-route') })

    await page.goto(
      `/projects/${project.id}/board?search=payment&workItemType=bug&priority=high&panel=activity`
    )

    await expect(page.getByTestId('work-items-search-input')).toHaveValue('payment')
    await expect(page.getByLabel('Filter by type')).toContainText('Bug')
    await expect(page.getByLabel('Filter by priority')).toContainText('High')

    await page.getByTestId('work-items-search-input').fill('payment retry')
    await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBe('payment retry')

    await page.getByTestId('sidebar-nav-list').click()
    await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/list\\?`))
    expect(new URL(page.url()).searchParams.get('workItemType')).toBe('bug')
    expect(new URL(page.url()).searchParams.get('priority')).toBe('high')
    expect(new URL(page.url()).searchParams.get('panel')).toBe('activity')

    await page.reload()
    await expect(page.getByTestId('work-items-search-input')).toHaveValue('payment retry')
    await page.getByRole('button', { name: 'Clear all', exact: true }).click()

    await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBeNull()
    const clearedUrl = new URL(page.url())
    expect(clearedUrl.searchParams.get('workItemType')).toBeNull()
    expect(clearedUrl.searchParams.get('priority')).toBeNull()
    expect(clearedUrl.searchParams.get('panel')).toBe('activity')
  })

  test('copied sprint routes restore team, sprint, and planning tab', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('sprint-route') })
    const requestedTeam = await seed.createTeamFixture({ projectId: project.id })
    await seed.createTeamFixture({ projectId: project.id })
    const requestedSprint = await seed.createSprintFixture(project.id, requestedTeam.id)
    const alternateSprint = await seed.createSprintFixture(project.id, requestedTeam.id)

    await page.goto(
      `/projects/${project.id}/sprints?teamId=${requestedTeam.id}&sprintId=${requestedSprint.id}&sprintTab=capacity`
    )

    await expect(page.getByLabel('Select sprint team')).toContainText(requestedTeam.name)
    await expect(page.getByLabel('Select sprint', { exact: true })).toContainText(requestedSprint.name)
    await expect(page.getByRole('tab', { name: 'Capacity' })).toHaveAttribute('data-state', 'active')

    await page.evaluate((projectId) => {
      window.history.pushState({}, '', `/projects/${projectId}/sprints`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, project.id)
    await expect(page.getByLabel('Select sprint team')).toContainText('All Teams')
    await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('data-state', 'active')

    await page.goBack()
    await expect(page.getByLabel('Select sprint team')).toContainText(requestedTeam.name)
    await expect(page.getByLabel('Select sprint', { exact: true })).toContainText(requestedSprint.name)
    await expect(page.getByRole('tab', { name: 'Capacity' })).toHaveAttribute('data-state', 'active')

    await page.goForward()
    await expect(page.getByLabel('Select sprint team')).toContainText('All Teams')
    await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('data-state', 'active')

    await page.goBack()
    await expect(page.getByLabel('Select sprint team')).toContainText(requestedTeam.name)
    await expect(page.getByLabel('Select sprint', { exact: true })).toContainText(requestedSprint.name)
    await expect(page.getByRole('tab', { name: 'Capacity' })).toHaveAttribute('data-state', 'active')

    await page.getByLabel('Select sprint', { exact: true }).click()
    await page.getByRole('option', { name: new RegExp(alternateSprint.name) }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('sprintId')).toBe(alternateSprint.id)

    await page.getByRole('tab', { name: 'Backlog' }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('sprintTab')).toBeNull()
    await page.reload()

    await expect(page.getByLabel('Select sprint team')).toContainText(requestedTeam.name)
    await expect(page.getByLabel('Select sprint', { exact: true })).toContainText(alternateSprint.name)
    await expect(page.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('data-state', 'active')
  })

  test('sprint planning shows goal, backlog, unplanned work, and allocation together', async ({ page, seed, accounts }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('planning-summary') })
    const team = await seed.createTeamFixture({ projectId: project.id })
    const sprintGoal = 'Ship the verified checkout path'
    const sprint = await seed.createSprintFixture(project.id, team.id, {
      goal: sprintGoal,
      startDate: new Date('2026-09-21T00:00:00.000Z'),
      endDate: new Date('2026-10-05T00:00:00.000Z'),
    })
    const overloadedTitle = makeIssueTitle('overloaded sprint work')
    await seed.createIssueFixture({
      projectId: project.id,
      title: overloadedTitle,
      assigneeEmail: accounts.admin.email,
      iterationId: sprint.id,
      storyPoints: 8,
      estimatedHours: 100,
    })
    await seed.createIssueFixture({
      projectId: project.id,
      title: makeIssueTitle('unplanned sprint work'),
      iterationId: sprint.id,
      storyPoints: 3,
    })

    await page.goto(
      `/projects/${project.id}/sprints?teamId=${team.id}&sprintId=${sprint.id}`
    )

    const summary = page.getByTestId('sprint-planning-summary')
    await expect(summary).toBeVisible()
    await expect(page.getByTestId('sprint-summary-goal')).toContainText(sprintGoal)
    await expect(page.getByTestId('sprint-summary-backlog')).toContainText('2 items · 11 SP')
    await expect(page.getByTestId('sprint-summary-unplanned')).toContainText('1 item')
    await expect(page.getByTestId('sprint-summary-unplanned')).toContainText('1 unassigned · 1 unestimated')
    await expect(page.getByTestId('sprint-summary-capacity')).toContainText('100h /')
    await expect(page.getByTestId('sprint-summary-overallocation')).toContainText('1 member over capacity')

    const overloadedRow = page.getByText(overloadedTitle, { exact: true }).locator('..')
    await overloadedRow.getByRole('button', { name: 'Remove from sprint' }).click()
    await expect(page.getByTestId('sprint-summary-backlog')).toContainText('1 item · 3 SP')
    await expect(page.getByTestId('sprint-summary-capacity')).toContainText('0h /')
    await expect(page.getByTestId('sprint-summary-overallocation')).toContainText('0 members over capacity')
  })

  test('closing a work item restores list scroll and board position', async ({ page, seed }) => {
    const project = await seed.createProjectFixture({ name: makeProjectName('return-context') })
    let firstIssue: Awaited<ReturnType<typeof seed.createIssueFixture>> | null = null
    for (let index = 0; index < 35; index += 1) {
      const issue = await seed.createIssueFixture({
        projectId: project.id,
        title: `${makeProjectName('return-context-item')} ${index + 1}`,
      })
      firstIssue ??= issue
    }
    if (!firstIssue) throw new Error('Expected a seeded work item')

    await page.goto(`/projects/${project.id}/list`)
    const tableScroller = page.locator('[data-slot="table-container"]')
    await expect(tableScroller).toBeVisible()
    await tableScroller.evaluate((element) => {
      element.scrollTop = Math.min(320, element.scrollHeight - element.clientHeight)
    })
    const listScrollBefore = await tableScroller.evaluate((element) => element.scrollTop)
    expect(listScrollBefore).toBeGreaterThan(0)

    await page.getByTestId(`work-item-row-${firstIssue.id}`).evaluate((element: HTMLElement) => {
      element.click()
    })
    await expect(page.getByRole('button', { name: 'Close work item' })).toBeVisible()
    await page.getByRole('button', { name: 'Close work item' }).click()
    await expect(page.getByTestId('work-items-list-view')).toBeVisible()
    await expect.poll(() => tableScroller.evaluate((element) => element.scrollTop)).toBe(listScrollBefore)

    await page.setViewportSize({ width: 900, height: 720 })
    await page.goto(`/projects/${project.id}/board`)
    const boardScroller = page.getByRole('region', { name: 'Kanban board' })
    await expect(boardScroller).toBeVisible()
    const boardItem = page.getByRole('button', {
      name: `${firstIssue.key}: ${firstIssue.title}`,
      exact: true,
    })
    await expect(boardItem).toBeAttached()
    await expect
      .poll(() =>
        boardScroller.evaluate((element) => element.scrollWidth - element.clientWidth)
      )
      .toBeGreaterThan(0)
    await boardScroller.evaluate((element) => {
      element.style.scrollBehavior = 'auto'
      element.scrollLeft = Math.min(300, element.scrollWidth - element.clientWidth)
    })
    await expect.poll(() => boardScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    const boardScrollBefore = await boardScroller.evaluate((element) => element.scrollLeft)

    await boardItem.evaluate((element: HTMLElement) => element.click())
    await expect(page.getByRole('button', { name: 'Close work item' })).toBeVisible()
    await page.getByRole('button', { name: 'Close work item' }).click()
    await expect(page.getByRole('region', { name: 'Kanban board' })).toBeVisible()
    await expect.poll(() => boardScroller.evaluate((element) => element.scrollLeft)).toBe(boardScrollBefore)
  })
})
