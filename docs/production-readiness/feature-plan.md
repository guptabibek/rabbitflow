# Feature Inventory and Forward Plan

> Written 2026-09-06, revised 2026-09-07 after the fixes below landed.
> Supersedes the *Phase 6 — Product completion* section of `production-roadmap.md`,
> which was written against a much earlier state of the code.

---

## Part 1 — What exists today

125 API routes back 27 workspace views plus an admin area. The inventory below
groups them the way the product does, and rates how finished each one is.

**Maturity key**

| | Meaning |
|---|---|
| **Solid** | Complete loop: read, write, validation, permissions, empty/error states |
| **Thin** | Works, but a real user hits a wall — missing states, no bulk path, read-only where it should be editable |
| **Partial** | Some of the feature is wired; named sub-capabilities are absent |

### Plan

| Feature | Maturity | Note |
|---|---|---|
| Backlog | Solid | Ordered, filterable, drag-to-rank |
| Board (Kanban) | Solid | Scroll affordance, WIP limits, drag between columns |
| Work items (list) | Solid | Server pagination, sort, saved views, bulk actions |
| Sprints | Solid | Capacity planning and burndown both wired |
| Roadmap | **Thin** | Read-only. No drag-to-reschedule, no dependency overlay |
| Calendar | **Thin** | Displays dates; cannot create or move work from the grid |

### Track

| Feature | Maturity | Note |
|---|---|---|
| Portfolio | **Thin** | Cross-project roll-up with no drill-through to a filtered list |
| Dependencies | **Thin** | Renders the graph; no editing, no cycle warnings surfaced |
| Goals (OKR) | Solid | Objectives and key results both CRUD |
| Approvals | Solid | Request, decide, audit trail |
| Activity | Solid | Paginated, filterable feed |

### Analyse

| Feature | Maturity | Note |
|---|---|---|
| Reports | Solid | Ten report types — executive, work-items, agile, quality, productivity, DORA, forecast, time-tracking, audit, export. The deepest feature in the product |
| Documents | Solid | Markdown with GFM |
| Retrospectives | Solid | |

### Configure

| Feature | Maturity | Note |
|---|---|---|
| Work item types | Solid | Custom fields, per-type workflow |
| States / workflow | Solid | Real state machine; transitions enforced server-side |
| Labels, Teams & members, ACL rules | Solid | |
| Automations | Solid | Rule builder with conditions and actions |
| Webhooks | Solid | Register, edit, and inspect delivery history (expand a row; served by `?deliveries=true`) |
| SLA policies, Recurring tasks, Test plans, Import | Solid | |
| API tokens | Solid | Bearer auth and scopes enforced (BE-004 closed) |
| Branding, Onboarding, Planning config | Solid | |
| **Areas** | Solid *(new)* | Full CRUD screen under Admin → Areas. Previously headless |

### Platform

| Feature | Maturity | Note |
|---|---|---|
| Auth | Solid | MFA secrets encrypted at rest (SEC-014 closed) |
| Admin security | Solid | Sessions, MFA reset, per-user audit |
| Search, Favorites, Saved views, Comments, Git links | Solid | |
| Attachments | Solid | Magic-byte validation, authorised download, `nosniff` |
| Presence / realtime | Solid | SSE via `use-project-collaboration` |
| Notifications | Solid | Bell now subscribes to the SSE stream instead of polling |
| **Notification preferences** | Solid *(new)* | Two-channel × seven-category matrix under Profile → Notifications. Previously headless |

---

## Part 2 — Bugs found and fixed in this pass

Everything here was found by getting the integration and E2E suites running for
the first time. Each was reproduced before being changed.

