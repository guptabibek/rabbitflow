# Product 10/10 Plan — Execution Log

**Started:** 2026-09-13
**Current phase:** Sprint 2 — Forms, onboarding, and everyday Scrum speed

This log records shipped slices and verification evidence. A Sprint acceptance item is
marked complete only when its entire acceptance criterion is met.

## Sprint 1 status

| Acceptance item | Status | Evidence / remaining work |
|---|---|---|
| App Router workspace segments | Complete | Canonical `/projects/{projectId}/{view}` routes preserve project, view, shared work-item filters, sprint planning selection, and unrelated query parameters across refresh, Back, Forward, copy, and legacy `?view=` migration. |
| Preserve working context | Complete | Embedded work items keep the workspace mounted. Browser tests prove exact list scroll and board position restoration; URL state restores filters, selected team, selected sprint, planning tab, and grouping. |
| Standard destructive confirmation | Complete | No native `confirm()` calls remain. User access, work item, member, iteration, team, and project deletion use the shared accessible dialog. The target and impact are named, repeat submission is disabled, and cancellation has no side effect. Failed requests in the migrated flows remain open for retry. |
| Unified feedback model | Complete | Required-action failures remain beside the affected form or section with retry and retained input across authentication, work items, sprint planning, administration, project configuration, imports, links, access rules, notifications, and onboarding. Toasts are limited to success, clipboard failure, and explicit partial-success outcomes. |
| Consistent loading and recovery | Complete | App Router and client bootstrap share geometry-matched project-directory and workspace shells. Browser checks prove the shell/sidebar/toolbar boxes remain fixed, retries preserve form input, project-list and segmented bootstrap failures recover in place, and stale work-item writes offer explicit reload/review choices. |
| Terminology cleanup | Complete | Ambiguous “All” options now name their scope, story-point values carry `SP`, health labels state their calculation thresholds, the project directory is consistently called Projects, and creation exposes workflow State without a competing board Status control. |

## Sprint 2 status

| Acceptance item | Status | Evidence / remaining work |
|---|---|---|
| Schema-driven form validation | Complete | Work-item creation validates every tab before a request, shows all errors together, badges tabs containing hidden errors, opens an invalid collapsed section, and focuses the first invalid control. Management and administration forms retain invalid or failed drafts with inline guidance. |
| Role-aware work-item creation | Complete | Each project remembers the user's last valid type, personal project templates prefill common fields, and the global `C` shortcut opens creation with focus on Title while ignoring typing contexts and users without create permission. |
| Board improvements | Complete | The board has explicit horizontal controls, accessible workflow-aware move menus, collapsible columns, per-project remembered layout, hide-completed mode, configurable WIP warnings, and live blocked-by signals from dependency records. |
| Sprint planning workspace | Complete | Backlog commitment, points, sprint goal, unplanned items, planned/capacity hours, and overloaded members appear together at every responsive size. Removing work updates totals immediately; capacity validation, retained failed edits, recovery, and URL-restored planning context are covered. |
| Ceremony support | Not started | Daily stale/blocked focus, review outcomes, and retrospective-action conversion remain. |
| Progressive onboarding | Complete | Role-specific step sets are filtered by the server evaluation engine, the checklist remembers its per-project collapsed state and collapses after initial progress, actions route correctly, and browser geometry/click checks prove the compact checklist does not cover the primary create action. |

## Completed implementation slices

### 2026-09-13 — Project-aware workspace routes

- Added validated App Router routes for every workspace destination.
- Made the route project ID authoritative after checking it against the authenticated
  user's project list.
- Migrated project-card selection, project switching, sidebar navigation, and view-mode
  switching to canonical paths.
- Kept `/` and `/?view=...` compatible and replace them with canonical routes after
  initialization.
- Preserved non-legacy query parameters when moving between views.
- Redirected invalid and old `/dashboard` workspace view slugs to project Overview.

Verification:

