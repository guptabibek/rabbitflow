# Production Roadmap

> Effort is engineer-days for one competent full-stack engineer familiar with this stack.
> Phases are ordered by dependency and risk reduction, not by visibility.

## Scorecard — current state

| Category | Score | Justification |
|---|---:|---|
| Architecture | 5 / 10 | Clean backend layering and a real domain layer; undermined by a 27-view monolithic client component and provisioning logic on the read path |
| Frontend | 4 / 10 | Excellent type safety and a well-built token system, but no routing, no code splitting, no error boundaries, 1.17 MB chunk |
| UX | 4 / 10 | Strong work-item screen and IA; board hides columns, forms fail opaquely, no deep links, 8 unconfirmed deletes |
| Backend | 6 / 10 | Best area alongside the DB. Optimistic locking, advisory locks, retry logic all correct; side effects are lossy |
| API | 6 / 10 | Authorization coverage is complete and correct; contract consistency, pagination and idempotency are not |
| Database | 7 / 10 | **Highest score.** Thorough indexing, idempotent migrations, correct constraints. Cascades and deploy locking are the gaps |
| Security | 3 / 10 | Authorization is genuinely strong; file uploads, MFA policy, OTP generation and infrastructure exposure are not |
| Performance | 4 / 10 | Good indexes and caching primitives, defeated by SSE polling, lazy provisioning and an unsplit bundle |
| Reliability | 3 / 10 | Retry and webhook backoff are real; no durable side effects, no graceful shutdown, no DLQ, no readiness gate |
| Testing | 3 / 10 | 155 fast, well-chosen unit tests — covering none of authz, API, UI, or DB |
| Accessibility | 2 / 10 | Skip link and some ARIA present; 18 unnamed icon buttons, no focus management, toast-only errors |
| DevOps | 3 / 10 | Competent Docker hardening; no CI, no TLS, no backups, exposed datastores |
| Observability | 1 / 10 | 273 `console.error` calls. No metrics, traces, correlation IDs or error tracking |
| Documentation | 3 / 10 | Thorough README; no env contract, no runbook, no API docs, and README claims contradict behaviour |
| **Production readiness** | **3 / 10** | **Not deployable to real users today.** Seven P0 findings, five verified by exploitation |

**What the 3/10 means:** this is not a weak codebase. The domain modelling, schema design
and authorization logic are above the median for products already in production. The score
is dragged down by a small number of severe, concentrated defects — most of them fixable
in days, not months — plus the total absence of the operational scaffolding (CI, backups,
TLS, observability) that turns working software into a running service.

---

## Gap analysis

```text
CURRENT STATE                    GAP                          TARGET STATE
─────────────────────────────────────────────────────────────────────────────────────
Any user can plant           →   No upload validation      →  Magic-byte validation,
script on the app origin         or authorised serving        server-generated names,
                                                              authorised download route

Redis down = no one can      →   Auth state in a cache     →  Challenges in Postgres;
log in; health says "ok"         with silent write-drop       readiness gate reflects it

Admins skip MFA entirely     →   globalRole short-circuit  →  One enrolment path for
                                 before the MFA branch        every account

No backups at all            →   No DR capability          →  Nightly dumps + WAL PITR,
                                                              rehearsed restore

Plain HTTP in production     →   No TLS termination        →  TLS + HSTS; Secure cookies
                                                              from $scheme at the edge

27 views behind useState     →   App Router unused         →  Route per view: deep links,
                                                              splitting, error boundaries

200-item cap, client filter  →   No server-side querying   →  Server pagination/filter/
                                 in the UI                    sort + virtualised lists

Effects fired with `void`    →   No durable execution      →  BullMQ jobs with retry+DLQ

273 console.error calls      →   No observability          →  Structured logs, metrics,
                                                              traces, error tracking

No CI, no authz tests        →   No regression safety      →  Pipeline + authorization
                                                              matrix suite
```

---

## Phase 0 — Stabilisation (blocks launch)

**~12 days.** Nothing ships to real users until this is done.

| # | Work | Findings | Days |
|---|---|---|---|
| 0.1 | Upload validation: magic-byte checks via `sharp`, server-generated filenames, extension allow-list | SEC-001 | 1 |
| 0.2 | Move uploads out of `public/`; authorised download route with `Content-Disposition: attachment` + `nosniff` | SEC-001 | 1.5 |
| 0.3 | Remove the admin MFA bypass branch | SEC-003 | 0.5 |
| 0.4 | `crypto.randomInt` for OTPs; `timingSafeEqual` for OTP and `CRON_SECRET` | SEC-004, SEC-023 | 0.5 |
| 0.5 | Persist MFA challenges + reset OTPs in Postgres; split `/health/live` vs `/health/ready` | SEC-002, BE-009 | 2 |
| 0.6 | TLS at nginx, HTTP→HTTPS redirect, HSTS, `$forwarded_proto` from `$scheme` | OPS-003, SEC-011 | 1.5 |
| 0.7 | Remove `ports:` from postgres/redis; set `--requirepass` | OPS-004, SEC-010 | 0.5 |
| 0.8 | Backups: nightly `pg_dump` off-host, WAL archiving, **documented restore rehearsal** | SEC-005, OPS-002 | 2.5 |
| 0.9 | Gate self-registration behind `ALLOW_SELF_REGISTRATION=false` + domain allow-list | SEC-008 | 0.5 |
| 0.10 | Scope user search to shared projects | SEC-009 | 0.5 |
| 0.11 | Regression tests for every item above | TEST-002 | 1 |

