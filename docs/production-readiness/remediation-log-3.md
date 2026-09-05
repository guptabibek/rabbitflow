# Remediation Log — Third Pass

Continues [remediation-log-2.md](remediation-log-2.md). This pass closed the
architectural and product gaps deferred earlier, excluding backups/DR and TLS,
which the team is handling.

## Validation

```console
npx tsc --noEmit         →  clean
npm run lint             →  clean
npm test                 →  270 passing   (155 at audit)
npm run test:integration →   79 passing   (0 at audit)
npm run build            →  Compiled successfully
docker build             →  succeeds, non-root, with a readiness HEALTHCHECK
```

---

## Testing — the audit's largest gap

`tests/integration/` runs **79 tests against a real PostgreSQL database**,
covering the layers that had none. See
[testing-audit.md](testing-audit.md#update--integration-suite-added-2026-09-05).

| Suite | Tests | Covers |
|---|---:|---|
| authorization | 18 | 6 roles, cross-project isolation, session and account state |
| auth-flow | 14 | login, lockout, rate limits, MFA, challenge durability, logout |
| issues-api | 17 | CRUD, optimistic locking, validation, pagination, search |
| api-token | 12 | bearer auth, scopes, revocation, expiry, privilege ceiling |
| attachments | 8 | storage location, per-file authorization, upload validation |
| provisioning | 4 | version stamping, query cost, on-demand repair |
| retention | 4 | sweep windows, unread preservation, empty-sweep no-op |
| mfa-encryption | 2 | seeds encrypted at rest, legacy plaintext upgraded |

They deliberately do not mock Prisma: a mocked client would pass every
authorization assertion while the real query returned another tenant's rows.

---

## Frontend architecture

### FE-001 / UX-001 · Views had no URLs

All 27 views shared one `useState` and rendered at `/`. Nothing could be linked,
bookmarked or opened in a new tab; Back exited the application; a refresh always
landed on Dashboard.

Views are now backed by `?view=`. Navigation pushes history, Back and Forward
work, and a deep link opens the view it names. An unknown view falls back and
tidies itself out of the URL.

**This is query-parameter routing, not App Router segments.** It buys deep links
and history. Real segments would additionally allow server-side data loading per
route, and remain the better end state.

### PERF-001 · A single 1.17 MB chunk

Every view was statically imported, so a user landing on the dashboard parsed
Reports, SLA, Imports and the 2,000-line work-item-type editor first. Twenty-one
navigation-only views are now loaded on demand behind a skeleton.

**Largest chunk 1167 KB → 485 KB.** The shell, dashboard, board, list and
backlog stay eager — they are the landing surfaces.

### FE-003 / UX-004 · Silent truncation

The client loaded a capped page of work items and every view filtered, sorted
and searched *that array*. A project with more items than the cap showed an
incomplete board with nothing to say so, and search only searched the loaded
window.

The bootstrap endpoint now returns the true total. Views show
"Showing 200 of 250 work items" with **Load more**, plus **Search all**, which
pushes the active filters to the server so a query covers the whole project.

Verified against a seeded 250-item project: the notice appears, Load more
reaches 250, the notice disappears.

### FE-006 · A filter predicate that disagreed with itself

The same logic was duplicated across List View and the board, and the copies had
drifted — the board honoured `filters.type` and searched descriptions, the list
did neither. Applying a filter and switching view gave different results, with
nothing to indicate which was right. One implementation now, 16 unit tests.

The filter bar's local `hasActiveFilters` had the same problem: it omitted
`areaId`, so an area-only filter left the Clear control hidden.

---

## Security

| ID | Fix |
|---|---|
| **SEC-001b** | Uploads moved out of `public/` behind authorising routes. A non-member fetching an attachment now gets 403; before, any authenticated user who learned the URL could read it. Avatars use a deterministic per-user filename, so no client-supplied name reaches the filesystem on a read — and a new upload replaces the old file instead of leaking one per change. |
| **SEC-014** | TOTP seeds encrypted with AES-256-GCM. Adoption is gradual: without a key values pass through unchanged; with one, legacy plaintext still authenticates and upgrades in place on next verify. No flag day, no lockout risk. |
| **SEC-021** | The proxy gated `/admin` on the token's `role`, baked in at sign-in for 30 days. Denying on it bounced a *promoted* user until their token refreshed, while a demoted admin was caught anyway by `AdminLayout` and `requireSystemAdmin`, both of which re-read the database. The stale check is gone; access is still decided against the database. |
| **SEC-022** | nginx set `X-Forwarded-For` with `$proxy_add_x_forwarded_for`, which appends to whatever the client sent while the application reads the first entry — so a client could choose the IP recorded on sessions, audit events and rate-limit buckets. Now `$remote_addr`. |

---

## Backend and operations

| ID | Fix |
|---|---|
| **BE-002** | Provisioning ran as a lazy self-heal on 13 read paths: 10 parallel COUNTs per project per process every 5 minutes, with an in-process cache so the cost multiplied by replica count. Projects now carry a `systemRecordsVersion` stamp — **measured with query logging: one SELECT, down from ten COUNTs** — and a backfill script upgrades existing projects deliberately. |
| **BE-004** | API tokens authenticated nothing. Bearer auth implemented with real read/write scope enforcement. The UI advertised seven scopes no server code checked; it now offers the two that are real. |
| **API-001 / BE-007** | Errors took four shapes, one of which echoed `error.message` from a 5xx. Responses now carry a machine-readable `code` and a `requestId` alongside the existing `error` string. Validation reports **every** issue rather than only the first. |
| **BE-008** | A correlation id is minted in the proxy and shared by every handler in a request. Unexpected exceptions log structured JSON against it and return a generic message plus the id. An inbound `x-request-id` is overwritten. |
| **DB-005** | `Activity`, `Notification`, `WebhookDelivery`, `AutomationLog` and expired sessions grew forever. Swept on a configurable schedule, batched and capped per run. Windows reflect purpose: delivery logs 30 days, Activity 365 because it is the audit trail, unread notifications never. |
| **PERF-010** | All ten report endpoints run whole-project aggregations and none were throttled. Now rate limited per user, after the permission check. |
| **OPS-007** | Removed a redundant `node_modules` copy-and-prune that `output: "standalone"` already covers; added a readiness `HEALTHCHECK`; tightened `.dockerignore`. Doing so surfaced that `playwright.config.ts` was being type-checked during the production build. |

---

## Product and UX

| ID | Fix |
|---|---|
| **UX-013** | **Saved Views shipped.** Model and full CRUD had existed since the schema was written with no interface — the feature was invisible. Verified end to end: filter → save → persists with the exact payload → reapply. |
| **UX-003** | The create form rejected on a required field living on a hidden tab, via a toast in the far corner, one field per round-trip. It now validates client-side, badges the tab with a count, switches to it on submit, and names every missing field at once. No wasted POST. |
| **UX-014 / FE-008** | **31 icon-only buttons had no accessible name** — including Revoke API token and Delete SLA policy. All 31 labelled; count verified at zero. |
| **UX-011** | The mobile sidebar stayed open on top of the view it had just loaded. Closes on navigation below `md`. |
| **UX-007** | The onboarding checklist occupied two thirds of the dashboard. Expands only below three completed steps; the choice is remembered per project. |
| **UX-012** | The in-project dashboard showed a "Projects: 1" tile. Replaced with open work item count. |
| **FE-004** | 16 packages had zero references, including `next-auth`, `next-intl`, `@tanstack/react-query` and the unvetted `z-ai-web-dev-sdk`. Six shadcn wrappers imported by nothing were the only thing keeping several alive. 74 → 58 runtime dependencies. |

---

## Still open

**Owned by the team:** backups and disaster recovery (SEC-005 / OPS-002), TLS
(OPS-003). Both need infrastructure decisions rather than code.

**Deferred, with reasons:**

| ID | Finding | Why |
|---|---|---|
| FE-001b | App Router segments | Query-param routing delivers deep links and history. Real segments additionally enable per-route server-side data loading — worth doing, but a larger refactor than this pass warranted. |
| TEST-004 | Component tests | No testing library installed. The shared filter predicate is now extracted and unit-tested, which was the highest-value target; the remaining gap is form and view rendering. |
| API-005 | Idempotency keys | A retried `POST /api/issues` after a timeout still creates a duplicate. Updates are protected by the version field; creates are not. |
| API-007 | OpenAPI | Zod schemas exist on every route and could generate one. |
| UX-015 | Design-system drift | 218 raw palette classes bypass the token system, 74 without a `dark:` variant. Mechanical but broad. |
| DB-004 | `status` / `stateId` duplication | Deliberate and consistently applied; wants a database constraint rather than unwinding. |
| BE-003 | SSE polls the database | Redis pub/sub is the fix. ~0.22 queries/sec per connected user today. |