- Route domain tests: 3 passed.
- Full domain suite: 282 passed.
- Focused workspace Playwright suite: 6 passed.
- TypeScript, ESLint, and Next.js production build passed.

### 2026-09-13 — Standard destructive confirmation

- Replaced native confirmations in admin user offboarding, work-item deletion, project
  membership removal, iteration deletion, team deletion, and project deletion.
- Extended the shared dialog so a failed operation returns `false`, restores its ready
  state, and remains open for retry.
- Fixed embedded work-item deletion so it closes in place instead of forcing the user
  back to Overview; standalone deletion returns to the project's Work items view.
- Updated browser helpers to interact with accessible alert dialogs.

Verification:

- Repository scan: zero native `confirm()` or `window.confirm()` calls under `src/`.
- Affected Playwright journeys: 13 passed, including cancel, injected server failure,
  retry, success, and retained workspace-route checks.
- TypeScript and ESLint passed.

### 2026-09-13 — Linkable filters, sprint planning, and return context

- Added readable URL state for shared work-item search, type, assignee, priority,
  iteration, area, and label filters while preserving unrelated query parameters.
- Fixed saved views so their work-item type filter is restored when the view is applied.
- Added URL state for sprint team, sprint, planning tab, board grouping, and backlog
  grouping, including safe defaults and browser Back/Forward restoration.
- Kept the workspace mounted behind an inert work-item overlay so closing an item
  restores the exact list scroll and horizontal board position.

Verification:

- Route/filter/sprint domain coverage: 10 passed as part of the full 289-test domain
  suite.
- Workspace Playwright suite in Chrome: 9 passed, including copied filter links,
  refresh, clean sprint URLs, Back restoration, and exact scroll-position checks.
- TypeScript, ESLint, and whitespace validation passed.

### 2026-09-13 — Production image and Compose verification

- Built the optimized Next.js application directly and again inside the production
  multi-stage Docker image.
- Recreated the production app, PostgreSQL, Redis, and cron containers from the current
  Compose environment.
- Confirmed the app applied all 23 migrations with no pending migration, then reached
  healthy status behind nginx on port 3999.
- Confirmed `/api/health/ready` reports both database and Redis as `ok`.
- Confirmed an unauthenticated canonical project route reaches the application and
  redirects to `/login` instead of returning a proxy or route error.
- Found stale environment drift in the existing cron container after the app was
  recreated. Recreated cron and verified an authenticated in-network run completed the
  SLA, auth-challenge, retention, and recurring-task jobs successfully.
- Deployment follow-up: the configured SMTP endpoint currently presents a self-signed
  certificate, and a queued delivery exhausted its third attempt. The infrastructure
  team must install the trusted certificate chain or provide the required private CA;
  application TLS verification remains enabled.

### 2026-09-13 — Work-item feedback and stale-edit recovery

- Replaced transient creation validation toasts with inline errors on required custom
  fields, dates, story points, and hour fields, including accessible invalid-state and
  error-description links.
- Kept create API failures in a persistent alert beside the submit action and retained
  every entered value for retry.
- Kept edit API failures in the work-item header beside Save rather than relying on a
  disappearing toast.
- Added explicit stale-write recovery: “Review my edits” retains the local draft, while
  “Reload latest” fetches and displays the winning server version.

Verification:

- Complete work-item Playwright suite in Chrome: 6 passed.
- Coverage includes inline required-field and date validation, injected create and edit
  failures with retained input, duplicate-submit prevention, and both 409 recovery paths.
- TypeScript, ESLint, and whitespace validation passed.

### 2026-09-13 — Terminology and state/status consistency

- Renamed the organization project directory to “Projects” throughout rendered admin,
  error, and recovery links while keeping existing URLs compatible.
- Replaced bare “All” and numeric story-point labels with scoped terms such as “All
  priorities,” “All work items,” and values carrying `SP`.
- Renamed the portfolio's computed percentage to “Average objective progress” and
  documented the exact thresholds behind report health labels.
