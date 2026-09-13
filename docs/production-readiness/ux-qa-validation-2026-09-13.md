# UX and QA validation — 2026-09-13

## Decision

The tested release candidate passed the automated user-flow, API, database, and
production-container checks listed below. The original User Story state-transition
defect is closed: the state picker now shows the current state plus enabled outgoing
transitions that are mapped to the item's work-item type. The API continues to reject
direct invalid transitions.

This is a release-candidate validation record, not a claim that every browser,
external service, or arbitrary data combination has been tested.

## Defects found and fixed

| ID | Observed behavior | Resolution | Verification |
|---|---|---|---|
| UX-QA-001 | User Story state picker offered states that the server rejected as an invalid workflow transition | Filter options by work-item type mapping and enabled outgoing transition edges; retain the current legacy state when needed | All eight default states tested as origins; exact option sets, valid UI changes, invalid API changes, persistence, and browser/API errors checked |
| UX-QA-002 | Sidebar Settings link selected an unsupported `?view=settings` value and left the workspace blank | Removed the dead route and added route-fallback coverage | All 26 reachable workspace destinations plus invalid and removed routes tested |
| UX-QA-003 | Production disabled registration only failed after users filled a form | Replaced the form with an immediate administrator-provisioning explanation when self-registration is disabled | Source-mode and deployed-production browser tests passed |
| UX-QA-004 | Board, bulk, and detail transition failures exposed only the technical workflow error | Preserved the stable machine error and added an actionable `details.userMessage`; clients prefer that message | Unit message-selection tests and browser workflow checks passed |
| UX-QA-005 | Login/register metadata suppressed the inherited brand icon, causing `/favicon.ico` to return 404 | Omit the child `icons` property when no tenant favicon is configured so `/logo.svg` is inherited | Production browser asserts the icon link and a 200 asset response |
| OPS-QA-001 | Cron container received 401 because the session proxy rejected the request before route-level secret authentication | Allow only the three exact scheduled-job paths through the proxy; centralize their fail-closed constant-time secret check | Valid secret 200; invalid secret 401; lookalike path 401; ordinary protected API 401; real cron-container command succeeds |
| OPS-QA-002 | Nginx accepted a URL as `server_name` and logged a suspicious-symbol warning | Corrected deployment value to a hostname; compose now rejects a scheme, path, or port and runs `nginx -t` before start | Nginx starts without the warning and serves through port 3999 |
| OPS-QA-003 | Persistent PostgreSQL volume credential differed from the deployment file after a secret change | Aligned the local production deployment file to the existing volume credential without changing the database role or deleting data | Migrations connected successfully; all 23 migrations applied/current; readiness is 200 |
| OPS-QA-004 | BullMQ logged that it was overriding `maxRetriesPerRequest` | Set the worker-compatible value explicitly while retaining the disabled offline queue and stopped reconnect strategy | Final production startup log contains no BullMQ warning |
| QA-HARNESS-001 | Unbounded Playwright workers caused false timeouts under constrained local resources | Fixed the suite at two workers and made self-registration explicit for source-mode E2E | Complete browser suite passed |

## Coverage exercised

- Authentication, registration policy, onboarding, create/read/update/delete flows,
  bulk operations, optimistic-concurrency conflicts, notifications, permission
  boundaries, and failure recovery.
- User Story workflow matrix across all eight default states: current state, every
  enabled outgoing edge, excluded disabled/unmapped/unreachable states, legal UI
  persistence, and direct illegal API rejection.
- Project roles: Project Manager, Developer, QA, DevOps, and Viewer, with enabled and
  disabled state controls checked according to permission.
- Navigation through all 26 reachable workspace destinations, invalid-route fallback,
  removed Settings route fallback, and mobile navigation.
- Production nginx, application, cron, PostgreSQL, and Redis startup; dependency health
  gates; migration deployment; public liveness/readiness; login; disabled registration;
  scheduler authentication; protected API authentication; and static brand asset.

## Recorded results

| Check | Result |
|---|---|
| ESLint, complete repository | Pass |
| TypeScript, `--noEmit --incremental false` | Pass |
| Optimized Next.js production build | Pass; 89 pages generated |
| Domain/unit suite | 279 passed, 0 failed |
| PostgreSQL integration suite | 109 passed, 2 expected MFA encryption skips, 0 failed |
| Complete Playwright suite | 19 passed, 1 configuration-specific skip, 0 failed |
| Production-disabled registration Playwright test through nginx | 1 passed, 0 failed |
| Docker Compose production stack | App/PostgreSQL/Redis healthy; nginx and cron running |
| Prisma deployment | 23 migrations present; no pending migrations after deployment |
| Live HTTP acceptance | Liveness 200, readiness 200, login 200, registration 200, valid cron 200, invalid cron 401, protected API 401 |

The production stack remains running at `http://127.0.0.1:3999` for review.

## Remaining validation limits

- Browser automation ran in Chrome/Chromium. Firefox, WebKit, Safari, and native mobile
  browser behavior have not been executed in this environment.
- The suite checks board and workflow behavior, but does not exhaustively exercise
  native drag-and-drop pointer behavior across browsers and touch devices.
- The authenticated source-mode suite used a real PostgreSQL test database. The
  production PostgreSQL port remains intentionally private, so the deployed stack was
  validated with unauthenticated production acceptance tests instead of reseeding its
  persistent data.
- SMTP delivery, third-party webhook receivers, SSO providers, and disaster recovery
  require their external systems or operator-run restore environment and were outside
  this local run.
