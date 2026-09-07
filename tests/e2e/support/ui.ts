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

  const emailInput = page.getByTestId('login-email-input')
  const passwordInput = page.getByTestId('login-password-input')

  /*
    Fill, then prove the values survived, and retry the pair if they did not.

    The fields are React-controlled. Playwright can fill them before hydration
    completes — the DOM takes the text, then React mounts, re-renders from its
    own empty state and wipes both. The submit that follows then carries no
    credentials, and because the inputs are `required` the browser blocks the
    form natively: no request is made at all, and the wait below times out with
    nothing in the network log to explain it.

    Against a dev server this is easy to hit, since the first paint of a route
    can precede its hydration by seconds. `toPass` re-runs the whole block, so
    a wipe simply costs one more attempt.
  */
  await expect(async () => {
    await emailInput.fill(email)
    await passwordInput.fill(password)
    await expect(emailInput).toHaveValue(email)
    await expect(passwordInput).toHaveValue(password)
  }).toPass({ timeout: 20_000 })

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
  // Sign-out lives in the account menu, so it has to be opened first.
  await page.getByTestId('account-menu-trigger').click()
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
  // The menu content renders in a portal at the end of <body>, so it is not a
  // descendant of the card that opened it.
  await page.locator('[data-testid^="dashboard-project-edit-"]').click()
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

  // Accepted from a listener so the click that opens it can settle — see the
  // note on the same pattern in issues.spec.ts.
  page.once('dialog', (dialog) => void dialog.accept())

  const responsePromise = page.waitForResponse(
    (response) => /\/api\/projects\//.test(response.url()) && response.request().method() === 'DELETE'
  )

  // Delete straight from the card menu (portal-rendered, so queried off `page`).
  // It used to route through the edit dialog, which was the only way to reach
  // deletion at all.
  await page.locator('[data-testid^="dashboard-project-delete-"]').click()
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

/*
  Creation renders either as a dialog or as a full-screen page, depending on
  where it was opened from — a long form on a wide surface is a page, not a
  modal. Both carry the same field and submit hooks, so the helper only needs
  to accept either container.
*/
function createWorkItemSurface(page: Page) {
  return page.locator(
    '[data-testid="create-work-item-surface"], [data-testid="create-work-item-dialog"]'
  )
}

/**
 * Choose the work-item type on the create form.
 *
 * The default is Epic, which additionally requires an Objective. Tests that are
 * not about custom fields pick `task`, the type with the smallest required set.
 */
export async function selectWorkItemType(page: Page, typeKey: string) {
  await page.getByTestId('create-work-item-type-trigger').click()
  await page.getByTestId(`create-work-item-type-${typeKey}`).click()
}

/**
 * Set the Scope field, which every work-item type marks required.
 *
 * Creation is refused until it has a value, and the refusal is reported on the
 * Fields tab — so a test that skips it never reaches whatever it was actually
 * trying to assert.
 */
export async function fillRequiredScope(page: Page) {
  await page.getByTestId('create-work-item-tab-fields').click()
  await page.getByTestId('work-item-field-scope').click()
  await page.getByRole('option', { name: 'In Scope', exact: true }).click()
  await page.getByTestId('create-work-item-tab-basic').click()
}

export async function createWorkItem(page: Page, title: string, description: string) {
  await page.getByTestId('work-items-new-button').click()
  await expect(createWorkItemSurface(page)).toBeVisible()

  /*
    Task, not the default Epic.

    Epic declares Objective as a required custom field, and every type carries a
    required Scope. The form correctly refuses to submit until both are set —
    which is the behaviour we want, but it is not what these tests are about, so
    they pick the type with the smallest required set and fill it.
  */
  await selectWorkItemType(page, 'task')

  await page.getByTestId('create-work-item-title-input').fill(title)
  await page.getByTestId('create-work-item-description-input').fill(description)

  await fillRequiredScope(page)

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/issues') && response.request().method() === 'POST'
  )

  await page.getByTestId('create-work-item-submit-button').click()
  const response = await responsePromise

  expect(response.status()).toBe(201)
  await expect(createWorkItemSurface(page)).toBeHidden()

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

  /*
    Close what this opened before handing control back.

    The members dialog deliberately stays open after an add, so several people
    can be invited in a row — correct product behaviour, but it leaves a Radix
    overlay covering the page. Anything the caller does next (a sidebar click,
    say) then fails with "intercepts pointer events" some distance from the
    real cause.
  */
  const addDialog = page.getByTestId('member-management-add-dialog')
  if (await addDialog.isVisible()) {
    await page.keyboard.press('Escape')
    await expect(addDialog).toBeHidden()
  }

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('member-management-dialog')).toBeHidden()

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