| # | Defect | Effect | Fix |
|---|---|---|---|
| 1 | **`docker/entrypoint.sh` checked out CRLF** | Any image built on Windows crash-looped on every start: `exec /entrypoint.sh failed: No such file or directory`. CI on Linux never saw it | `.gitattributes` pins `*.sh` to LF; the Dockerfile also strips CR before `chmod +x` |
| 2 | **Due Date carried `min={startDate}`** | An out-of-order date left the control natively `:invalid`, so the browser refused to fire a submit event — no request, no message, Create silently dead. It also made the app's own date check unreachable | Constraint removed; ordering enforced in `handleSubmit`, which switches to the tab holding the fields |
| 3 | **Bulk action refresh stored an object as the issue list** | `/api/backlog` returns `{ projectId, total, tree }`; the list view pushed it straight into the store. Every later `issues.filter(...)` threw and the whole view fell into the error boundary — any bulk action took the list down with it | Refresh from `/api/issues`, guarded with `Array.isArray` |
| 4 | **"Delete project" opened the Edit dialog** | The card menu's destructive item called `openEditProject`, identical to Edit. Deletion was only reachable by hunting for a button inside that dialog | `handleDeleteProject` takes an optional id; the menu item deletes directly |
| 5 | **Onboarding never recorded board/report visits** | `useOnboardingEvents()` is called from the same component that renders `OnboardingProvider`, so it sits above its own provider and always read `null` context. Two checklist steps could never complete and the checklist was stuck at 80% for every user. Predates the redesign | The hook posts the event itself using the store's project, and still refreshes through the context when one is present |
| 6 | **Workers flooded the log when Redis was down** | ~4 multi-line `AggregateError` stacks every 30 s, sustained, per worker — several MB a day from one dependency being down | `createThrottledErrorLogger`: first occurrence logged, repeats collapsed into a periodic summary; a different error still prints immediately |
| 7 | **CI proved nothing about MFA encryption** | The two SEC-014 tests skip themselves without `MFA_ENCRYPTION_KEY`, which CI never set — green, having tested nothing. With a key but no enrolment requirement they fail instead | Both variables set in the CI job; the suite now runs 79/79 with none skipped |
| 8 | **Next dev blocked its own client chunks** | E2E drives `127.0.0.1` while the dev server's origin is `localhost`, so every `/_next/*` chunk was refused. Pages rendered server-side and looked correct, React never hydrated, and forms fell back to native GET submits. One line in the dev log was the only trace | `allowedDevOrigins` in `next.config.ts` (development-only) |

**Design-system drift closed.** Raw Tailwind palette classes went from 203 to
**0** across `src`. They are now semantic tokens (`success`, `warning`,
`danger`, `info`, `chart-*`), so every colour follows the theme.
`reports-view.tsx` alone held 71 of them.

### Two findings from the first draft that were wrong

- **Webhook deliveries are not missing.** They are served by `?deliveries=true`
  on the existing route and rendered in an expandable row. Only an unnamed
  toggle button and two raw palette classes needed fixing.
- **Icon buttons are not unnamed.** All 56 have an accessible name, via
  `aria-label` or `sr-only` text. The earlier count came from a grep that
  could not see names supplied by content.

---

## Part 3 — What still needs work

### A. Thin features

| # | Gap | Why it matters | Est. |
|---|---|---|---|
| **A1** | Roadmap is read-only | Every comparable product lets you drag a bar to reschedule. Today you leave the roadmap, open the item, edit two dates, come back | 3 d |
| **A2** | Calendar cannot create or move work | The same round-trip. Drag-to-reschedule, click-empty-day-to-create | 2.5 d |
| **A3** | Portfolio has no drill-through | A number you cannot click is a dead end; each cell should open the list pre-filtered | 1 d |
| **A4** | Dependency graph is not editable, cycles not surfaced | The graph is where you notice a cycle; it should be where you break it | 2 d |

### B. Correctness and consistency

