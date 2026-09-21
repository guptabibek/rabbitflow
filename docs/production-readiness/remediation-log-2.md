# Remediation Log — Second Pass

Continues [remediation-log.md](remediation-log.md). Same discipline: every fix
verified against a running instance wherever the behaviour is observable.

## Validation after this pass

```console
npx tsc --noEmit  →  clean
npm run lint      →  clean (was 2 errors — fixed, not suppressed)
npm test          →  243 passing, 0 failing (was 221)
npm run build     →  Compiled successfully
```

---

## Closed — P0

### SEC-002 · Redis outage broke login permanently — root cause fixed

**Files:** `prisma/schema.prisma`, migration `20260905120000_auth_challenges_in_database`,
`src/lib/auth-otp.ts`, `api/auth/password-reset/confirm/route.ts`, `api/cron/route.ts`

MFA challenges and password-reset OTPs moved from Redis to a new `AuthChallenge`
table. Authentication state must not live in a cache whose writes are silently
dropped.

Improved while relocating:

- **OTPs stored as SHA-256 digests**, never in the clear — the Redis version stored
  the plaintext code.
- Issuing a challenge **supersedes** any earlier in-flight one for that user.
- Consumed challenges are marked, not deleted, then swept by the cron job
  (`purgeExpiredAuthChallenges`) so the table stays bounded.
- Password-reset challenges keyed by **user id**, not email, so changing an address
  cannot orphan an in-flight reset.

**Verified with Redis stopped:** a non-admin completed full MFA enrolment and sign-in
(`HTTP 200`, then an authenticated `/api/auth/me`). Previously verification returned
"MFA session expired" forever. `/api/health/ready` correctly reported **503** throughout.

---

## Closed — P1

### SEC-006 · Webhook SSRF with a read primitive

**Files:** `src/lib/domain/url-safety.ts` (new), `webhook-service.ts`, both webhook routes

- Scheme allow-list (`https`; `http` only for explicitly configured hosts).
- DNS resolution with **every** returned address checked against loopback, RFC-1918,
  link-local (incl. `169.254.169.254`), CGNAT, multicast and reserved ranges —
  including IPv4-mapped IPv6 (`::ffff:10.0.0.1`), which would otherwise smuggle a
  private address past an IPv6-naive check.
- Embedded credentials rejected.
- Re-validated **at delivery time**, not only at configuration time: DNS for a
  previously-public host can be repointed later.
- `redirect: 'manual'` — a public URL that 302s to the metadata service would
  otherwise defeat the address checks.
- **Response bodies are no longer persisted.** This was the actual read primitive:
  4 KB of the receiver's response was stored and rendered in the management UI.

**Verified:** metadata service, loopback, all RFC-1918 ranges, `localhost`, `[::1]` and
credentialed URLs each rejected with a specific reason; `https://example.com` accepted.
9 regression tests in `tests/domain/url-safety.test.ts`.

### SEC-007 · User deletion cascade-deleted work items

**Files:** `prisma/schema.prisma`, migration `20260905130000_protect_user_history_from_cascade`,
`api/users/[userId]/route.ts`

`Issue.reporter`, `Attachment.user` and `Comment.author` changed from `Cascade` to
`Restrict`. `DELETE /api/users/{id}` now **deactivates**: revokes sessions,
invalidates MFA challenges, writes a `SecurityAuditEvent`, refuses self-deactivation.

**Verified:** issue count unchanged (13 → 13) across a deactivation that previously
would have destroyed them; a raw `DELETE FROM "User"` is now refused by the database
itself with a foreign-key violation.

### SEC-012 · No rate limiting

**Files:** `src/lib/rate-limit.ts` (new), 5 auth routes, `api/search`, nginx template

Redis-backed fixed-window limiter with a bounded in-process fallback. Applied to login
(per IP+email), registration, password-reset request/confirm, MFA verify (per
challenge), and search (per user). nginx adds `limit_req_zone` / `limit_conn_zone` at
the edge.

**Verified:** login returns `401 ×10` then `429 ×3`.

### SEC-013 · Area ACLs bypassed by search

**File:** `src/lib/domain/search-service.ts`

`resolveSearchAreaScope` collapses per-project area ACLs into a SQL predicate applied
to both the issue and comment searches — comments inherit their work item's ACL, so a
restricted area's discussion would otherwise leak even with the item itself filtered out.

### API-002 / API-003 · 401 where 403 belonged

**Files:** `src/lib/domain/auth.ts`, `api/rbac/route.ts`

`resolveActorContextResult` now distinguishes `unauthenticated` from `not-a-member`, so
a valid session hitting a project it does not belong to receives **403**. Clients treat
401 as a dead session, so this was signing users out of the entire product on a stale
link. `/api/rbac` returns 403 for non-members instead of 200 plus a Viewer permission set.

**Verified:** every probed project endpoint returns 403; `/api/rbac` returns 403.

### BE-004 · API tokens authenticated nothing

**Files:** `src/lib/domain/api-token.ts` (new), `domain/auth.ts`, `src/proxy.ts`,
`api/api-tokens/route.ts`, `api-token-management.tsx`

Bearer tokens now authenticate: hash lookup, revocation and expiry checks,
owner-active check, scope enforcement (`read` = safe methods, `write` = mutations),
throttled `lastUsedAt`. The proxy forwards bearer-bearing `/api/` requests — never page
routes, never `/api/admin` — so they reach the handler that validates them.

