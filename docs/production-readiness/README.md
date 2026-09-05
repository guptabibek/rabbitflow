# RabbitFlow — Production Readiness Audit

**Audit date:** 2026-09-05 · **Commit:** `adfd7b1` · **Scope:** full system

Findings marked **[VERIFIED]** were reproduced against a running instance (Postgres 16 +
Redis 7 + Next.js dev server, seeded with a bootstrap admin, a project and 12 work items),
using curl for API probing and Chromium/Playwright at 1440×900, 768×1024 and 390×844 for
UI validation. Everything else is established by code analysis and is marked as such.

## Verdict

**Production readiness: 3 / 10 — not deployable to real users today.**

Seven P0 findings block launch; five of them were confirmed by exploitation, not
inference. The most severe are an unrestricted file upload that yields stored XSS on the
application origin, a Redis dependency that silently breaks login for every non-admin
while the health check still reports `ok`, and an unconditional MFA bypass for system
administrators.

This is not a weak codebase. The database schema, authorization model and domain layer are
above the median for products already in production — there is no SQL injection, project
scoping holds under probing, optimistic locking is correctly implemented, and 62,700 lines
contain zero `any` and zero `@ts-ignore`. The score reflects a small number of severe,
concentrated defects plus the complete absence of operational scaffolding: no CI, no
backups, no TLS, no observability.

## Documents

| Document | Contents |
|---|---|
| [architecture.md](architecture.md) | As-built system map, request flow, runtime topology, recommended target |
| [security-audit.md](security-audit.md) | 25 findings with reproduction steps; the primary document |
| [ux-audit.md](ux-audit.md) | Browser-verified UX findings with screenshot evidence |
| [frontend-architecture.md](frontend-architecture.md) | The monolithic-component problem and its consequences |
| [backend-architecture.md](backend-architecture.md) | Layering, side-effect durability, observability |
| [database-architecture.md](database-architecture.md) | Schema, cascades, indexing, migration safety |
| [api-audit.md](api-audit.md) | All 124 routes classified by authorization guard |
| [testing-audit.md](testing-audit.md) | Coverage gaps and a prioritised test strategy |
| [devops-audit.md](devops-audit.md) | CI, Docker, TLS, backups, secrets, deployment |
| [performance-audit.md](performance-audit.md) | Bundle, query load, connection pool, deploy locking |
| [risk-register.md](risk-register.md) | Every finding, prioritised, with effort and fix risk |
| [production-roadmap.md](production-roadmap.md) | Scorecard, gap analysis, 7-phase plan, launch checklist |
| [remediation-log.md](remediation-log.md) | First remediation pass — what was fixed |
| [remediation-log-2.md](remediation-log-2.md) | Second pass — SEC-002 root cause, SSRF, rate limiting, API tokens, CI, UI defects |

Start with [risk-register.md](risk-register.md) for the prioritised list, or
[production-roadmap.md](production-roadmap.md) for the plan and pre-deployment checklist.

## Finding counts

| Severity | Count |
|---|---|
| P0 — blocks launch | 7 |
| P1 — high | 27 |
| P2 — medium | 38 |
| P3 — low | 8 |

## The seven P0 findings

| ID | Finding | Verified |
|---|---|---|
| SEC-001 | Arbitrary file upload → stored XSS on the app origin | ✅ exploited |
| SEC-002 | Redis outage permanently breaks login; health check still reports `ok` | ✅ reproduced |
| SEC-003 | System administrators bypass MFA unconditionally | ✅ reproduced |
| SEC-004 | Password-reset OTPs generated with `Math.random()` | code |
| SEC-005 | No backups, no restore procedure, no DR | ✅ confirmed absent |
| OPS-003 | No TLS; auth cookie `Secure` flag set from a client-supplied header | ✅ observed |
| OPS-004 | Postgres and Redis published to the host; Redis has no password | code |

## Methodology

1. Repository survey — structure, dependencies, build, migrations, tests.
2. Static analysis — `tsc --noEmit`, `eslint`, `npm test`, `npm run build`, bundle sizing.
3. Route enumeration — all 124 handlers classified by authorization guard.
4. Live environment — Postgres and Redis containers, migrations applied, seeded data.
5. API probing — authentication, cross-project isolation, IDOR, upload handling,
   registration, search scoping, Redis-down behaviour.
6. Browser validation — login, dashboard, board, list, reports, work-item detail, create
   form, and three viewport sizes, capturing console and network errors.
7. Code review of every domain module, the auth pipeline, and the highest-risk routes.

Test artefacts created during the audit (containers, uploaded files, seeded records) were
removed afterwards.