- Renamed creation tabs to “Planning” and “Type details.”
- Removed the independent Status selector from creation. When a workflow state exists,
  the API now always derives board status from its category so contradictory values
  cannot be stored.

Verification:

- Complete work-item Playwright suite in Chrome: 6 passed.
- The creation journey selects an In Progress state and verifies both state and stored
  status. It also sends a deliberately contradictory `status: backlog` API payload and
  proves the persisted status is normalized to `in_progress`.
- Static rendered-string scans found no bare `All` option, bare sprint/list story-point
  value, unexplained objective-health label, or user-facing competing Dashboard name.

### 2026-09-14 — Stable loading and project-directory recovery

- Added App Router loading boundaries for the project directory and project workspaces.
- Reused the same loading components during client bootstrap so streamed and hydrated
  fallbacks cannot drift apart.
- Corrected the workspace shell to account for the sidebar border, removing a measured
  one-pixel horizontal shift when initialization completes.
- Changed the Projects page to distinguish an expired session from a temporary project
  request failure. Temporary failures now remain on the page with technical detail and
  an explicit retry.
- Added inline validation and persistent submit failures to project creation, project
  editing, and organization user creation. Retrying keeps all entered values.
- Moved project-selection and admin-navigation failures from transient toasts to the
  project surface.
- Made every shared destructive confirmation display failed or thrown operations inside
  the still-open dialog.
- Promoted shared error-state titles to semantic headings, with a configurable heading
  level for page-level failures.

Verification:

- Focused browser coverage found and then proved the one-pixel loading-shell correction.
- Complete affected Playwright suites in Chrome: 18 passed (workspace UX, project
  onboarding, and chaos/recovery).
- TypeScript, ESLint, and whitespace validation passed.
- Rebuilt the production image from this source; its optimized Next.js build compiled,
  type-checked, and generated all 89 static pages.
- Restored the isolated production PostgreSQL and Redis volumes after browser testing,
  recreated app, cron, and nginx, and confirmed every service is running with app,
  PostgreSQL, and Redis healthy.
- Production readiness returned database and Redis `ok`; all 23 migrations are current;
  the protected canonical route returned the expected login redirect; and a manual
  authenticated cron run completed SLA, auth-challenge, retention, and recurring-task
  jobs successfully.
- Fresh app, cron, and nginx logs contained no runtime error after rebuild and probes.

### 2026-09-19 — Unified persistent feedback and complete browser QA

- Migrated required-action failures from transient notifications to persistent inline
  recovery across authentication, administration, sprint planning, imports, access
  rules, links, work-item relations, notifications, and project configuration.
- Kept failed drafts intact, added section-level retry controls, and kept destructive
  dialogs open after rejected operations.
- Added the previously missing linked-work-item surface to work-item detail and made
  relation, comment, attachment, and history failures independently recoverable.
- Fixed a real member-creation modal overlap where an unconstrained Radix scroll viewport
  intercepted the primary action.
- Made E2E authentication deterministic by enabling the guarded non-production
  rate-limit bypass in the Playwright-managed server.

Verification:

- Domain suite: 292 passed.
- Migration-backed PostgreSQL integration suite: 111 passed with zero skipped.
- Full Chrome E2E suite: 39 passed; the one configuration-gated scenario was then run
  separately with self-registration disabled and passed.
- TypeScript, ESLint, and whitespace validation passed.

### 2026-09-19 — Board control, WIP, and blocked-work visibility

- Added per-project board display preferences persisted on the current device.
- Added collapsible columns, hide-completed mode, a reset action, and explicit controls
  for horizontal navigation.
- Added configurable WIP limits for active working columns with visible and accessible
  reached/over-limit warnings, including collapsed columns.
- Added live blocker data to the issue list payload and a clearly named Blocked signal
  on each affected card. Completed or cancelled blockers no longer mark an item blocked.
- Kept collapsed columns as legal drop targets and retained the accessible move menu,
  which exposes only valid workflow transitions.

Verification:

