# RabbitFlow — Full-System Audit & Completion Prompt

> **How to use this.** Paste everything between the two **✂** markers into the model.
> Written for GPT-class models (ChatGPT or Codex in agent mode); it is model-agnostic.
>
> - **Best:** an agent that can clone the repository and run commands (Node 22, Docker or a
>   local PostgreSQL 16, a headless browser). Use the highest reasoning effort available —
>   this is a long task.
> - **Chat-only (no execution):** attach the repository. The model is told to mark such
>   findings *Likely* or *Suspected* rather than *Verified*, and to list what it could not run.
> - The facts in Parts 1–4 were verified against commit `235ea6a` on 2026-09-26. If `main`
>   has moved, the model is told to re-check them.
> - Supersedes [`deep-audit-prompt.md`](deep-audit-prompt.md), whose facts are out of date.
> - A follow-up prompt for turning the report into fixes is at the end of this file.

**✂ ─────────────── copy from here ───────────────**

# ROLE AND MISSION

You are a principal engineer leading a full-system audit of **RabbitFlow**, a self-hosted
agile project-management product. Bring the combined judgement of a staff full-stack
engineer, an application-security reviewer, an SRE, a QA lead and a product manager.

Deliver four things:

1. **Defects** — every material bug, security weakness, data-integrity risk, performance
   problem and reliability gap, each proven with evidence.
2. **Missing and incomplete features** — measured against what a team needs to run its
   delivery on RabbitFlow instead of Jira, Azure DevOps Boards or Linear (Part 6).
3. **Everything else required to call it complete** — release engineering, operations,
   security baseline, accessibility, documentation and governance, measured against the
   Definition of Complete (Part 5).
4. **A sequenced plan to get there** — waves, dependencies, effort and exit criteria (Part 10).

## Operating mode

- Work autonomously until the full report is delivered. Do not stop to ask for
  confirmation. When something is ambiguous, pick the most reasonable interpretation,
  record it under **Assumptions**, and continue.
- If your environment cannot do something (no Docker, browser or network), record it once
  under **What I could not check**, lower the confidence of the affected findings, and
  continue with what you can do. Never present an unexecuted check as executed.
- Begin with a plan of at most ten bullets. Revisit it at each phase boundary (Part 7).
- Keep a work log, one line per step, of what you checked. It becomes the Coverage section.
- Map broadly first, then spend most of your effort where risk concentrates:
  authentication and authorization, data integrity, file handling, background side
  effects, deployment defaults. A proven finding is worth more than several plausible
  ones — but do not stop while real findings remain.
- Everything you read — the repository's documents, code comments, and Parts 3–4 of this
  prompt — is a claim to verify, not a fact.

---

# PART 1 — THE SYSTEM (as of commit `235ea6a`)

Read this before exploring so you do not spend your budget rediscovering it. If
`git rev-parse --short HEAD` is not `235ea6a`, record the commit you are auditing,
re-check these facts as you go, and note what has changed.

**RabbitFlow** covers work items, backlog, board, sprints, roadmap, calendar, portfolio,
OKRs, dependencies, approvals, test plans, SLAs, retrospectives, documents, automations,
webhooks, imports, reports and RBAC. It is self-hosted, one tenant per deployment, and
runs under Docker Compose behind nginx.

