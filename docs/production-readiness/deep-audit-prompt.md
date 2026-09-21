# Master Prompt — Exhaustive Shortcoming Audit

> Paste everything below the line into the analysing agent. It is written to be
> model-agnostic. Keep it intact: the constraints in **Part 7** are what stop an
> audit like this from returning confident nonsense.

---

# MISSION

You are a principal engineer conducting an **exhaustive audit** of a production
codebase. Your job is to find **everything that is wrong, missing, slow,
inconsistent, or unfinished** — and to prove each finding.

This is not a code review of a diff. It is a full-system audit across data,
API, backend, frontend, UX, performance, security, reliability, operations,
testing and documentation.

The person commissioning this already knows the product works. They want to know
**where it falls short of a serious commercial product**, in priority order, with
enough evidence to act without re-investigating.

---

# PART 1 — THE SYSTEM

Read this before exploring, so you do not spend your budget rediscovering it.

**RabbitFlow** — an Agile project-management product (work items, boards,
backlog, sprints, OKRs, approvals, test plans, SLAs, reports, RBAC).
Self-hosted, single-tenant-per-deployment, Docker Compose behind nginx.

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind v4 (CSS-first `@theme`), shadcn/ui over Radix primitives |
| Client state | zustand (`src/store/app-store.ts`) |
| Data | PostgreSQL 16 via Prisma 6 (`prisma/schema.prisma`, 22 migrations) |
| Jobs / cache | BullMQ + Redis, with inline fallbacks when Redis is absent |
| Mail | nodemailer (SMTP) |
| Tests | `node:test` (unit + integration), Playwright (E2E) |
| Runtime | Node 22, `output: "standalone"` |

**Shape of the codebase**

- `src/app/api/**/route.ts` — **125 route handlers**
- `src/app/page.tsx` — the workspace. **One ~1,250-line client component** holding
  **27 views**, switched by a `?view=` query parameter (`src/hooks/use-view-route.ts`)
- `src/components/project-management/**` — ~57 feature components, several 700–2,000 lines
- `src/components/ui/**` — design-system primitives
- `src/lib/domain/**` — the domain layer (services, RBAC, state machine, schema defaults)
- `src/lib/**` — infrastructure (db, auth, email, queues, rate limiting, crypto)
- `docs/production-readiness/**` — **17 prior audit documents (this prompt is the 18th file). Read them first.**

---

# PART 2 — WHAT IS ALREADY KNOWN

**Do not spend effort re-reporting these.** They are documented, accepted, and
either scheduled or deliberately deferred. Read
`docs/production-readiness/production-roadmap.md`,
`remediation-log{,-2,-3}.md` and `feature-plan.md` for the full record.

Known and still open:

- No backups or disaster recovery; no TLS termination. Both are infrastructure decisions, not code.
- `src/app/page.tsx` is a 27-view monolith on query-param routing rather than App Router segments.
- No component/render tests — no testing library is installed.
- No idempotency keys: a retried `POST /api/issues` after a timeout duplicates.
- No OpenAPI spec, though every route has a zod schema that could generate one.
- SSE endpoints poll Postgres instead of using Redis pub/sub.
- Six remaining native `confirm()` dialogs where a shared `ConfirmDestructiveDialog` already exists.
- The work-item state picker offers every state, including transitions the server rejects.
- `Issue.status` duplicates `Issue.stateId` by deliberate design, without a DB constraint tying them.

**You may report these only if you find a *specific, previously undocumented
consequence*** — e.g. a concrete query the monolith makes redundantly on every
view switch. Naming the known item again adds nothing.

---

# PART 3 — WHAT TO AUDIT

Cover every heading. For each, the questions are prompts, not a checklist to
answer one line at a time — go and look.

## 3.1 Data model and schema

- Fields the product clearly needs and does not have. Work backwards from the UI and from user questions the data cannot answer ("who changed this?", "when did it enter this state?", "how long was it blocked?").
- Missing constraints: nullable columns that are never legitimately null, absent unique constraints, missing foreign keys, enums modelled as free text, check constraints absent where an invariant exists.
- Cascade behaviour. For every relation, what happens on parent delete, and is that what the product wants? Look specifically for paths where deleting a person destroys history.
- Denormalised or duplicated fields that can drift, and whether anything reconciles them.
- Indexes: present but unused, absent but needed, redundant prefixes of composite indexes, missing partial indexes for soft-deleted or archived rows.
- Timestamps and time zones: is everything UTC, is anything stored as a naive local date, do sprint boundaries and SLA timers agree on what "a day" means?
- Unbounded growth: which tables grow forever, what prunes them, and is pruning proven by a test?
- Soft delete vs hard delete consistency across entities.
- Migration hygiene: does the schema match the migration history, are indexes created `CONCURRENTLY` on populated tables, is any migration destructive without a guard?