| # | Gap | Detail | Est. |
|---|---|---|---|
| **B1** | **Six native `confirm()` dialogs remain** | `issue-detail-dialog`, `member-management`, `sprint-management`, `team-management`, `workspace-dashboard-page`, `admin/security`. The repo already has `ConfirmDestructiveDialog` and uses it in eight other places. Native dialogs are unstyled, block the event loop, and cannot explain consequences | 1.5 d |
| **B2** | **The state picker offers transitions the server rejects** | The work-item state dropdown lists every state. Choosing one the workflow forbids fails only on save, with "Invalid workflow transition" | 1 d |
| **B3** | Idempotency keys (API-005) | A retried `POST /api/issues` after a timeout still creates a duplicate. Updates are protected by the version field; creates are not | 1.5 d |
| **B4** | Component tests (TEST-004) | No testing library installed. 270 unit tests cover domain logic; none renders a form or a view | 3 d |
| **B5** | OpenAPI (API-007) | Zod schemas exist on every route and can generate the spec | 1 d |

### C. Architecture

| # | Item | Current state | Est. |
|---|---|---|---|
| **C1** | App Router segments (FE-001b) | Query-param routing gives deep links and history today. Real segments add per-route server data loading and finer code splitting | 5 d |
| **C2** | SSE polls Postgres (BE-003) | ~0.22 queries/sec per connected user. Redis pub/sub is the fix, and Redis is already a dependency | 3 d |

### D. Owned by the team, not by code

Unchanged, and still the reason this cannot take real users:

- **Backups and disaster recovery** (SEC-005 / OPS-002) — nothing exists. Needs nightly `pg_dump` off-host, WAL archiving, and a **rehearsed, dated restore**.
- **TLS** (OPS-003) — needs certificates and a deployment decision.

---

## Part 4 — Suggested order

| Wave | Contents | Days | Rationale |
|---|---|---:|---|
| **1** | D (backups, TLS) | infra | Nothing else matters if the data cannot be restored. Not engineering-blocked; can run in parallel with everything below |
| **2** | B1, B2 | ~2.5 | Two consistency defects users meet on ordinary paths, both small |
| **3** | A1–A4 | ~8.5 | The interaction gaps a user notices in the first week |
| **4** | B3, B5, B4 | ~5.5 | Correctness and contract hardening. B3 is the one that can corrupt data |
| **5** | C1, C2 | ~8 | The two genuine refactors. Do them last, and only with B4's tests in place |

---

## Testing status

| Suite | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | clean |
| Lint (`eslint .`) | clean |
| Domain unit tests | **270/270** |
| Integration tests (real Postgres) | **79/79**, none skipped |
| E2E (Playwright, Chromium) | **14/14** |
| Production build | compiles, exit 0 |

### Running them locally

```bash
# Throwaway database. Integration tests truncate tables, so the name must
# contain "test" — the helper refuses to run against anything else.
docker run -d --name rf-test-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test \
  -e POSTGRES_DB=rabbitflow_test -p 55433:5432 postgres:16-alpine

docker exec rf-test-pg psql -U test -d postgres -c "CREATE DATABASE rabbitflow_e2e_test;"

export JWT_SECRET="local-only-secret-at-least-32-bytes-long-xxxxx"
export MFA_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"

# Integration
DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_test \
TEST_DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_test \
MFA_REQUIRE_ENROLLMENT=true npm run test:integration

# E2E — start the dev server against the e2e database first
DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_e2e_test \
MFA_REQUIRE_ENROLLMENT=false ALLOW_SELF_REGISTRATION=true \
E2E_DISABLE_RATE_LIMITS=true npm run dev

# then, in another shell
DATABASE_URL=postgresql://test:test@localhost:55433/rabbitflow_e2e_test \
E2E_SKIP_WEBSERVER=true E2E_BROWSER_CHANNEL=chrome npm run test:e2e
```

Two knobs exist for local runs and are inert in production:

- `E2E_DISABLE_RATE_LIMITS=true` — registration allows five attempts an hour per
  IP and one E2E pass spends three, so a second run starts failing with 429s
  that look like product faults. Guarded by `NODE_ENV !== 'production'`.
- `E2E_BROWSER_CHANNEL=chrome` — runs against an installed browser instead of
  Playwright's ~280 MB download, which stalls part-way on a slow connection and
  leaves a half-extracted directory that still reports itself as installed. CI
  leaves this unset and uses the pinned build.