The UI advertised seven fine-grained scopes (`issues:read`, `admin`, …) that no server
code ever checked; it now offers the two that are real and defaults to read-only.

**Verified:** read-only token → `GET` 200, `POST` 403 `TOKEN_SCOPE_INSUFFICIENT`;
read-write token → `POST` 201; bogus token → 401; `lastUsedAt` populates.

### BE-001 · Fire-and-forget side effects

**Files:** `src/lib/job-queue.ts` (new), `instrumentation.ts`, 11 route files

Webhook delivery, SLA timer attachment and assignment email moved onto a BullMQ queue
with 5 attempts and exponential backoff. All 21 `void domainCall()` sites replaced with
signature-compatible `queue*` wrappers, so call sites changed only in name.

Enqueue failure falls back to inline execution and **always logs** — previously these
promises were neither awaited nor logged, so an SLA timer could silently never attach.

**Verified:** creating a work item enqueues and completes jobs in Redis.

### BE-010 · No graceful shutdown

**File:** `src/instrumentation.ts`

`SIGTERM`/`SIGINT` close both workers and disconnect Prisma. Registered with `once` so a
second signal terminates rather than re-entering the handler.

### BE-005 / BE-006 · Query waste on hot paths

**Files:** `domain/auth.ts`, `api/issues/route.ts`, `domain/search-service.ts`

- `checkActorPermission` reuses an already-resolved actor. `POST /api/issues` resolved
  the full auth chain **three times** (~15 queries) before writing a row.
- `?search=` now uses the `Issue.searchVector` tsvector index (which existed and was
  unused) plus a prefix match on issue key, instead of un-indexable `ILIKE '%term%'`.

### OPS-001 · No CI

**File:** `.github/workflows/ci.yml` (new)

Five jobs on every push and PR: static (typecheck + lint + unit), migrations (applied
to a clean Postgres, plus a `migrate diff` check that catches a schema edit with no
migration), build, E2E with Postgres and Redis services, and `npm audit`.

---

## Closed — P2 and UI defects

| ID | Fix |
|---|---|
| **UX-010** | **`bg-status-*-bar` tokens were never defined.** Referenced in four places — the Reports status chart, dashboard status bars, Kanban column dots and `ui-tokens.ts` — so Tailwind emitted no class and every one rendered colourless. Defined once in `@theme`; all four now render. |
| **UX-002** | Board scroll affordance: edge fade driven by a `ResizeObserver`-tracked `data-overflowing` flag, plus a persistent scrollbar. Verified `scrollWidth 1376 > clientWidth 1156 → overflowing=true`. The CSS had to move out of `@layer utilities`, where the `::after` rules never applied. |
| **UX-006** | Sidebar footer clipped: `flex-1` resolves `min-height: auto`, so the nav refused to shrink and pushed "New Work Item" off-screen. Added `min-h-0`. Verified button bottom at 892px in a 900px viewport. |
| **UX-009** | Issue keys sorted as strings (`-1, -10, -11, -2`). `compareIssueKeys` compares the numeric suffix. Verified `RABBIT-1 … RABBIT-8` in order. |
| **UX-005** | All 12 delete actions now confirm, via a shared `ConfirmDestructiveDialog` naming the object and its blast radius. Eight previously deleted on a single click. |
| **FE-002** | `global-error.tsx`, `error.tsx`, `not-found.tsx` added — there were no error boundaries at all, so any render error blanked the whole app. |
| **UX-008b** | `logo.svg` 404'd on every page load: the file did not exist, and the proxy matcher gated `public/` assets so it 307'd to login. Added the file and narrowly exempted branding assets — `/uploads/**` stays gated (verified: still 307). |
| **SEC-015** | Password reset revokes all sessions. |
| **SEC-018** | `ALLOW_HEADER_AUTH` hard-disabled when `NODE_ENV=production`, with a startup error. |
| **OPS-005** | `src/lib/env.ts` validates configuration at startup — throws in production, warns in development. `JWT_SECRET` must be ≥32 bytes; the old code silently accepted an **empty** key. |
| **MFA blast radius** | Three admin routes called `invalidateAllMfaChallenges()`, wiping *every* user's in-flight challenge when resetting one user. Now scoped to the target user. |
| **lint** | The 2 `react-hooks/set-state-in-effect` errors fixed properly — `useSyncExternalStore` for the location read, and a cancellation guard replacing a redundant synchronous `setLoading(true)`. Not suppressed. |

---

## Still open

| ID | Finding | Why not in this pass |
|---|---|---|
| **SEC-005 / OPS-002** | No backups or DR | Infrastructure task, not a code change |
| **OPS-003** | No TLS | Needs certificates and a deployment decision |
| **SEC-001b** | Uploads served from `public/` without per-file authorization | Content validation and CSP remove the code-execution vector; per-file authorization needs a download route and a storage migration |
| **SEC-014** | MFA secrets plaintext at rest | Needs a key-management decision and a re-encryption migration |
| **FE-001 / UX-001** | No routing — no deep links, no code splitting | ~5-day refactor; too large to land safely alongside this batch |
| **FE-003 / UX-004** | 200-item cap, client-side filtering | Needs server-side pagination *and* list virtualisation together |
| **BE-002** | Lazy provisioning on the read path | Needs a data migration, not an in-place edit |
| **TEST-002/3/4** | No authorization, API or component tests | The largest remaining gap. Unit coverage grew 155 → 243 but still covers no route |