**Exit criterion:** all seven P0 findings closed, each with a test that fails on the old
code.

---

## Phase 1 — Foundation

**~15 days.** Correctness, safety rails, and the ability to see production.

| # | Work | Findings | Days |
|---|---|---|---|
| 1.1 | CI pipeline: typecheck, lint, unit, migrate, E2E, docker build — blocking on PR | OPS-001 | 2 |
| 1.2 | `.env.example` + zod-validated `src/lib/env.ts` failing fast at startup | OPS-005 | 1 |
| 1.3 | Structured logging + request IDs from `proxy.ts`; error tracking | BE-008 | 2 |
| 1.4 | `/api/metrics`: latency, error rate, pool utilisation, queue depth, auth failures | OPS-009 | 2 |
| 1.5 | Rate limiting: nginx `limit_req_zone` for `/api/auth/*`, app throttle on IP+email | SEC-012 | 1.5 |
| 1.6 | Unified error envelope `{ code, message, details?, requestId }`; stop leaking `error.message` | API-001, BE-007 | 1.5 |
| 1.7 | Fix 401→403 for non-members; `/api/rbac` returns 403 | API-002, API-003 | 0.5 |
| 1.8 | SSRF guard on webhooks: scheme allow-list, private-range block, drop response bodies | SEC-006 | 1.5 |
| 1.9 | Soft-delete users; change `Issue.reporter` cascade; audit every admin action | SEC-007, DB-001 | 2 |
| 1.10 | Error boundaries: `global-error.tsx` + chart boundaries | FE-002 | 0.5 |
| 1.11 | Authorization test matrix: 6 roles × 15 endpoints + cross-project isolation | TEST-002 | 3 |
| 1.12 | Fix `npm test` glob; fix 2 E2E type errors; gitignore build artefacts | TEST-001, TEST-005 | 0.5 |

---

## Phase 2 — UX transformation

**~20 days.** The phase users will actually notice.

| # | Work | Findings | Days |
|---|---|---|---|
| 2.1 | **Route per view.** Replace `currentView` with App Router segments | FE-001, UX-001 | 5 |
| 2.2 | Per-route `loading.tsx` + `error.tsx`; retire the duplicate work-item implementation | FE-001, FE-006 | 2 |
| 2.3 | Server-side pagination/filter/sort; read `x-total-count`; virtualised lists | FE-003, UX-004 | 4 |
| 2.4 | Board: scroll affordance, collapsible columns, WIP limits, "hide done" | UX-002 | 2 |
| 2.5 | Forms: client-side schema validation, inline errors, tab error badges, focus-first-invalid, all errors at once | UX-003 | 3 |
| 2.6 | Shared `<ConfirmDestructiveDialog>` across all 8 unguarded deletes | UX-005 | 1 |
| 2.7 | Fix layout collisions, orphan `×`, stray Labels button, narrow search input | UX-006, UX-012 | 1 |
| 2.8 | Natural sort for issue keys; fix Status Distribution chart | UX-009, UX-010 | 0.5 |
| 2.9 | Mobile: close drawer on navigate; single-column board with status switcher | UX-011 | 1.5 |

---

## Phase 3 — Backend hardening

**~14 days.**

| # | Work | Findings | Days |
|---|---|---|---|
| 3.1 | Move webhooks, SLA attach, automations onto BullMQ with retry + DLQ | BE-001 | 3 |
| 3.2 | Provisioning out of the read path → project creation + migration/CLI backfill | BE-002 | 3 |
| 3.3 | SSE → Redis pub/sub with reconnect jitter | BE-003, PERF-005 | 3 |
| 3.4 | Resolve actor once per request | BE-005 | 1 |
| 3.5 | Route `?search=` through the tsvector index | BE-006 | 0.5 |
| 3.6 | Graceful shutdown: drain requests, close SSE, `worker.close()`, `$disconnect()` | BE-010 | 1 |
| 3.7 | Migration job out of the entrypoint; `CONCURRENTLY` for indexes on populated tables | OPS-006, DB-002 | 1.5 |
| 3.8 | Pool sizing + PgBouncer; report caching, caps and timeouts | PERF-010, PERF-011 | 1 |

---

## Phase 4 — Quality

**~13 days.**

| # | Work | Findings | Days |
|---|---|---|---|
| 4.1 | API route tests for issues, relations, board/backlog, approvals, admin security | TEST-003 | 4 |
| 4.2 | Vitest + RTL; extract and test the shared filter predicate | TEST-004, FE-006 | 3 |
| 4.3 | Ephemeral test DB (testcontainers) + deterministic fixtures | TEST-006 | 2 |
| 4.4 | E2E: login → create → board drag → complete → report reflects it, per role | TEST-005 | 3 |
| 4.5 | Re-enable ESLint rules incrementally; `noImplicitAny: true` | FE-005 | 1 |