- Focused Chrome journey creates a real dependency, verifies the blocked signal, sets a
  WIP limit, hides Done, collapses a column, reloads, and proves every preference remains.
- TypeScript and ESLint passed.

### 2026-09-19 — Complete work-item creation validation

- Validates title, custom required fields, dates, story points, and hour fields together
  before sending any request.
- Shows a single persistent error summary while retaining field-level messages.
- Badges Basic, Planning, and Type details when errors are hidden on those tabs.
- Selects the earliest invalid tab, opens collapsed custom-field sections containing an
  error, and focuses the first invalid control.
- Clears corrected standard-field errors without discarding the rest of the draft.

Verification:

- Focused Chrome journey proves combined Title and Scope errors, first-invalid focus,
  hidden-tab recovery, invalid date handling, duplicate-submit prevention, retained
  server-failure drafts, and successful workflow-state normalization.
- TypeScript and ESLint passed.

### 2026-09-20 — Current production Compose verification

- Rebuilt the complete production image from the current working tree and recreated the
  application, PostgreSQL, Redis, nginx, and cron services with the production Compose
  file and environment.
- The optimized Next.js build compiled, type-checked, and generated all 89 static pages.
- Confirmed all 23 Prisma migrations are applied and the schema is current.
- Confirmed the readiness endpoint reports both PostgreSQL and Redis as `ok` through
  nginx on port 3999.
- Confirmed login and registration-policy pages render, while an unauthenticated
  canonical project route redirects to `/login`.
- Ran the authenticated cron endpoint from the cron container. SLA, expired challenge,
  retention, and recurring-work jobs all completed successfully.
- Scanned fresh application, cron, and nginx logs after the probes; no error, exception,
  fatal, failed, or 5xx entries were present.

### 2026-09-20 — Faster, project-aware work-item creation

- Remembered the last valid work-item type separately for each project and restored it
  after closing or reloading the workspace.
- Added personal project templates that save and reapply type, description, priority,
  severity, estimates, assignee, area, labels, and custom-field values. Stale member,
  area, and label references are ignored safely when a template is applied.
- Added a global `C` shortcut for users with create permission. It opens creation from
  normal workspace surfaces, focuses Title, and does not fire in inputs, text areas,
  selects, editable content, other dialogs, or an open work item.
- Isolated these preferences from the main SSR-backed store record so unrelated store
  updates cannot erase them before client hydration. Invalid empty type events are
  rejected before persistence.

Verification:

- Focused Chrome journey proves the typing guard, keyboard focus, remembered type,
  reload persistence, and template restoration of description, priority, and required
  custom fields.
- Complete Chrome work-item suite: 9 passed.
- Domain suite: 292 passed. TypeScript and ESLint passed.

### 2026-09-20 — Unified sprint-planning decisions

- Added an always-visible planning summary with the sprint goal, committed item and
  point totals, unplanned-work count, planned versus available hours, and overloaded
  member count.
- Defined unplanned work at the decision point as an item missing an assignee, an
  estimate, or both, and displayed the separate counts so the team knows what to fix.
- Made each summary item lead to the relevant backlog, capacity, or sprint-management
  surface.
- Updated sprint removal optimistically across backlog, points, hours, per-member load,
  and over-allocation before reconciling with the server response.

Verification:

- Focused Chrome journey seeded estimated, overloaded, and unplanned sprint work and
  proved every summary value plus immediate recalculation after removal.
- Complete Chrome workspace UX suite: 11 passed.
- TypeScript and ESLint passed.

### 2026-09-20 — Progressive onboarding acceptance

- Verified that server-side onboarding evaluation filters both configured and default
  steps by normalized project role.
- Added stable hooks for the compact checklist and sidebar create action.
- Extended the complete onboarding journey to measure their rendered geometry, prove
  there is no overlap, and open creation through the unobstructed primary action.

Verification:

- Domain coverage proves Admin, Dev, QA, and Viewer receive their intended step sets.
- Focused Chrome onboarding journey passed from a new project through 100% completion.
