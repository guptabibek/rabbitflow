# Testing Audit

## Current state

```console
$ npm test
ℹ tests 155   ℹ pass 155   ℹ fail 0   ℹ duration_ms 554.0
```

155 tests, all passing, in half a second. They are **pure-function domain tests** run with
`node --test --experimental-strip-types`. No database, no HTTP, no React.

| Layer | Files | Coverage |
|---|---|---|
| Domain (pure functions) | 21 test files | ~21 of 49 domain modules |
| API routes | 0 | **0 of 124** |
| Database / Prisma | 0 | **0 of 59 models** |
| React components | 0 | **0 of ~50** |
| E2E (Playwright) | 5 specs | auth, issues, notifications+permissions, onboarding, chaos |

---

## TEST-001 · Three test files are silently excluded from `npm test` · **P2**

`package.json` enumerates test files by hand:

```json
"test": "node --test --test-isolation=none --experimental-strip-types
         tests/domain/content.test.ts tests/domain/mentions.test.ts … (18 files)"
```

`tests/domain/` contains **21** files. Missing from the script:

- `onboarding-engine.test.ts`
- `onboarding-steps.test.ts`
- `work-item-schema.test.ts`

`work-item-schema.ts` is 676 lines and drives the entire configurable work-item engine —
including `prepareCustomFieldWrites`, the function whose required-field enforcement
produces the UX-003 validation failure. Its tests exist and never run.

**Fix.** `node --test tests/domain/*.test.ts` (or a glob runner). Never enumerate.

---

## TEST-002 · Zero authorization tests · **P0 for confidence**

RBAC is the most security-critical logic in the system: 6 roles × 29 permissions, plus
`ProjectPermissionRule` overrides at project and area scope, plus `extraPermissions`
per membership, plus the global-admin fallback.

`tests/domain/rbac.test.ts` tests the **pure matrix** (`hasPermission`, `listPermissions`).
Nothing tests:

- that `requireProjectPermission` actually denies a non-member,
- that area-scoped rules filter `/api/issues` results,
- that a Viewer cannot POST a work item,
- that project A's data never appears in project B's responses,
- that a revoked session is rejected,
- that a deactivated user is rejected.

I verified several of these by hand against a running instance during this audit and they
**passed** — but nothing prevents a regression tomorrow. This is the single highest-value
test gap.

**Fix.** An integration suite against a throwaway Postgres (testcontainers or a compose
service) that, for each of the 6 roles, asserts the full allow/deny matrix across the
~15 most sensitive endpoints. Add a dedicated cross-project isolation suite.

---

## TEST-003 · Zero API route tests · **P1**

124 handlers, none tested. Untested behaviour includes every validation branch, every
status code, optimistic-lock conflict handling, transaction rollback, and every error path.

The domain functions these routes call *are* partly tested — but the routes contain
meaningful logic of their own (`issues/[issueId]/route.ts` is 1,109 lines).

**Fix.** Route-handler tests invoking the exported `GET`/`POST`/`PUT`/`DELETE` with a
constructed `NextRequest` against a test database. Prioritise: issues CRUD, relations,
board/backlog reorder, approvals, admin security.

---

## TEST-004 · Zero component tests · **P1**

No testing library is installed. Untested: the filter/sort predicates duplicated across
four views, the create-issue form's tab and validation logic, the work-item detail's
edit-mode population, and every loading/empty/error state.

**Fix.** Vitest + React Testing Library. Start by extracting the shared filter predicate
to a pure module (FE-006) and testing it there — highest value per line.

---

## TEST-005 · E2E suite exists but is not run and does not typecheck · **P1**

Five specs exist and are well-chosen (`auth`, `issues`, `notifications-permissions`,
`project-onboarding`, `chaos-resilience`), with fixtures, a DB helper and an auth setup
project. The Playwright config is sound: retries on CI, trace on first retry, screenshot
and video on failure, a `webServer` block.

Problems:
1. **`npx tsc --noEmit` fails on `tests/e2e/project-onboarding.spec.ts:36,67`** — the only
   two type errors in the repository (`Response` passed where `APIResponse` is expected).
2. **Nothing runs them.** There is no CI (see `devops-audit.md`), so the suite provides
   value only when someone remembers to run it locally.
3. `test-results/` and `playwright-report/` are **committed to the repository** and are not
   in `.gitignore`.

**Fix.** Fix the two type errors; add the suite to CI; gitignore the output directories.

---

## TEST-006 · No test database strategy · **P1**

`tests/e2e/support/db.ts` connects to whatever `DATABASE_URL` is set — there is no
ephemeral database, no per-test transaction rollback, no fixture reset. Running E2E
against a developer's dev database mutates it. There is no seeded fixture set for
deterministic assertions.

**Fix.** Compose service or testcontainers for an isolated Postgres; migrate + seed per
run; wrap integration tests in a transaction that rolls back.

