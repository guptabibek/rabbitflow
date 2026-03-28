import { test, expect } from './fixtures/app.fixture'
import { AUTH_STATES, E2E_PREFIX, TEST_ACCOUNTS, makeIssueTitle, makeProjectKey, makeProjectName } from './support/env'
import {
  closeEmbeddedWorkItem,
  createProject,
  createWorkItem,
  deleteProject,
  editProject,
  expectToast,
  openDashboard,
  openSidebarView,
  openWorkItemFromList,
  readJson,
  selectProjectFromDashboard,
  selectRadixOption,
  inviteExistingMember,
} from './support/ui'

test.use({ storageState: AUTH_STATES.admin })

test.describe('Projects And Onboarding', () => {
  test.describe.configure({ mode: 'parallel' })

  test('admin can create, edit, search, and delete a project from the dashboard', async ({ page, seed }) => {
    const projectName = makeProjectName('dashboard-project')
    const projectKey = makeProjectKey()
    const updatedName = `${projectName} Updated`
    const updatedDescription = `${E2E_PREFIX}: updated project description`

    const createResponse = await createProject(page, {
      name: projectName,
      key: projectKey,
      description: `${E2E_PREFIX}: original project description`,
    })

    const createdProject = await readJson(createResponse)
    expect(createdProject.key).toBe(projectKey)
    expect(await seed.findProjectByKey(projectKey)).not.toBeNull()

    await openDashboard(page)
    await editProject(page, projectName, updatedName, updatedDescription)

    const updatedProject = await seed.findProjectByName(updatedName)
    expect(updatedProject?.description).toBe(updatedDescription)

    await page.getByTestId('dashboard-project-search-input').fill(projectName)
    await expect(page.getByText('No projects found')).toBeVisible()

    await page.getByTestId('dashboard-project-search-input').fill(updatedName)
    await expect(page.locator('[data-testid^="dashboard-project-card-"]').filter({ hasText: updatedName })).toHaveCount(1)

    await deleteProject(page, updatedName)
    expect(await seed.findProjectByName(updatedName)).toBeNull()
  })

  test('admin can complete the onboarding checklist through realistic workspace actions', async ({ page, seed, accounts }) => {
    const projectName = makeProjectName('onboarding')
    const projectKey = makeProjectKey()
    const issueTitle = makeIssueTitle('onboarding issue')

    const createResponse = await createProject(page, {
      name: projectName,
      key: projectKey,
      description: `${E2E_PREFIX}: onboarding project`,
    })

    const createdProject = await readJson(createResponse)
    const projectId = createdProject.id as string

    await Promise.all([
      seed.createLabelFixture(projectId),
      seed.createTeamFixture({ projectId }),
      seed.createSprintFixture(projectId),
    ])

    await inviteExistingMember(page, accounts.member.email)
    expect(await seed.getProjectMemberCount(projectId)).toBe(2)

    await openSidebarView(page, 'list')
    const issueResponse = await createWorkItem(page, issueTitle, `${E2E_PREFIX}: onboarding issue description`)
    expect(issueResponse.status()).toBe(201)

    const createdIssue = await seed.findIssueByTitle(projectId, issueTitle)
    expect(createdIssue?.title).toBe(issueTitle)

    const doneState = await seed.getDoneState(projectId)
    expect(doneState?.name).toBeTruthy()

    await openWorkItemFromList(page, issueTitle)
    await selectRadixOption(page, 'work-item-assignee-trigger', accounts.member.name)
    await selectRadixOption(page, 'work-item-state-trigger', doneState!.name)

    const saveResponsePromise = page.waitForResponse(
      (response) => /\/api\/issues\//.test(response.url()) && response.request().method() === 'PUT'
    )

    await page.getByTestId('work-item-save-button').click()
    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok()).toBeTruthy()
    await expectToast(page, /work item saved/i)

    const updatedIssue = await seed.findIssueByTitle(projectId, issueTitle)
    expect(updatedIssue?.assignee?.name).toBe(accounts.member.name)
    expect(updatedIssue?.stateRecord?.name).toBe(doneState!.name)

    await closeEmbeddedWorkItem(page)

    await page.reload()
    await openSidebarView(page, 'board')
    await openSidebarView(page, 'reports')

    await expect
      .poll(async () => {
        return page.evaluate(async (activeProjectId) => {
          const response = await fetch(`/api/onboarding/status?projectId=${activeProjectId}`)
          const payload = await response.json()
          return payload.progressPercent as number
        }, projectId)
      })
      .toBe(100)

    await page.goto('/')
    await expect(page.getByTestId('onboarding-checklist')).toHaveCount(0)
  })
})