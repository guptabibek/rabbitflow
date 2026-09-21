# Risk Register

> Audit date 2026-09-05 · commit `adfd7b1`
> **[V]** = reproduced against a running instance. **[C]** = established by code analysis.

## Severity definitions

| | Meaning |
|---|---|
| **P0** | Security vulnerability, data loss, or a broken production workflow. Blocks launch. |
| **P1** | Major functional bug, serious reliability gap, or significant UX failure. |
| **P2** | Technical debt, maintainability, UX inconsistency, moderate performance issue. |
| **P3** | Polish, minor refactor, cosmetic. |

---

## P0 — Blocks production launch

| ID | Finding | Category | Location | Evidence | Effort | Fix risk |
|---|---|---|---|---|---|---|
| **SEC-001** | Arbitrary file upload → stored XSS on app origin | Security | `users/[userId]/avatar/route.ts:30-46`; `attachments/route.ts:80-84` | **[V]** uploaded `evil.html` as an avatar, served back `200 text/html` with live `<script>` | S | Low |
| **SEC-002** | Redis outage permanently breaks login + password reset; health check still reports `ok` | Availability | `auth-otp.ts:60-105`; `redis.ts:97-113` | **[V]** with Redis stopped: challenge issued, verify → `401 MFA session expired`, health → `{"status":"ok"}` | M | Med |
| **SEC-003** | System admins bypass MFA unconditionally | AuthN | `auth/login/route.ts:126-150` | **[V]** admin logged in with password only under `MFA_REQUIRE_ENROLLMENT=true`; session row `mfaBypassed=t` | S | Low |
| **SEC-004** | Password-reset OTPs from `Math.random()` | Crypto | `auth-otp.ts:33-37` | **[C]** non-CSPRNG on the account-recovery path | XS | None |
| **SEC-005 / OPS-002** | No backups, no restore, no DR | Data durability | repo-wide | **[V]** zero matches for `backup\|pg_dump\|restore\|pitr\|wal` | M | Low |
| **OPS-003** | No TLS; auth cookie `Secure` flag set from a client header | Transport | `nginx.production.conf.template:34`; `auth.ts:63-79` | **[V]** cookie jar shows `Secure=FALSE`; commit `91ea184` "remove https" | M | Med |
| **OPS-004** | Postgres + Redis published to host; Redis has no password | Infra | `docker-compose.production.yml:139,158,149` | **[C]** `ports:` blocks present; no `--requirepass` | XS | Low |

**Why these seven block launch:** each is either a direct path to compromising a user
account (SEC-001, SEC-003, SEC-004, OPS-003, OPS-004), a way to take the product fully
offline for all non-admins with no recovery (SEC-002), or the absence of any way to
recover from the other six going wrong (SEC-005).

---

## P1 — High