---

## Recommended strategy

Prioritised by risk reduction per unit of effort:

| Priority | Suite | Target |
|---|---|---|
| 1 | **Authorization integration** | 6 roles × 15 endpoints; cross-project isolation; revoked session; deactivated user |
| 2 | **Auth flow integration** | login, lockout, MFA enrol + verify, MFA with Redis down, password reset, logout revocation |
| 3 | **Fix + wire the existing suites** | glob the domain tests, fix the 2 E2E type errors, run both in CI |
| 4 | **Issue CRUD API** | create/read/update/delete, optimistic lock 409, custom-field validation, area scoping |
| 5 | **E2E critical journeys** | login → create work item → board drag → complete → report reflects it |
| 6 | **Component** | shared filter predicate, create form validation, edit-mode population |
| 7 | **Regression** | one test per P0/P1 finding in this audit, written *before* the fix |

**Coverage target:** not a percentage. Aim for "every P0/P1 finding in this audit has a
test that fails before the fix and passes after."

---

## What is good

- **155 tests pass in 554ms** — fast enough to run on every save.
- **Test subjects are well chosen**: state machine, workflow transitions, RBAC matrix,
  work-item hierarchy, report calculations, webhook retry planning, email queue fallback,
  automation failure handling, data-integrity helpers. These are the genuinely tricky pure
  functions, and testing them was the right instinct.
- **`resilience.test.ts` and `chaos-resilience.spec.ts`** show deliberate thought about
  failure modes — unusual and welcome.
- **No mocking framework abuse** — the domain functions are pure enough to test directly,
  which is itself evidence of reasonable design.
- **`tests/e2e/README.md`** documents how to run the suite.

---

# Update — integration suite added (2026-09-05)

The gap described above is partly closed. `tests/integration/` now runs **61
tests against a real PostgreSQL database**, covering exactly the layers that had
zero coverage.

```console
npm test              →  243 passing   (pure domain functions)
npm run test:integration →  61 passing   (routes + database)
npm run test:all      →  304 passing
```

## What the integration suite covers

| File | Tests | Covers |
|---|---:|---|
| `authorization.test.ts` | 18 | 6 roles × read/write endpoints, cross-project isolation, revoked/expired sessions, deactivated users, permission disclosure |
| `auth-flow.test.ts` | 14 | password login, lockout, rate limiting, MFA challenge/verify/replay, admin MFA enforcement, challenge durability, logout revocation, registration gate |
| `issues-api.test.ts` | 17 | create/update/delete, required custom fields, schedule validation, optimistic-lock 409, cross-project denial, pagination, tsvector search |
| `api-token.test.ts` | 12 | bearer auth, read/write scope enforcement, revoked/expired/unknown tokens, deactivated owner, privilege ceiling, `lastUsedAt`, hash-at-rest |

## Why a real database

These tests deliberately do not mock Prisma. The behaviour they protect —
row-level authorization, foreign-key protection, optimistic locking, transaction
boundaries — does not exist in a mock. A mocked client would pass every
authorization assertion while the real query returned another tenant's rows.

`tests/integration/support/db.ts` refuses to run against a URL whose name does
not contain "test", because the helpers truncate tables.

## Bugs this suite caught immediately

- **An unknown `workItemType` returned 500 rather than 400.**
  `getProjectWorkItemTypeDefinition` threw a bare `Error`, and the route handlers
  catch only `ZodError`. Client-supplied input therefore surfaced as a server
  fault, and the thrown message interpolated the project id. Fixed with a typed
  `UnknownWorkItemTypeError` mapped to a validation response.
- **BullMQ retried Redis forever**, holding the Node event loop open. Harmless in
  production where Redis exists, but it meant a Redis outage produced a hung
  process rather than a degraded one. Now fails fast and falls back inline.
- **A test assumption about label permissions was wrong**, not the code: labels
  are gated on `workitem:update`, not `masterdata:manage`. The test now pins the
  real contract.

## Running locally

```bash
docker run -d --name rf-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=rabbitflow_test \
  -p 55433:5432 postgres:16-alpine

export TEST_DATABASE_URL="postgresql://test:test@localhost:55433/rabbitflow_test"
export DATABASE_URL="$TEST_DATABASE_URL"
export JWT_SECRET="integration-test-secret-at-least-32-bytes-long"

npx prisma migrate deploy
npm run test:integration
```

Files run with `--test-concurrency=1`: they share one database, so parallel
`before` hooks would race on truncation.

## Still missing

- **Component tests.** No testing library is installed. The filter predicate
  duplicated across four views remains the highest-value target, and is pure once
  extracted.
- **Broader route coverage.** 4 of 124 route files are exercised. Priority order:
  relations, board/backlog reorder, approvals, admin security.
- **E2E in CI.** The Playwright suite is wired into the pipeline but its
  assertions have not been reviewed against the current UI.
