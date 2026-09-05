import {
  expect,
  type APIResponse,
  type Locator,
  type Page,
  type Response as PlaywrightResponse,
} from '@playwright/test'

type ProjectInput = {
  name: string
  key: string
  description?: string
}

function projectCards(page: Page) {
  return page.locator('[data-testid^="dashboard-project-card-"]')
}

export function findProjectCard(page: Page, name: string) {
  return projectCards(page).filter({ hasText: name }).first()
}

export async function openDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(page.getByTestId('dashboard-project-search-input')).toBeVisible()
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByTestId('login-email-input').fill(email)
  await page.getByTestId('login-password-input').fill(password)

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST'
  )

  await page.getByTestId('login-submit-button').click()
  const response = await responsePromise

  expect(response.ok()).toBeTruthy()
  await expect(page).toHaveURL(/\/dashboard$/)

  return response
}

export async function logout(page: Page) {
  await page.getByTestId('dashboard-logout-button').click()
  await expect(page).toHaveURL(/\/login$/)
}

export async function createProject(page: Page, project: ProjectInput) {
  await openDashboard(page)
  await page.getByTestId('dashboard-new-project-button').click()
  await expect(page.getByTestId('dashboard-create-project-dialog')).toBeVisible()

  await page.getByTestId('dashboard-create-project-name-input').fill(project.name)
  await page.getByTestId('dashboard-create-project-key-input').fill(project.key)
  await page
    .getByTestId('dashboard-create-project-description-input')
    .fill(project.description ?? '')

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/projects') && response.request().method() === 'POST'
  )

  await page.getByTestId('dashboard-create-project-submit-button').click()
  const response = await responsePromise

  expect(response.status()).toBe(201)
  await expect(page).toHaveURL(/\/$/)

  return response
}

export async function editProject(page: Page, currentName: string, nextName: string, nextDescription: string) {
  const card = findProjectCard(page, currentName)
  await expect(card).toBeVisible()

  await card.locator('[data-testid^="dashboard-project-actions-"]').click()
  await card.locator('[data-testid^="dashboard-project-edit-"]').click()
  await expect(page.getByTestId('dashboard-edit-project-dialog')).toBeVisible()

  await page.getByTestId('dashboard-edit-project-name-input').fill(nextName)
  await page.getByTestId('dashboard-edit-project-description-input').fill(nextDescription)

  const responsePromise = page.waitForResponse(
    (response) => /\/api\/projects\//.test(response.url()) && response.request().method() === 'PUT'
  )

  await page.getByTestId('dashboard-edit-project-submit-button').click()
  const response = await responsePromise

  expect(response.ok()).toBeTruthy()
  await expect(page.getByTestId('dashboard-edit-project-dialog')).toBeHidden()

  return response
}

export async function deleteProject(page: Page, projectName: string) {
  const card = findProjectCard(page, projectName)
  await expect(card).toBeVisible()

  await card.locator('[data-testid^="dashboard-project-actions-"]').click()
  await card.locator('[data-testid^="dashboard-project-edit-"]').click()
  await expect(page.getByTestId('dashboard-edit-project-dialog')).toBeVisible()

  const dialogPromise = page.waitForEvent('dialog')
  const responsePromise = page.waitForResponse(
    (response) => /\/api\/projects\//.test(response.url()) && response.request().method() === 'DELETE'
  )

  await page.getByTestId('dashboard-delete-project-button').click()
  const dialog = await dialogPromise
  await dialog.accept()
  const response = await responsePromise

  expect(response.ok()).toBeTruthy()
  await expect(findProjectCard(page, projectName)).toHaveCount(0)

  return response
}

export async function selectProjectFromDashboard(page: Page, name: string) {
  const card = findProjectCard(page, name)
  await expect(card).toBeVisible()
  await card.click()
  await expect(page).toHaveURL(/\/$/)
}

export async function openSidebarView(page: Page, view: string) {
  const target = page.getByTestId(`sidebar-nav-${view}`)
  await target.click()
  await expect(target).toHaveAttribute('aria-current', 'page')
}

export async function selectRadixOption(page: Page, triggerTestId: string, optionName: string) {
  await page.getByTestId(triggerTestId).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

export async function createWorkItem(page: Page, title: string, description: string) {
  await page.getByTestId('work-items-new-button').click()
  await expect(page.getByTestId('create-work-item-dialog')).toBeVisible()

  await page.getByTestId('create-work-item-title-input').fill(title)
  await page.getByTestId('create-work-item-description-input').fill(description)

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/issues') && response.request().method() === 'POST'
  )

  await page.getByTestId('create-work-item-submit-button').click()
  const response = await responsePromise

  expect(response.status()).toBe(201)
  await expect(page.getByTestId('create-work-item-dialog')).toBeHidden()

  return response
}

export async function openWorkItemFromList(page: Page, title: string) {
  const row = page.locator('[data-testid^="work-item-row-"]').filter({ hasText: title }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByTestId('work-item-detail')).toBeVisible()
}

export async function closeEmbeddedWorkItem(page: Page) {
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('work-item-detail')).toHaveCount(0)
}

export async function selectWorkItemCheckboxByTitle(page: Page, title: string) {
  const row = page.locator('[data-testid^="work-item-row-"]').filter({ hasText: title }).first()
  await expect(row).toBeVisible()
  await row.locator('[data-testid^="work-item-select-"]').click()
}

export async function openMembersDialog(page: Page) {
  await page.getByTestId('sidebar-settings-toggle').click()
  await page.getByTestId('sidebar-members-button').click()
  await expect(page.getByTestId('member-management-dialog')).toBeVisible()
}

export async function inviteExistingMember(page: Page, searchText: string) {
  await openMembersDialog(page)
  await page.getByTestId('member-management-add-button').click()
  await expect(page.getByTestId('member-management-add-dialog')).toBeVisible()
  await page.getByTestId('member-management-user-search-input').fill(searchText)

  const result = page.locator('[data-testid^="member-search-result-"]').filter({ hasText: searchText }).first()
  await expect(result).toBeVisible()
  await result.click()

  const responsePromise = page.waitForResponse(
    (response) => /\/api\/projects\/.+\/members$/.test(response.url()) && response.request().method() === 'POST'
  )

  await page.getByTestId('member-management-add-existing-submit').click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  return response
}

export async function openNotificationPanel(page: Page) {
  await page.getByTestId('notification-bell-button').click()
  await expect(page.getByTestId('notification-panel')).toBeVisible()
}

/**
 * Read a JSON body from either kind of Playwright response: `APIResponse` (from
 * `request.get()` and friends) or `Response` (from `page.waitForResponse()`).
 * Both expose `.json()`, but they are unrelated types, so accept the union.
 */
export async function readJson(response: APIResponse | PlaywrightResponse) {
  return response.json()
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).last()).toBeVisible()
}

export function visibleWorkItemRow(page: Page, title: string): Locator {
  return page.locator('[data-testid^="work-item-row-"]').filter({ hasText: title }).first()
}