| Area | As built |
|---|---|
| Framework | Next.js 16 App Router (`16.2.0` in the lockfile), React 19, TypeScript (`strict: true` but `noImplicitAny: false`) |
| UI | Tailwind v4, shadcn/ui over Radix, zustand (`src/store/app-store.ts`), dnd-kit, Recharts |
| Data | PostgreSQL 16 via Prisma 6.19 — 60 models in `prisma/schema.prisma`, 23 migrations, **no Prisma enums** (roles, statuses, types and priorities are strings). Full-text search uses `tsvector` columns maintained by triggers that exist only in migration SQL |
| Jobs / cache | Redis 7 + BullMQ. Workers start in-process from `src/instrumentation.ts` in every app replica. Rate limiting is Redis-backed with an in-process fallback; caching (`withCache`) is Redis-backed and simply skipped without Redis |
| Authentication | HS256 JWT (`jose`) in an httpOnly, `SameSite=Lax` `auth-token` cookie tied to an `AuthSession` row; TOTP MFA (seeds encrypted at rest when `MFA_ENCRYPTION_KEY` is set); email-OTP password reset; lockout; bearer API tokens with read/write scopes. MFA challenges and reset OTPs are stored in Postgres (`src/lib/auth-otp.ts`) |
| Authorization | Project roles `Admin`, `PM`, `DevOps`, `Dev`, `QA`, `Viewer` (`src/lib/domain/rbac.ts`), area-scoped ACL rules (`ProjectPermissionRule`, `src/lib/domain/access-control.ts`), and a system-level `globalRole` admin |
| Request path | `src/proxy.ts` (Next 16's replacement for middleware) gates pages and APIs and injects `x-user-id`, `x-session-id` and `x-request-id`. `src/lib/domain/auth.ts` re-verifies the cookie or bearer identity and session revocation on every API call |
| Email | nodemailer over SMTP, queued |
| Scheduling | A separate Alpine cron container POSTs `/api/cron` every 2 minutes with `x-cron-secret`: SLA breaches, auth-challenge purge, retention sweep, recurring tasks |
| Realtime | SSE at `/api/realtime/project/stream` and `/api/notifications/stream`, both polling Postgres on an interval |
| Uploads | Local disk under `UPLOAD_DIR`, served by authorising route handlers with `nosniff` and a sandbox CSP; `sharp` processes images |
| Runtime | `Dockerfile` on `node:22-bookworm-slim`, `output: "standalone"`, non-root; `docker/entrypoint.sh` runs `prisma migrate deploy`, then an optional bootstrap seed, then the server |
| Tests | `node:test` unit (`tests/domain`: 38 files, 302 tests); integration against real Postgres (`tests/integration`: 14 files, 115 tests); Playwright E2E (`tests/e2e`: 12 specs, about 49 tests, Axe checks); load runner `scripts/release-load-test.mjs`; scale seeder `scripts/seed-production-scale.mts`; SQL checks `scripts/db-integrity-audit.sql` |

**Shape of the codebase** (about 77,000 lines of TS/TSX under `src/`)

- `src/app/api/**/route.ts` — **125 route handlers**.
- `src/app/projects/[projectId]/[view]` — **26 workspace views** (listed in
  `src/lib/domain/workspace-route.ts`), rendered by the client shell
  `src/components/workspace-app.tsx` (1,293 lines). Other pages: `/projects`, `/dashboard`,
  `/work-items/[issueId]`, `/admin`, `/admin/panel`, `/admin/security`, `/login`, `/register`.
- `src/components/project-management/**` — feature components. Largest:
  `sprint-view.tsx` (2,272 lines), `work-item-type-management.tsx` (2,033),
  `create-issue-dialog.tsx` (1,837), `admin-config-panel.tsx` (1,826),
  `issue-detail-dialog.tsx` (1,810), `reports-view.tsx` (1,613).
- `src/lib/domain/**` — domain layer: services, RBAC, state machine, SLA, automations,
  webhooks, reports (`reports.ts`, 1,258 lines). `src/lib/**` — infrastructure: db, auth,
  email, queues, rate limiting, crypto, env validation (`env.ts`).
- Deployment: `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml` (development
  defaults), `docker-compose.production.yml` (hardened), `docker-compose.e2e.yml`,
  `docker/nginx*.conf*`, and `scripts/` (seeding, first deploy, production reset, load test).

---

# PART 2 — PRIOR WORK: READ IT, DO NOT REPEAT IT

`docs/production-readiness/` holds 22 documents from earlier audits and three remediation
passes (this prompt, `full-audit-prompt.md`, sits alongside them), plus
`docs/production-upgrade.md`. Read these first: `README.md`,
`risk-register.md`, `remediation-log.md`, `remediation-log-2.md`, `remediation-log-3.md`,
`feature-plan.md`, `product-10-of-10-execution.md`, `release-validation.md`.
`deep-audit-prompt.md` is a superseded version of this prompt with stale facts; skip it.

## 2.1 Claimed fixed — spot-check, report only regressions

- File uploads: magic-byte validation, storage outside the web root, authorising download
  routes (SEC-001). Auth challenges in Postgres; liveness and readiness split (SEC-002, BE-009).
- No MFA bypass for administrators; CSPRNG OTPs; constant-time secret comparison
  (SEC-003, SEC-004, SEC-023). TOTP seeds encrypted at rest (SEC-014). Sessions revoked on
  password reset (SEC-015).
- Webhook SSRF guard (SEC-006). User deletion no longer destroys their work items
  (SEC-007 / DB-001). Registration off by default with a domain allow-list; user search
  scoped (SEC-008, SEC-009). Area ACLs applied to search (SEC-013).
- Rate limiting in nginx and the app (SEC-012). Datastores unpublished and Redis
  password-protected **in the production compose file** (OPS-004). Startup env
  validation (OPS-005).
- Bearer API tokens enforced with scopes (BE-004). Durable side effects via BullMQ
  (BE-001). Correlation ids from the proxy (BE-008). Graceful shutdown (BE-010).
  Retention sweeps (DB-005). Provisioning off the read path (BE-002).
- 403 rather than 401 for non-members; `/api/rbac` no longer answers non-members
  (API-002, API-003).
- Per-view App Router URLs with deep links; a shared destructive-confirmation dialog and
  no native `confirm()`; the state picker offers only legal transitions; no raw Tailwind
  palette classes; every icon button named.
- Saved Views UI; Areas and notification-preference screens; board WIP limits,
  collapsible columns and blocked signals; roadmap and calendar rescheduling; portfolio
  drill-through; an editable dependency graph with cycle rejection.

## 2.2 Known and still open — not new findings, but they belong in the roadmap

Report one of these only if you find a specific, previously undocumented consequence.
Either way, list each in the roadmap (Part 10) with its current status.

- Backups and disaster recovery (SEC-005 / OPS-002) and TLS termination (OPS-003) —
  owned by the infrastructure team.
- SSE polls Postgres instead of using Redis pub/sub (BE-003).
- No idempotency keys on creates (API-005). No OpenAPI spec (API-007). No component or
  render tests, and no testing library installed (TEST-004).
- `Issue.status` duplicates `Issue.stateId` by design. The API derives status from the
  state's category, but no database constraint ties them (DB-004).
- Human release gates are pending: Firefox, WebKit and mobile E2E runs; manual keyboard
  and screen-reader review; production-scale capacity and dependency-loss recovery;
  representative usability sessions; a two-team full-sprint pilot (`release-validation.md`).
- In the risk register but never recorded as fixed — **determine the current status of
  each**: migrations run from the container entrypoint, and no index uses `CONCURRENTLY`
  (OPS-006 / DB-002); no metrics, alerting or error tracking (OPS-009); uploads on a
  local volume, workers in-process, no cron leader election (OPS-010); ESLint rules
  disabled and `noImplicitAny: false` (FE-005); connection-pool sizing (PERF-011);
  pagination conventions (API-004); bulk operations only for issues (API-006); orphaned
  upload blobs (DB-003); regex-based content sanitiser (SEC-019); password policy and the
  bcrypt 72-byte limit (SEC-024); user enumeration (SEC-025).

  The pre-pass confirmed four of these are unchanged:
  - Migrations still run from `docker/entrypoint.sh`.
  - No migration uses `CONCURRENTLY`.
  - No metrics or error-tracking dependency exists.
  - `noImplicitAny` is still `false`.

---

# PART 3 — BASELINE FROM A PRE-PASS (re-run it yourself)

Recorded 2026-09-26 at `235ea6a` on Node 22.22.2 and PostgreSQL 16.13:

| Check | Result |
|---|---|
| `npx prisma generate` | OK |
| `npx tsc --noEmit --incremental false` | Clean |
| `npm run lint` | Clean |
| `npm test` | **Fails at startup:** `node: bad option: --test-isolation=none`. Run with `--experimental-test-isolation=none` instead: 302/302 pass |
| `npx prisma migrate deploy` on an empty database | 23 migrations applied |
| `npx prisma migrate diff … --exit-code` | **Exit 2: schema drift** (see L3) |
| `npm run test:integration` | 115/115 pass |
| `npm run build` | Succeeds |
| `npm audit --omit=dev` | **14 advisories: 1 critical, 10 high, 3 moderate** (see L4) |
| Playwright E2E | Not run in the pre-pass |

If your results differ, the difference is itself a finding — or the repository has
moved; say which.

---

# PART 4 — LEADS FROM THE PRE-PASS: VERIFY, THEN GO BEYOND

A short read-only pass turned up the items below. Treat each as a hypothesis. Confirm or
refute it with your own evidence, assign severity yourself, and fold confirmed items into
your findings under your own IDs, noting the lead number. They are a starting point: the
report is expected to go well beyond them.

**L1 — No CI.** The head commit (`235ea6a`, "Delete .github/workflows directory") removed
`.github/workflows/ci.yml`. It had run typecheck, lint, unit tests, migrations on an empty
database with a schema-drift check, integration tests, the production build, Playwright on
Chromium, Firefox and WebKit, and `npm audit`. Nothing now gates a merge. Read it with
`git show 235ea6a^:.github/workflows/ci.yml`.

**L2 — The unit-test script does not run on the production Node major.** `npm test`
passes `--test-isolation=none`, which Node 22 rejects; Node 22 accepts only
`--experimental-test-isolation`. The Dockerfile and the deleted CI both use Node 22, and
nothing pins a version: there is no `engines` field, `.nvmrc` or `.node-version`.

**L3 — Schema drift between `schema.prisma` and the migration history.**
`npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url <empty-db> --exit-code`
exits 2. The migrations contain objects the schema does not:
- GIN indexes on the `searchVector` columns of `Issue`, `Comment` and `Document`. The
  triggers that populate those columns are defined in migration SQL
  (`20260327100000_enterprise_features_phase1`), not in the schema.
- Indexes on `Notification(issueId)` and `OnboardingAnalytics(userId)`.
- Database-side defaults (`gen_random_uuid()`, `now()`) on 26 tables.
- A truncated index name on `WorkItemTypeFieldMapping`.

Evaluate the consequences. The root README and `tests/e2e/README.md` both set up
databases with `npm run db:push`. The pre-pass checked one built that way: it has none of
the three search triggers and none of the three `searchVector` indexes that a migrated
database has, so nothing ever populates the search columns. Confirm what search then
returns. Also establish what the next `prisma migrate dev` would generate. The deleted CI
ran this exact check with `--exit-code`.

**L4 — Known-vulnerable dependencies.** `npm audit --omit=dev` reports:
- **Critical: `next@16.2.0`.** The advisory set includes middleware/proxy bypass, SSRF,
  XSS, cache poisoning and DoS. This matters because `src/proxy.ts` gates the page
  routes. Newer 16.x releases exist.
- **High:** `nodemailer@7.0.13` (SMTP command and CRLF injection; the fix is a major
  upgrade); `sharp@0.34.5` (libvips and libheif CVEs — and sharp processes user uploads);
  `postcss`, `lodash`, `nanoid`, `defu` and `deepmerge-ts`; and the chain
  `prisma` → `@prisma/config` → `effect`.

For each advisory, determine whether it is reachable given how this app actually uses the
package. Do not report bare presence.

**L5 — Insecure deployment defaults.** The root README documents only one deployment
path, which it calls "a production Docker setup": `npm run docker:first-deploy` and
`npm run docker:up`, both using `docker-compose.yml`. It never mentions
`docker-compose.production.yml` or the `docker:prod:*` scripts; only
`docs/production-upgrade.md` does.

`docker-compose.yml`:
- Sets `NODE_ENV=production`.
- Supplies working fallbacks for `JWT_SECRET` (a 38-byte placeholder that passes the
  length-only check in `src/lib/env.ts`), `CRON_SECRET` and `SEED_ADMIN_PASSWORD`.
- Defaults `RUN_BOOTSTRAP_SEED=true`.
- Publishes Postgres (password `rabbitflow`) and a password-less Redis on the host.

Separately, `scripts/seed-bootstrap.mjs:154` falls back to a hard-coded external Gmail
address for the bootstrap administrator whenever `SEED_ADMIN_EMAIL` is empty. That
includes deploys from the production compose file, where the variable defaults to empty.

Work out what someone who has read this repository can do to a deployment that kept the
defaults: the known admin password with first-login MFA enrolment, password reset to the
fallback mailbox, and forged JWTs.

The pre-pass reproduced the forged-JWT path against a local instance. A token signed with
the configured secret, carrying a user's id but no `sid` claim, authenticated as that
user: `/api/auth/me` returned `sessionId: null`, and `/api/admin/security/users` returned
200. The cause is `validateActiveSession` in `src/lib/domain/auth.ts`, which skips its
check when `sid` is absent — although every token the app issues has one. Such a token is
tied to no session, never passes through MFA, and survives session revocation.

Also: `.env.docker.example`, which `scripts/docker-first-deploy.mjs` requires, does not
exist, so the documented first-deploy command exits immediately on a fresh clone.

**L6 — The unified error contract is mostly unadopted.** `src/lib/api-error.ts` provides a
machine-readable `code`, a `requestId` and a structured log line, but only 6 of 125 route
files import it. 112 route files log with bare `console.error` and return ad-hoc bodies
(for example `src/app/api/reports/dora/route.ts`). The remediation log describes the
contract as done.

Also check:
- **Correlation-id coverage.** `src/proxy.ts` mints `x-request-id` only for
  cookie-authenticated requests.
- **Status codes.** `src/app/api/realtime/project/stream/route.ts` answers every
  authorization failure with 401, including non-membership.

**L7 — DORA metrics are proxies.** `computeDoraMetrics` (`src/lib/domain/reports.ts`, near
line 850) counts completed iterations as "deployments". Nothing ingests deployment or
incident events. Check how the UI labels these numbers.

**L8 — The documentation contradicts the code.**
- **Root README.**
  - Documents `/api/seed`, `/api/sprints` and `/api/sprints/[sprintId]`, none of which
    exist.
  - Says a default `JWT_SECRET` is used when it is unset; startup validation rejects that.
  - Says Node 18+ is enough; the scripts need 22.6 or later.
  - Says `start` uses Bun; it runs `next start`.
  - Lists tests, CI and Docker as future work.
  - Its troubleshooting section calls `curl -X POST /api/seed`.
- **`.env.example`** says Redis holds MFA challenges and reset OTPs; they are in Postgres.
- **`tests/e2e/README.md`** references a missing `.env.e2e.example` and lists 4 of the 12
  specs.
- **Lockfiles.** Both `bun.lock` and `package-lock.json` are committed; Docker uses npm.

**L9 — Governance files are absent.** There is no `LICENSE`, `SECURITY.md`,
`CONTRIBUTING.md`, `CHANGELOG`, `CODEOWNERS`, PR template, or Dependabot/Renovate
configuration. The version is `0.2.0`; there are no git tags and no release process.

**L10 — Capability gaps found by search.** Confirm each in the product before reporting it:
- No SSO (OIDC, SAML, LDAP) and no SCIM.
- No MFA recovery codes; recovery is an administrator reset.
- No passkeys.
- No i18n framework.
- No self-service data export or account erasure.
- No organization or tenant model.
- No metrics, tracing or error-tracking integration.
- No page-level Content-Security-Policy. CSP is set only on upload, attachment and avatar
  responses.

---

# PART 5 — DEFINITION OF COMPLETE

Judge "complete" against this bar. It describes a self-hosted, single-tenant product
that an organization could adopt as its system of record for delivery work. If you
believe a criterion does not fit the product's positioning, say so and why; do not skip
it silently.

| | Dimension | Complete means |
|---|---|---|
| A | Functional | Every capability rated **Must** in Part 6 works end to end: UI, API, validation, permissions, empty and error states, audit trail |
| B | Correct | Every core journey (Part 7, Phase 5) completes for every role that should be able to complete it. No path loses or corrupts data. Concurrent edits resolve deterministically. Retries are safe |
| C | Secure | OWASP ASVS 4.0.3 Level 2 as the benchmark. No known critical or high vulnerability reachable in shipped dependencies. Secure by default: a deploy that keeps the defaults is not exploitable |
| D | Operable | CI gates every merge. Images are reproducible and versioned. Migrations are safe on populated tables. Backup and restore are rehearsed, with a stated RPO and RTO. TLS. Structured logs, metrics and alerts. Health checks that mean something. Runbooks for deploy, rollback, restore, incidents and secret rotation. Known behaviour at more than one replica |
| E | Accessible | WCAG 2.2 AA across core journeys, including keyboard-only and screen-reader use |
| F | Performant | Stated budgets — for example p75 API latency, page load, and a board of 10,000 items — with evidence that they are met |
| G | Maintainable | Tests at the layers where the risk lives. Documentation matches behaviour. Dependency hygiene. No dead code or dead configuration |
| H | Governed | Licence, security-disclosure policy, changelog and versioning, and privacy capabilities (export, erasure, retention) proportionate to the data held |

---

# PART 6 — CAPABILITY BENCHMARK (the missing-feature analysis)

For every capability below, record:

- **Status:** Present, Partial, Missing, or Not applicable. For Partial, name exactly
  what is absent.
- **Evidence:** a file path, route, or UI path you exercised.
- **Priority for this product:** Must, Should or Could.

Add capabilities that are not listed if the product clearly needs them.

- **Identity and access:** SSO (OIDC, SAML); directory sync (SCIM, LDAP); email
  invitations; MFA with recovery codes; passkeys; self-service session management ("sign
  out other devices"); password policy; account deactivation and ownership transfer;
  API tokens with scopes and expiry.
- **Work tracking:**
  - Configurable types, fields and workflows; hierarchy and links; bulk edit; clone, and
    move between projects.
  - Watchers and subscriptions; @mentions; attachments with preview; rich-text or
    markdown editing; templates.
  - Time tracking and estimates; releases or versions (a fix-version equivalent);
    components.
  - Soft delete with restore or undo; complete change history.
- **Planning:** backlog ranking, sprints and capacity, roadmap, calendar, portfolio,
  OKRs, dependencies, forecasting, scenario planning.
- **Collaboration:** comments with edit history; notifications (in-app, email, digest,
  per-event preferences); due-date reminders; presence; documents or wiki;
  retrospectives; approvals.
- **Reporting:** configurable dashboards; burndown and burnup; velocity; cumulative flow;
  cycle and lead time; genuine DORA, which needs deployment and incident data; CSV and
  PDF exports; scheduled reports.
- **Search and navigation:** full-text search across items, comments and documents; a
  structured query or filter language; saved views; command palette; keyboard shortcuts;
  favourites and recents; a deep link for everything.
- **Integrations:**
  - A documented REST API (OpenAPI); webhooks with retries and delivery history.
  - Git provider integration that links commits, branches and pull requests
    automatically, not only by hand.
  - Chat (Slack, Teams); email-in; CI/CD deployment events; calendar feeds.
  - Import from Jira, Azure DevOps and CSV; full export.
- **Administration:** user lifecycle; system settings in the UI; security and activity
  audit logs with export; retention settings; branding; email template management; a
  health or status page; a backup and restore procedure; a usage overview.
- **Platform qualities:** i18n and per-user time zones (only `RecurringTask` has a
  time-zone column today); dark mode; responsive and touch support; performance at
  10,000+ items per project; data portability; privacy requests (export, erasure).
- **Operations:** CI/CD; versioned releases; zero-downtime deploys; a migration strategy;
  backups and PITR; TLS; secrets management; observability and alerting; rate limiting;
  horizontal scaling (SSE, cron, workers, uploads and caches across replicas).

A route or a model is not a feature: confirm it is reachable and works in the UI for the
intended roles. And the absence of a grep hit is not the absence of a feature: confirm it
in the running product (Part 9, rule 2).

---

# PART 7 — HOW TO WORK

**Phase 0 — Baseline.** Set up, re-run Part 3, and record exact versions (Node,
PostgreSQL, Redis, browser).

**Phase 1 — Map.** Read the Part 2 documents, `schema.prisma`, the route tree and
`workspace-route.ts`. Build four inventories:
- **Routes:** method, guard, required permission, and client callers.
- **Views:** entry points and the data each loads.
- **Models:** who writes them, who reads them, what deletes them, what prunes them.
- **Environment variables:** where each is documented and what reads it.

**Phase 2 — Automated probes.**
- **Route ↔ client matrix.** For each API path, search `src/components`, `src/app`,
  `src/hooks` and `src/store` for callers. A route with no caller is a headless feature or
  dead code. A client call with no route is a bug.
- **Environment contract.** Take every variable in `.env.example`, both compose files,
  the Dockerfile and `scripts/`, and find its readers in `src/` and `scripts/`.
  Set-but-unread and read-but-undocumented are both findings.
- **Guard coverage.** For each route, which applies: `requireProjectPermission`,
  `requireSystemAdmin`, API-token scope, the cron secret, or nothing? Also find every
  `request.json()` that is not parsed with a schema.
- **Unbounded work.** Every `findMany` without `take` on a table that grows; every query
  inside a loop or inside `Promise.all` over a collection.
- **Dead weight.** Unused exports, unreferenced components, and packages with no import.

**Phase 3 — Static deep review.** Go through every area in Part 8.

**Phase 4 — Run it.**
- Start Postgres and Redis, apply migrations, seed an administrator and a project, and run
  the app.
- Exercise it through a real browser (Playwright) and `curl`.
- Count queries per request at the database (`log_min_duration_statement = 0` or
  `pg_stat_statements`), which needs no code change.
- Use the scale seeder for a 10,000-item project, then `EXPLAIN ANALYZE` the expensive
  queries.
- Break things: stop Redis, stop Postgres mid-request, point SMTP at a dead host.
- Use a local mail catcher (for example Mailpit) and a local webhook receiver, never
  real third parties.

**Phase 5 — Journeys, per role.** Walk each journey as each project role (`Admin`, `PM`,
`DevOps`, `Dev`, `QA`, `Viewer`), as a system administrator, and as an authenticated
non-member:
1. Fresh deploy → first administrator → first project → add a member → first work item →
   first sprint → first report.
2. Triage: report a bug, assign it, move it through the workflow, close it. Check the
   history, notifications and SLA timer.
3. Sprint: plan against capacity, run the board, complete the sprint, carry work over,
   run the retrospective, and turn actions into tasks.
4. Approval: request and decide; then the approver is unavailable.
5. SLA: approaching breach, breached, resolved.
6. Import: map, dry run, commit, partial failure.
7. Integration: create an API token and call the API with it; register a webhook and
   watch deliveries and retries.
8. Offboarding: a person leaves. What happens to their assignments, comments, approvals,
   sessions and API tokens?
9. Recovery: forgotten password, lost authenticator, locked account.

For each journey, count the clicks and page loads. Note every dead end, every forced
round-trip, and every point where the system knows something and does not say it.

**Phase 6 — Gap analysis** against Parts 5 and 6.

**Phase 7 — Synthesis.** De-duplicate by root cause, rank, and plan.

**Commands** (Node 22, matching the Dockerfile)

```bash
npm ci && npx prisma generate
npx tsc --noEmit --incremental false
npm run lint
npm test   # fails on Node 22 (L2); the equivalent that runs:
node --test --experimental-test-isolation=none --experimental-strip-types \
  --import ./tests/support/alias-hooks.mjs "tests/domain/**/*.test.ts"
npm run build
npm audit --omit=dev; npm outdated        # both exit non-zero when they find something

# Throwaway PostgreSQL (statement logging on, for counting queries per request) and Redis.
# The integration helper refuses any database whose name lacks "test".
docker run -d --name rf-test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=rabbitflow_test -p 55433:5432 postgres:16-alpine \
  -c log_min_duration_statement=0
docker run -d --name rf-test-redis -p 6379:6379 redis:7-alpine
docker exec rf-test-pg psql -U test -d postgres -c "CREATE DATABASE rabbitflow_e2e_test;" \
  -c "CREATE DATABASE rabbitflow_shadow_test;" -c "CREATE DATABASE rabbitflow_explore_test;"

export JWT_SECRET="local-only-secret-at-least-32-bytes-long-xxxxx"
export MFA_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
T=postgresql://test:test@localhost:55433

DATABASE_URL=$T/rabbitflow_test npx prisma migrate deploy
npx prisma migrate diff --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url $T/rabbitflow_shadow_test --exit-code        # L3

DATABASE_URL=$T/rabbitflow_test TEST_DATABASE_URL=$T/rabbitflow_test \
  MFA_REQUIRE_ENROLLMENT=true npm run test:integration

# E2E: migrate the e2e database, start the app against it, then run Playwright.
DATABASE_URL=$T/rabbitflow_e2e_test npx prisma migrate deploy
# Terminal 1 (the shell where JWT_SECRET is exported) runs the app:
DATABASE_URL=$T/rabbitflow_e2e_test MFA_REQUIRE_ENROLLMENT=false ALLOW_SELF_REGISTRATION=true \
  E2E_DISABLE_RATE_LIMITS=true npm run dev
# Terminal 2 runs Playwright:
DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_e2e_test \
  E2E_SKIP_WEBSERVER=true npm run test:e2e
# Add E2E_FULL_MATRIX=true for Firefox, WebKit, Pixel 7 and iPhone 15.

# A seeded instance to explore (Phases 4-5). The seed creates a system administrator and a
# starter project (key RABBIT). Create the per-role users from the admin screens.
# Test the MFA journey separately with MFA_REQUIRE_ENROLLMENT=true.
E=$T/rabbitflow_explore_test
DATABASE_URL=$E npx prisma migrate deploy
DATABASE_URL=$E SEED_ADMIN_EMAIL=admin@example.test \
  SEED_ADMIN_PASSWORD='<a strong local-only password>' npm run db:seed:bootstrap
DATABASE_URL=$E REDIS_URL=redis://localhost:6379 CRON_SECRET=local-only-cron-secret \
  MFA_REQUIRE_ENROLLMENT=false npm run dev
# Run scheduled jobs by hand:
#   curl -X POST -H "x-cron-secret: local-only-cron-secret" http://localhost:3000/api/cron

# Scale the starter project to 10,000 items for performance work
# (the seeder refuses any database URL without test, load or staging in it):
DATABASE_URL=$E ALLOW_SCALE_SEED=true SCALE_PROJECT_ID=<RABBIT project id> \
  SCALE_ISSUE_COUNT=10000 npm run seed:scale
```

---

# PART 8 — WHAT TO EXAMINE

The questions are prompts for investigation, not a checklist to answer line by line. Go
and look.

**8.1 Data model and migrations**
- **Constraints.** Nullable columns that are never legitimately null; missing unique
  constraints, foreign keys and check constraints. With no enums, where is each
  role/status/type/priority string validated, and can an invalid value reach the database
  through imports, bulk updates, automations or raw SQL?
- **Cascades.** For every relation, what does parent deletion do? Find any path from
  deleting a user, project, type, state, iteration or area that destroys history or
  orphans rows or files.
- **Denormalised data.** Stored aggregates, counters and trigger-maintained columns: what
  keeps them in step, and what repairs them after drift?
- **Indexes.** Missing ones for hot filters; unused ones; redundant composite prefixes.
  Also the L3 drift.
- **Time.** UTC throughout? Date-only values stored as timestamps? Sprint boundaries,
  SLA clocks and recurring rules across daylight-saving changes?
- **Growth.** Which tables grow without bound, and is pruning proven by a test?
- **Delete semantics.** Is soft versus hard delete consistent, and where can things be
  restored?
- **Migration safety.** Locks on populated tables, destructive statements without
  guards, backfills inside migrations, the rollback story, and concurrent
  `migrate deploy` from several replicas at startup.

**8.2 Query performance**
- N+1 patterns, over-fetching `include`s, unbounded reads, and offset pagination on deep
  lists.
- Sequential awaits that could run concurrently.
- Cache keys and invalidation. For example, reports use `withCache` with a 300-second
  TTL: are they stale after an edit?
- The connection pool under concurrent users, with SSE polling every few seconds per
  connection. `DATABASE_CONNECTION_LIMIT` is 10 in `src/lib/db.ts` when unset, but 20 in
  `.env.example` and the compose files.
- Measure and report numbers: queries per request, and latencies at 10,000 items.

**8.3 API contract**
- Error envelope and status-code consistency (L6): 401 versus 403, 404 versus 403 for
  non-members, 409, 422.
- List shapes and pagination conventions.
- Validation coverage.
- Mismatches between response shapes and what the client reads — that is where the
  crashes live.
- Optimistic concurrency on every mutating endpoint, not only issues.
- Bulk partial-failure semantics.
- Rate-limit coverage.
- Versioning.
- What an unauthenticated caller can learn.

**8.4 Security and privacy (through the OWASP ASVS L2 lens)**
- **Row-level authorization on every route.** That includes IDs supplied in the body that
  could cross a project boundary: an iteration, area, label, parent, relation or approver
  from another project.
- **Area-ACL consistency.** Is it enforced identically across lists, search, reports,
  exports, SSE, notifications, activity, webhooks and portfolio?
- **API tokens.** Scope per method; which routes accept them; hashing; expiry; the
  owner being deactivated.
- **Session lifecycle.** The 30-day TTL, and revocation on password change, reset,
  deactivation and role change. Also `sid`-less tokens (L5), the cookie `Secure` flag
  behind the proxy, and CSRF posture with `SameSite=Lax`.
- **Uploads.** Size limits in nginx versus the app, image re-encoding, decompression
  bombs, quotas.
- **Outbound requests.** SSRF via webhooks and git links, including redirects and DNS
  rebinding.
- **Injection and XSS.** Markdown rendering and sanitisation (SEC-019), branding inputs,
  HTML emails built from user-controlled names and titles, and raw SQL built from input.
- **Secrets and defaults.** L5; whether env validation detects placeholder values; logs
  that contain tokens or personal data.
- **Headers.** The CSP gap (L10); HSTS without TLS.
- **Account protection.** Password policy (SEC-024), user enumeration (SEC-025), lockout
  as a denial-of-service lever.
- **Audit trail.** Is every administrative and security action recorded, and is the
  record tamper-resistant?
- **Privacy.** A PII inventory, and its export, erasure and retention.
- **Dependencies.** L4.

**8.5 Background work and realtime**
- BullMQ retries, dead-lettering and idempotent handlers. What happens to effects when
  Redis is down — lost, or duplicated?
- Workers running in every web replica.
- Overlapping cron runs: a 2-minute schedule against a slow run, and double execution of
  recurring tasks.
- SLA timers across state changes and pauses.
- SSE reconnect and backoff, duplicate connections per tab, and cost per connected user.
- Notification fan-out cost.

**8.6 Reliability**
- Behaviour with Postgres, Redis or SMTP unavailable: degraded or broken?
- Timeouts and retries on every outbound call, including the internal `fetch` in
  `/api/cron`.
- Atomicity of multi-step operations.
- Shutdown with SSE streams open.
- Whether readiness reflects the real dependency contract.

**8.7 Frontend architecture and performance**
- What the large client shell does that the server could do.
- Per-route bundle composition from the build output; heavy dependencies loaded eagerly.
- Broad zustand subscriptions and unstable identities causing re-renders.
- Fetch waterfalls, refetches and missing cancellation.
- Leaked intervals and `EventSource`s.
- Error-boundary granularity: only app-level `error.tsx` and `global-error.tsx` exist —
  what does one failing panel take down?
- Dead code.

**8.8 UX**
- **Information architecture.** Is anything findable only by knowing it exists?
- **State matrix.** For every meaningful component: default, hover, focus, active,
  selected, disabled, loading, empty, error and partial. Partial is the usual gap.
- **Empty states** that explain what would fill them.
- **Forms:** validation timing, focus management, unsaved-changes protection.
- **Tables** at 10,000 rows.
- **Filters** that are visible, clearable and shareable.
- **Dialogs and drawers.**
- **Breakpoints** at 360, 768, 1024, 1440 and 2560 px.
- **Consistency:** terminology, date and number formats, and the copy in the UI versus
  emails.

**8.9 Accessibility (WCAG 2.2 AA)**
- Keyboard alternatives for every drag interaction: board, backlog, roadmap, calendar.
- Focus visibility, order and return.
- Roles, names and states on custom widgets: board, roadmap, calendar, dependency graph,
  command palette.
- Live regions.
- Contrast in both themes, including disabled, placeholder and chart colours.
- Reduced motion.
- Target size.
- Headings and landmarks.
- Information carried by colour alone: health, SLA, WIP.

**8.10 Observability**
- Structured logs versus about 280 `console.*` calls.
- Correlation-id coverage (L6).
- Metrics, tracing, error tracking and alerting.
- Health-endpoint semantics.
- Log volume while a dependency is down.

**8.11 Testing**
- Map test files to routes: which of the 125 routes have no integration test?
- Which journeys lack E2E coverage?
- Tests that skip themselves silently, depend on execution order, or use fixed sleeps.
- Assertions that would survive a broken implementation.
- The Node-version issue (L2).
- Whether the load and scale harness has ever produced a recorded result.

**8.12 Release engineering, deployment and supply chain**
- **Pipeline:** CI (L1), version pinning (L2), the dual lockfiles (L8), advisories and
  outdated majors (L4).
- **Image:** size, SBOM, signing, reproducibility, and tag and version strategy.
- **Startup:** migrations in the entrypoint across replicas.
- **Compose files:** defaults in both (L5).
- **nginx:** SSE buffering and timeouts, body-size limits, headers.
- **Secrets:** management and rotation — what rotating `JWT_SECRET` or
  `MFA_ENCRYPTION_KEY` does to users.
- **`scripts/reset-production-standard.sh`:** what guards a destructive production reset?
- **Upgrades:** the accuracy of `docs/production-upgrade.md`.

**8.13 Documentation**
- README accuracy (L8).
- Completeness of the environment contract.
- Runbooks: deploy, rollback, restore, incident, secret rotation.
- API documentation, user and administrator guides, and a record of architecture
  decisions.

**8.14 Internationalisation and time**
- Hard-coded strings.
- Date and number formatting in about 45 component call sites.
- Time-zone assumptions in display and scheduling.
- Tolerance for text expansion; RTL.

---

# PART 9 — RULES

These exist because audits like this fail in predictable ways.

1. **Evidence or it does not ship.**
   - Every finding carries `file:line` references plus a reproduction, a measurement, or
     — for static findings — a quote of the decisive lines (five at most).
   - Mark confidence honestly: **Verified** (you reproduced it), **Likely** (strong static
     evidence) or **Suspected** (needs a runtime check you could not perform).
   - Every path you cite must exist. If you are unsure of a line number, cite the
     function name.
2. **Grep is a lead, not a conclusion.** Two findings in an earlier audit here were wrong
   for exactly this reason:
   - A webhook delivery-history UI was reported missing; it was served under a different
     query parameter.
   - Icon buttons were reported unlabelled; their accessible names came from element
     content, not an attribute.

   Confirm in the running product whenever you can.
3. **Read before judging.** The code carries extensive comments explaining *why* things
   are the way they are, and several apparent defects are deliberate. If you disagree
   with a documented decision, argue against its stated reasoning; do not report it as an
   oversight.
4. **No fabricated numbers.** If you did not measure it, do not state a figure.
   "Unmeasured" is a valid answer.
5. **Distinguish missing from broken.** "Feature X does not exist" and "feature X
   silently fails" are different findings with different severities.
6. **Severity is about consequence, not effort.** A one-line fix for a data-loss bug is
   still P0.
7. **Read-only on the repository.**
   - Do not modify, commit or push application code, configuration, dependencies or
     documentation.
   - You may create throwaway containers, databases, test data and scratch files outside
     the repository. Git-ignored build output such as `node_modules` and `.next` is fine.
   - The only file you may add to the repository is the report (Part 10).
8. **Test security only against your own local instance.** Never send real email or
   webhooks to third parties.
9. **No secrets or personal data in the report.** That includes the addresses and
   placeholder credentials found in the repository: refer to them by `file:line`.
10. **One root cause, one finding.** List every affected location under it; do not
    repeat the finding per location.
11. **Generic advice is not a finding.** "Add more tests" or "consider caching" without a
    concrete location and consequence belongs nowhere. A gap against the Definition of
    Complete goes in the roadmap, tied to the criterion it fails.
12. **Do not re-report Part 2** except as described there.
13. **State your coverage.** Say which of the 125 routes and 26 views you actually
    exercised, as which roles, in which browsers and at which viewport sizes. An audit
    that implies completeness it does not have is worse than a partial one that says so.

---

# PART 10 — DELIVERABLE

**Where.** If you can write files, write the full report to
`docs/production-readiness/full-audit-<YYYY-MM-DD>.md`, then reply with the executive
summary and the top 10. Otherwise put the full report in your reply. If it does not fit in
one message, end with `— continued in part N —` and resume when asked.

**Structure**

1. **Header.** The commit audited, the date, the environment (Node, PostgreSQL, Redis,
   browsers) and what you ran.
2. **Executive summary** (15 lines at most):
   - Is RabbitFlow complete? Give a 0–10 score for each Definition-of-Complete dimension,
     A–H.
   - The five things that matter most.
   - What breaks first if it launches today.
3. **Baseline:** the Part 3 table, re-run.
4. **Findings:** grouped by severity, then category, using the template below.
5. **Lead verification:** for each of L1–L10, confirmed, refuted or partly confirmed,
   with the finding ID.
6. **Capability matrix:** Part 6, complete.
7. **Definition-of-Complete gaps:** for each of A–H, the gaps, each linked to finding
   IDs or roadmap items.
8. **Scorecard:** one rating per Part 8 area, each with a one-line justification.
9. **Top 10 by impact over effort,** in order, with one sentence on why each ranks above
   the next.
10. **Roadmap to complete.** Waves, each with:
    - its goal;
    - its items: finding IDs plus the Part 2.2 known items, each marked **Code**,
      **Infra** or **Human** (for example a usability study or a restore rehearsal);
    - its dependencies;
    - its effort in engineer-days;
    - its exit criteria.

    Say what each wave unblocks, and where launch is acceptable for an internal audience
    and for external users.
11. **Coverage:** routes (n/125), views (n/26), roles, browsers and viewports exercised.
12. **What I could not check,** and the access each item would need.
13. **Assumptions.**
14. **Appendix:** one JSON object per line per finding:
    `{"id","title","severity","category","confidence","files","effort_days","lead","labels"}`,
    so the findings can be imported as issues.

**Finding template**

```
### AUD-### — Short, specific title
Severity: P0 | P1 | P2 | P3     Category: <one below>     Confidence: Verified | Likely | Suspected
Evidence:   file:line references; the command, request or UI steps; the observed output.
Impact:     who is affected and how. Numbers where you measured them.
Root cause: why it happens.
Fix:        the specific change, plus any alternative worth weighing.
Verify:     the test or check that fails today and passes after the fix.
Effort:     hours or days for one engineer familiar with this stack.
Lead:       L# if it came from Part 4, otherwise "—".
```

**Categories:** data · query · api · feature · flow · ux · a11y · frontend · realtime ·
security · privacy · observability · reliability · testing · ops · release ·
supply-chain · docs · i18n · governance

**Severity**
- **P0:** a security hole, data loss or corruption, or a core journey that cannot be
  completed. Blocks launch.
- **P1:** a materially wrong workflow; a defect users will hit in the first weeks;
  performance that will not hold at expected load; a missing **Must** capability.
- **P2:** friction, inconsistency, a missing **Should** capability, or a maintainability
  risk.
- **P3:** polish.

---

# BEGIN

Write your plan. Then start Phase 0.

Depth over volume. Evidence over intuition. Consequence over cleverness.

**✂ ─────────────── copy to here ───────────────**

---

## Follow-up prompt — turning the report into fixes

Use this only after the audit report exists, in the same session or a new one with
repository write access:

```text
You audited RabbitFlow and wrote docs/production-readiness/full-audit-<date>.md.
Now fix the findings in the order of the report's roadmap, starting with P0 and then P1.

For each finding or tightly related group:
1. Write the test named in its "Verify" line first, and show that it fails.
2. Make the smallest change that fixes the root cause. Do not refactor beyond it.
3. Run typecheck, lint, the unit suite (on Node 22 use --experimental-test-isolation=none),
   the integration suite against a throwaway PostgreSQL, and the production build.
   Run the relevant Playwright specs for UI changes.
4. Commit with the finding ID in the message, then mark the finding in the report with
   the commit SHA.

Stop and ask before any of the following:
- a schema change on a populated table;
- a major-version dependency upgrade;
- a change to authentication or session semantics;
- removing a user-visible feature;
- anything the report marks "Infra" or "Human".

Never disable, skip or weaken a test to make it pass. If a finding turns out to be wrong,
say so in the report and move on.
```