| ID | Finding | Category | Location | Effort | Fix risk |
|---|---|---|---|---|---|
| **SEC-006** | SSRF with 4 KB read primitive via webhooks, rendered in the UI | Security | `webhook-service.ts:163-196` | M | Low |
| **SEC-007 / DB-001** | Deleting a user cascade-deletes every work item they reported | Data loss | `schema.prisma:481`; `users/[userId]/route.ts:120-139` | M | **High** |
| **SEC-008** | Open self-registration; bypasses the MFA enrolment policy | AuthN | `auth/register/route.ts` | S | Low |
| **SEC-009** | User directory (names + emails) readable by any account | PII | `search-service.ts:219-243` | S | Low |
| **SEC-012 / OPS-008** | No rate limiting anywhere; 3-attempt lockout is a DoS lever | Security | nginx template; `auth/login/route.ts:19` | M | Low |
| **SEC-013** | Area ACLs bypassed by global search | AuthZ | `search-service.ts` | S | Low |
| **API-002** | 401 returned instead of 403 → clients log the user out | API/UX | `domain/auth.ts:196-201` | XS | Med |
| **API-003** | `/api/rbac` returns 200 + Viewer permissions to non-members | Info leak | `rbac/route.ts:34-43` | XS | Med |
| **BE-001** | Webhooks, SLA timers and assignment emails are fire-and-forget | Reliability | `issues/route.ts:414,470` + 6 others | M | Low |
| **BE-002 / PERF-006** | Lazy provisioning (10 counts, 60 s transaction) on 13 read paths | Architecture | `project-bootstrap.ts` | L | Med |
| **BE-003 / PERF-005** | "Real-time" SSE is DB polling — ~0.22 q/s per connected user | Scalability | 2 stream routes | M | Low |
| **BE-004** | API tokens authenticate nothing — dead feature with a full UI | Completeness | `api-tokens/**` | M | Low |
| **BE-008 / OPS-009** | No structured logging, metrics, tracing or error tracking | Observability | repo-wide (273 `console.error`) | L | Low |
| **BE-009** | Health check conflates liveness and readiness | Ops | `health/route.ts` | XS | Low |
| **FE-001** | No routing: no deep links, no back/forward, no code splitting | Architecture/UX | `page.tsx:203` | L | Med |
| **FE-002** | Zero error boundaries — one render error blanks the app | Reliability | repo-wide | S | Low |
| **FE-003 / UX-004** | 200-item cap; client-side filter/sort/search; silent truncation | Correctness | `page.tsx:227`; `list-view.tsx:150` | L | Med |
| **UX-002** | Board columns cut off at 1440px with no scroll affordance | UX | `kanban-board.tsx` | S | Low |
| **UX-003** | Required fields hidden behind tabs; errors don't say where | UX | `create-issue-dialog.tsx` | M | Low |
| **UX-005** | 8 of 12 delete actions have no confirmation | UX/Data loss | 8 components | S | Low |
| **OPS-001** | No CI/CD of any kind | Process | `.github/` absent | M | Low |
| **OPS-005** | No `.env.example`, no startup env validation | Ops | repo-wide | S | Low |
| **OPS-006 / DB-002** | Migrations in app entrypoint; 138 indexes, zero `CONCURRENTLY` | Deploy | `entrypoint.sh` | M | Med |
| **PERF-001** | 1.17 MB single JS chunk / 2.6 MB total | Performance | build output | M | Low |
| **PERF-011** | Connection pool (10–20) undersized for the load above | Performance | `db.ts:6` | S | Med |
| **TEST-002** | Zero authorization tests | Testing | `tests/` | L | Low |
| **TEST-003/4/5** | Zero API, component tests; E2E doesn't typecheck and isn't run | Testing | `tests/` | L | Low |

---

## P2 — Medium