## 3.2 Query performance

- **N+1 patterns.** Every `findMany` followed by per-row work. Prisma `include`/`select` shapes that over-fetch.
- Queries inside loops, including inside `Promise.all` over a collection.
- Unbounded reads: any query with no `take`, especially on tables that grow.
- Aggregation on the read path: the reports endpoints run multi-table aggregates — measure them, and check for caching, caps and timeouts.
- Sequential awaits that could be concurrent, and concurrent queries that should share one transaction.
- Missing pagination, or pagination by `OFFSET` where a cursor is needed.
- Work repeated per request that could be memoised or cached, and cache invalidation that is missing or too broad.
- Connection pool sizing against the configured `DATABASE_CONNECTION_LIMIT`, and behaviour under saturation.
- **Prove it.** Turn on Prisma query logging, exercise the endpoint, count the queries, and report the number. `EXPLAIN ANALYZE` the expensive ones.

## 3.3 API surface

- Contract consistency across all 125 routes: does a list endpoint sometimes return an array and sometimes `{ items: [] }`? Are errors always the same envelope? Are status codes right (401 vs 403, 404 vs 403 for non-members, 409 for conflicts, 422 vs 400)?
- Validation coverage: any handler parsing `request.json()` without a schema.
- Authorization on **every** route, including the ones that look harmless. Check that project-scoped resources verify membership, not just authentication, and that IDs from the body cannot cross a tenant boundary.
- Response shape vs what the client actually consumes — mismatches are where the crashes live.
- Mutating endpoints without optimistic-concurrency protection.
- Bulk endpoints: partial-failure semantics, and whether the client is told which rows failed.
- Rate limiting coverage beyond the auth endpoints.
- Anything returned to an unauthenticated caller that describes the deployment.

## 3.4 Feature completeness

- **Headless backends**: routes with full CRUD that no UI reaches. Enumerate every endpoint and grep the client for callers. Two such features were found and shipped recently; look for more.
- **Orphan UI**: controls that call nothing, or that call an endpoint which ignores the parameter.
- Incomplete CRUD: entities you can create but not rename, or delete but not restore.
- Per-role completeness: for each of the six project roles, walk the product and find capabilities that are visible but forbidden, or permitted but unreachable.
- Features that exist for one entity and are conspicuously missing for a sibling (comments on X but not Y; attachments here but not there).
- Configuration that is declared and never read. **A generalisable probe that has already found real bugs here:** take every environment variable named in `.env.example`, the compose files and the CI workflow, and grep `src/` for each one. Anything set but unread is either dead config or a feature silently not working.

## 3.5 Feature flows

Walk each journey end to end as a user, not as a reader of code:

- Sign-up → first project → first work item → first sprint → first report.
- Triage: find a bug, assign it, move it through the workflow, close it.
- Sprint: plan, capacity, commit, run, complete, retrospective.
- Approval: request, decide, and what happens when the approver is unavailable.
- SLA: breach approaching, breached, resolved.
- Import: map, dry run, commit, and what happens on partial failure.
- Offboarding: a person leaves — what happens to their assignments, comments, approvals and sessions.

For each, count the clicks and the page loads. Note every dead end (a number you
cannot click, a state you cannot leave), every round-trip the product forces
(leave this screen to change a field and come back), and every point where the
system knows something and does not tell you.

## 3.6 UI and UX

- Information architecture: is anything findable only by knowing it exists?
- Visual hierarchy per screen: what the eye lands on first, and whether that is the most important thing.
- Information density: tables and operational views should be dense; forms and onboarding should breathe. Find where it is inverted.
- The complete state matrix for every meaningful component: default, hover, focus, active, selected, disabled, loading, empty, error, partial. Missing states are the usual finding — especially *partial* (some data loaded, some failed).
- Empty states that say "no data" instead of explaining what would fill them.
- Loading: spinners where skeletons belong, layout shift on load, no optimistic feedback on mutations.
- Errors: anything that surfaces only as a toast and is then unrecoverable; raw technical text shown to end users.
- Forms: validation timing, all errors at once vs one at a time, focus management to the first invalid field, unsaved-changes protection, whether server-side rules are mirrored client-side.
- Tables: column priority at narrow widths, sort/filter discoverability, bulk-selection affordances, row-action discoverability, what happens at 10,000 rows.
- Filters: whether active filters are visible, clearable, and shareable via URL.
- Dialogs and drawers: sizing against content, scroll behaviour, nested-overlay handling, escape and focus-return.
- Responsive behaviour at 360, 768, 1024, 1440 and 2560 px — not just "does it fit" but "is the interaction right for that size".
- Consistency: same concept, same treatment everywhere. Hunt for divergent spacing scales, duplicate button variants, mixed icon metaphors, inconsistent date and number formatting.
- Copy: terminology drift between screens, and between UI and emails.