---

## Phase 5 — Production infrastructure

**~9 days.**

| # | Work | Findings | Days |
|---|---|---|---|
| 5.1 | Uploads → S3-compatible object storage; migrate existing blobs | OPS-010, DB-003 | 3 |
| 5.2 | Worker as a separate deployable; cron leader election | OPS-010 | 2 |
| 5.3 | Alerting on error rate, p99 latency, queue depth, health failure | OPS-009 | 1.5 |
| 5.4 | Retention/partitioning for the 6 unbounded log tables | DB-005 | 1.5 |
| 5.5 | Dockerfile cleanup, `HEALTHCHECK`, `.dockerignore`, resource limits | OPS-007 | 1 |

---

## Phase 6 — Product completion

**~17 days.** Close the gap to the benchmark products.

| # | Work | Findings | Days |
|---|---|---|---|
| 6.1 | **Finish or remove API tokens** — implement bearer auth + scope enforcement, or delete the feature and its UI | BE-004 | 3 |
| 6.2 | **Ship Saved Views** — the entire backend already exists, no UI does | UX-013 | 3 |
| 6.3 | Encrypt MFA secrets at rest; revoke sessions on password reset | SEC-014, SEC-015 | 1.5 |
| 6.4 | Accessibility pass: names for all icon buttons, focus management, `role="alert"`, contrast audit | UX-014, FE-008 | 3 |
| 6.5 | Design-system convergence: replace the 218 raw palette classes with tokens | UX-015 | 2 |
| 6.6 | Bulk operations across resources; optimistic updates with rollback and 409 merge UI | API-006, FE-007 | 2.5 |
| 6.7 | Remove 11 unused dependencies (incl. `z-ai-web-dev-sdk`); adopt `react-hook-form` properly | FE-004 | 1 |
| 6.8 | OpenAPI generated from the existing zod schemas | API-007 | 1 |

---

## Summary

| Phase | Focus | Days | Cumulative |
|---|---|---:|---:|
| 0 | Stabilisation | 12 | 12 |
| 1 | Foundation | 15 | 27 |
| 2 | UX transformation | 20 | 47 |
| 3 | Backend hardening | 14 | 61 |
| 4 | Quality | 13 | 74 |
| 5 | Production infrastructure | 9 | 83 |
| 6 | Product completion | 17 | 100 |

**~100 engineer-days (~5 months for one engineer, ~2 months for a team of three.)**

**Minimum viable launch** for a trusted internal audience is **Phase 0 + Phase 1
(27 days)** — provided registration stays closed, the instance is not internet-exposed,
and users are told the 200-item limit exists. Everything through Phase 2 (47 days) is
required before external or paying users.

---

## Pre-deployment checklist

Do not deploy unless every line is checked.

**Security**
- [ ] Upload validation by magic bytes; uploads served from outside the web root, authorised
- [ ] No MFA bypass for any role; enrolment enforced uniformly
- [ ] OTPs from a CSPRNG; secrets compared in constant time
- [ ] TLS terminated; HSTS set; `Secure` + `httpOnly` + `SameSite` on the auth cookie
- [ ] Datastore ports unpublished; Redis password set
- [ ] Rate limiting on all auth endpoints
- [ ] Self-registration disabled or domain-restricted
- [ ] Webhook SSRF guard active; response bodies not persisted
- [ ] `ALLOW_HEADER_AUTH` unset; `JWT_SECRET` ≥32 bytes and validated at startup
- [ ] No secrets in the repository or image

**Data**
- [ ] Automated backups running; **a restore has been performed and dated**
- [ ] WAL archiving / PITR configured
- [ ] No cascade path from user deletion to work-item loss
- [ ] Migrations applied by a job, not the app; `CONCURRENTLY` on populated tables
- [ ] Retention policy active on log tables

**Reliability**
- [ ] `/health/live` and `/health/ready` distinct; readiness fails when auth deps are down
- [ ] Graceful shutdown on `SIGTERM`
- [ ] Side effects durable (queued, retried, dead-lettered)
- [ ] Connection pool sized and load-tested

**Observability**
- [ ] Structured logs with correlation IDs shipped off-host
- [ ] Metrics scraped; dashboards for latency, errors, queue depth, pool use
- [ ] Error tracking receiving events
- [ ] Alerts wired to a person who is on call

**Quality**
- [ ] CI green and blocking on merge
- [ ] Authorization matrix suite passing
- [ ] E2E critical journeys passing
- [ ] `tsc --noEmit` clean including tests

**Product**
- [ ] Deep links work for work items and views
- [ ] No silent data truncation
- [ ] Every destructive action confirmed
- [ ] No feature visible in the UI that does nothing (API tokens, Saved Views)
- [ ] README claims match observed behaviour

**Operational**
- [ ] Runbook written: deploy, rollback, restore, incident response
- [ ] `.env.example` complete and accurate
- [ ] Rollback procedure rehearsed