| ID | Finding | Location |
|---|---|---|
| SEC-014 | MFA secrets stored in plaintext | `schema.prisma:21` |
| SEC-015 | Password reset does not revoke existing sessions | `password-reset/confirm:63-80` |
| SEC-018 | `ALLOW_HEADER_AUTH` escape hatch trusts `x-user-id` | `domain/auth.ts:36-45` |
| SEC-019 | Regex "sanitiser" bypassable; safety depends on renderer choice | `domain/content.ts` |
| SEC-020 | No CSP/HSTS from the app; static assets lose nginx headers | `next.config.ts` |
| SEC-021 | Stale `role` claim in 30-day JWT gates `/admin` page routing | `auth.ts:30`; `proxy.ts:47` |
| SEC-022 | Client-spoofable IP recorded in sessions and audit log | `auth-session-core.ts:38-48` |
| API-001 | Four different error shapes; 5xx leaks `error.message` | repo-wide |
| API-004 | Three pagination conventions; most collections unbounded | repo-wide |
| API-005 | No idempotency keys on POST | repo-wide |
| API-006 | Bulk operations only for issues | `issues/bulk` |
| API-007 | No OpenAPI, no versioning | repo-wide |
| DB-003 | Upload blobs orphaned on issue/user delete; old avatars never removed | `attachments`, `avatar` |
| DB-004 | `status` and `stateId` duplicate the same fact with no DB constraint | `schema.prisma:457,474` |
| DB-005 / PERF-013 | No retention/partitioning on 6 unbounded log tables | schema |
| BE-005 / PERF-007 | 3 actor resolutions (~15 queries) per issue create | `issues/route.ts:265-291` |
| BE-006 / PERF-008 | `ILIKE '%…%'` instead of the existing tsvector index | `issues/route.ts:178` |
| BE-007 | Inconsistent error contract | repo-wide |
| BE-010 | No graceful shutdown (`SIGTERM` unhandled) | repo-wide |
| PERF-010 | Report endpoints unbounded, uncached, unthrottled | `domain/reports.ts` |
| FE-004 / PERF-002 | 12 unused dependencies incl. unvetted `z-ai-web-dev-sdk` | `package.json` |
| FE-005 | ESLint disables ~25 meaningful rules; `noImplicitAny: false` | `eslint.config.mjs` |
| FE-006 | Six components >1,300 lines; filter logic duplicated 4× | `components/project-management` |
| FE-007 | No optimistic updates; 409 conflict has no UI reconciliation | repo-wide |
| FE-008 / UX-014 | 38 ARIA attributes total; 18 unnamed icon-only buttons | repo-wide |
| UX-006 | "Setup progress" overlaps "New Work Item" on all viewports | `page.tsx` |
| UX-007 | Onboarding checklist occupies ~65% of the dashboard | `onboarding-checklist.tsx` |
| UX-008 | Login error appears 900px from the form | `login-experience.tsx` |
| UX-009 | Issue keys sort lexicographically (`-1, -10, -11, -2`) | `list-view.tsx:182` |
| UX-010 | Status Distribution chart renders empty with valid data | `reports-view.tsx` |
| UX-011 | Mobile drawer stays open after navigating; no mobile board layout | `page.tsx:666` |
| UX-012 | "Dashboard" means two things; "PROJECTS: 1" inside a project; undefined "At Risk" | multiple |
| UX-013 | Saved Views fully built server-side, zero UI; 4 unused UI primitives | `api/views/**` |
| UX-015 | 218 raw palette classes bypass the token system; 74 lack `dark:` | 12 components |
| TEST-001 | 3 domain test files excluded from `npm test` | `package.json:8` |
| TEST-006 | No test database isolation strategy | `tests/e2e/support/db.ts` |
| OPS-007 | Dockerfile prunes a tree standalone already replaces; no `HEALTHCHECK` | `Dockerfile` |
| OPS-010 | Uploads on local disk; worker in-process; cron has no leader election | compose |

---

## P3 — Low

| ID | Finding |
|---|---|
| SEC-023 | Timing-unsafe comparison of `CRON_SECRET` and reset OTP |
| SEC-024 | Password policy is `min(8)` only; no bcrypt 72-byte guard |
| SEC-025 | User enumeration via distinct register/login/reset responses |
| PERF-004 | No `next/image`; avatars served at upload resolution |
| PERF-009 | Offset pagination degrades with depth |
| UX-008b | `logo.svg` 404s on every page load; `********` as a password placeholder |
| REPO-001 | `prisma/dev.db`, `dev.err.log`, `dev.out.log`, `.vs/`, `test-results/`, `playwright-report/` committed |
| REPO-002 | Commit messages are `..`, `........`, `......` — no traceability |

---

## Risk concentration

Where the danger actually sits, by system area:

| Area | P0 | P1 | P2 | Assessment |
|---|---|---|---|---|
| File uploads | 1 | 0 | 1 | **Worst area.** No validation at all; direct RCE-equivalent via XSS |
| Auth policy | 3 | 2 | 5 | Mechanism is solid; **policy** is inverted (admins exempt, Redis fatal) |
| Infrastructure | 3 | 3 | 3 | No TLS, no backups, exposed datastores, no CI |
| Frontend architecture | 0 | 4 | 5 | One monolithic component causes most of the UX findings |
| Observability | 0 | 2 | 1 | Effectively zero — cannot diagnose production |
| Testing | 0 | 4 | 2 | 155 good unit tests; nothing covers authz, API or UI |
| Authorization logic | 0 | 2 | 2 | **Strongest area.** Correct in every case tested |
| Database schema | 0 | 2 | 3 | Well designed; cascades and deploy locking are the gaps |

**The single most dangerous combination:** SEC-008 (anyone can register) + SEC-001 (any
authenticated user can plant script on the app origin) + SEC-009 (any account can harvest
the staff directory). Together these turn an internet-exposed instance into a
self-service phishing and account-takeover platform. Closing SEC-008 alone materially
reduces the blast radius of the other two, and is a one-line change.