## 3.7 Accessibility

Keyboard reachability of every interactive control; visible focus throughout;
correct roles and names on custom widgets; form label association; error
announcement to assistive technology; contrast in both themes including disabled
and placeholder text; reduced-motion support; touch target sizes; heading order;
landmark structure; and whether any information is carried by colour alone.

## 3.8 Frontend architecture and performance

- Client/server component boundaries: work done on the client that belongs on the server, and `'use client'` applied higher than necessary.
- Bundle composition per route; the cost of the heaviest dependencies; anything large loaded eagerly that is used rarely.
- Re-render behaviour: store subscriptions that are too broad, unstable callback and object identities, list rendering without keys or virtualisation.
- Data fetching: waterfalls, refetching what is already in the store, no request deduplication, no cancellation on unmount.
- Memory and listener leaks: intervals, `EventSource`, subscriptions and observers without teardown.
- Error boundaries: their coverage, and whether a failure in one panel can take down a whole view.
- Dead code: unused exports, unreferenced components, unused dependencies in `package.json`.

## 3.9 Realtime and background work

SSE lifecycle — reconnect, backoff, duplicate connections per tab, cost per
connected user. Job durability: retries, dead-lettering, idempotency of handlers,
what happens to work enqueued while Redis is down, whether the inline fallbacks
can lose an effect silently. Cron correctness under more than one app replica
(leader election). Graceful shutdown and in-flight work.

## 3.10 Security and privacy

Authorization at the row level, not just the route. Token and session lifecycle,
revocation, and what a stale role permits. Secret handling and anything logged
that should not be. File upload validation and authorised serving. SSRF on any
outbound request the user can influence. Injection surfaces including raw SQL
and any dynamic Prisma filter built from input. Rendered user content and XSS.
CSRF posture. Security headers and CSP. Audit-trail completeness for
administrative actions. PII: what is stored, whether it can be exported, and
whether it can be deleted.

## 3.11 Observability

Whether a production failure can be diagnosed from what is emitted. Structured
logs vs `console.error`; correlation IDs through the whole request path;
metrics for latency, error rate, queue depth, pool utilisation; health checks
that distinguish liveness from readiness; alerting; and log volume under failure
(a dependency being down should not produce megabytes of repeated stacks).

## 3.12 Reliability

Behaviour when Postgres, Redis or SMTP is unavailable — degraded, or broken?
Timeouts and retries on every outbound call. Partial-failure handling in
multi-step operations, and whether they are atomic. Idempotency of anything a
client may retry.

## 3.13 Testing

Coverage by layer and by risk, not by line count. Which of the 125 routes have
no test. Which user journeys are unverified. Tests that pass without asserting
anything meaningful, tests that skip themselves silently, and tests that depend
on execution order or shared mutable state. Whether CI runs on the same runtime
as production.

## 3.14 Operations and documentation

Reproducibility of a deployment from a clean machine. Whether the image can
start from scratch against an empty database. Runbook coverage for deploy,
rollback, restore and incident response. Whether the environment contract is
complete and accurate. Whether `README` claims match observed behaviour. Version
alignment between local, CI and the runtime image.

## 3.15 Internationalisation and formatting

Hardcoded strings, hardcoded date and number formats, time-zone assumptions in
display and in scheduling, currency handling if present, and text expansion
tolerance in the layout.

---

# PART 4 — HOW TO WORK

1. **Read the existing audits first.** Seventeen documents in `docs/production-readiness/` record what has already been found, fixed and deferred. Duplicating them wastes the budget.
2. **Read the schema and the route list next.** They define the system's true surface.
3. **Then run it.** Static reading alone produces false findings. Start the app, exercise the flows, watch the network tab, the console and the server log. Turn on Prisma query logging for the performance work.
4. **Run the test suites.** They encode intent, and their gaps are findings in themselves.
5. **Reproduce before reporting.** A finding you have not observed is a hypothesis.
6. **Prefer depth over breadth once you have the map.** Twenty proven findings beat two hundred plausible ones.

**Commands**

```bash
npm ci && npx prisma generate

npx tsc --noEmit          # types
npm run lint              # lint
npm test                  # 270 unit tests

# Integration and E2E need a throwaway Postgres. The integration helper
# truncates tables and refuses any database whose name lacks "test".
docker run -d --name rf-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \
  -e POSTGRES_DB=rabbitflow_test -p 55433:5432 postgres:16-alpine
docker exec rf-test-pg psql -U test -d postgres -c "CREATE DATABASE rabbitflow_e2e_test;"

export JWT_SECRET="local-only-secret-at-least-32-bytes-long-xxxxx"
export MFA_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"

DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_test \
TEST_DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_test \
MFA_REQUIRE_ENROLLMENT=true npm run test:integration     # 79 tests

# E2E: start the dev server against the e2e database, then run Playwright.
DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_e2e_test \
MFA_REQUIRE_ENROLLMENT=false ALLOW_SELF_REGISTRATION=true \
E2E_DISABLE_RATE_LIMITS=true npm run dev

DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_e2e_test \
E2E_SKIP_WEBSERVER=true npm run test:e2e                 # 14 tests
```

All six checks pass on the current commit. **If something fails for you, that is
your first finding** — say so, with the output.

---

# PART 5 — OUTPUT FORMAT

One entry per finding. No prose essays around them.

```
### [ID] Short, specific title

**Severity:** P0 blocker | P1 serious | P2 moderate | P3 minor
**Category:** data | query | api | feature | flow | ux | a11y | frontend |
              realtime | security | observability | reliability | testing | ops | i18n
**Confidence:** Verified (I reproduced it) | Likely (strong static evidence) |
                Suspected (needs a runtime check I could not perform)

**Evidence:** file:line references, and the command or steps that show it.
**What happens:** the observable behaviour or measurement. Numbers where numbers apply.
**Why it matters:** the user-visible or operational consequence. If there is none, drop the finding.
**Fix:** the specific change, and any alternative worth weighing.
**Effort:** hours or days for one engineer familiar with this stack.
```

Then, at the end:

1. **Scorecard** — a rating per Part 3 section, each with a one-line justification.
2. **Top 10 by impact-over-effort**, ordered, with a sentence on why each is above the one below it.
3. **Sequenced plan** — waves with dependencies and rough duration, explaining what each wave unblocks.
4. **What I could not check** — anything you could not reach, and what access it would need. Be explicit; a silent gap is worse than a stated one.

---

# PART 6 — SEVERITY

- **P0** — data loss or corruption, a security hole, or a core journey that cannot be completed.
- **P1** — a workflow that fails or is materially wrong; performance that will not hold at expected load; a defect that will be hit in the first week of real use.
- **P2** — friction, inconsistency, or a gap against a reasonable commercial expectation.
- **P3** — polish.

Severity is about **consequence**, not effort. A one-line fix for a data-loss bug is still P0.

---

# PART 7 — RULES

These exist because audits of this kind fail in predictable ways.

1. **Evidence or it does not ship.** Every finding carries a file reference and either a reproduction or a measurement. Mark honestly as Verified, Likely or Suspected. A wrong finding costs more than a missed one, because it burns trust in the whole report.
2. **Grep is a lead, not a conclusion.** Absence of a string does not prove absence of a feature. Two findings in the last audit here were wrong for exactly this reason: a delivery-history UI was reported missing when it was served under a different query parameter, and icon buttons were reported unlabelled when their names came from element content rather than an attribute. Confirm in the running product.
3. **Do not report the known list** in Part 2 without a new, specific consequence.
4. **Read before judging.** This codebase carries extensive comments explaining *why* a thing is the way it is. Several apparent defects are deliberate and documented. If you disagree with a documented decision, argue against the stated reasoning rather than reporting it as an oversight.
5. **No fabricated numbers.** If you did not measure it, do not state a figure. "Unmeasured" is a valid answer.
6. **Distinguish missing from broken.** "There is no roadmap drag-to-reschedule" and "drag-to-reschedule silently fails" are different findings with different severities.
7. **Do not change code.** This is an audit. Propose; do not edit.
8. **Report the boring findings too.** A missing index and an inconsistent status code are worth more than a speculative architecture critique.
9. **State your coverage.** Say which of the 125 routes and 27 views you actually exercised. An audit that implies completeness it does not have is worse than a partial one that says so.

---

# BEGIN

Start with `docs/production-readiness/`, then `prisma/schema.prisma`, then the
route list. Build the map before you form opinions. Then run the application and
go looking.

Depth over volume. Evidence over intuition. Consequence over cleverness.
