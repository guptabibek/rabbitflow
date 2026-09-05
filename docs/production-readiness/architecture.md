# RabbitFlow — System Architecture (As-Built)

> Audit date: 2026-09-05 · Commit `adfd7b1` · Verified against running code, not documentation.

## 1. What this system is

RabbitFlow is a single-deployment, multi-project (not multi-tenant) Agile work-management
platform in the Jira / Azure DevOps Boards category. It is a **Next.js 16 App Router
monolith** — UI, API, domain logic and background work all live in one process.

- **~62,700 lines** of TypeScript across 303 files
- **124 API route handlers**, **59 Prisma models**, **18 migrations**
- **~50 feature components**, **47 shadcn/ui primitives**

## 2. Runtime topology (production compose)

```text
                        Internet
                           │  :3999 (HTTP only — no TLS)
                    ┌──────▼───────┐
                    │    nginx     │   edge + internal networks
                    │  1.27-alpine │   security headers, gzip, no rate limiting
                    └──────┬───────┘
                           │ http://app:3000
        ┌──────────────────▼──────────────────┐
        │   app (Next.js 16 standalone)       │
        │                                     │
        │   proxy.ts (edge)  ── JWT gate      │
        │        │                            │
        │   Route handlers (src/app/api/**)   │
        │        │                            │
        │   Domain layer (src/lib/domain/**)  │
        │        │                            │
        │   Prisma Client ── pool limit 20    │
        │                                     │
        │   instrumentation.ts → BullMQ email │
        │                        worker       │
        └────┬─────────────────────┬──────────┘
             │                     │
     ┌───────▼──────┐      ┌───────▼───────┐        ┌──────────────┐
     │ postgres:16  │      │   redis:7     │◄───────│ cron (alpine)│
     │ :5433 EXPOSED│      │ :6380 EXPOSED │        │ curl /api/cron│
     │              │      │  NO PASSWORD  │        │  every 2 min  │
     └──────────────┘      └───────────────┘        └──────────────┘
             │                     │
      postgres_data           redis_data          app_uploads (local disk)
      NO BACKUPS              NO BACKUPS          NO BACKUPS
```

**Deviations from the diagram you would expect in production:** no TLS termination, no
WAF/rate limiting, no object storage, no backup sidecar, no metrics/tracing collector,
no CI/CD pipeline, and datastore ports published to the host.

## 3. Request flow

```text
Browser
  │  cookie: auth-token (HS256 JWT, 30-day TTL, httpOnly, SameSite=Lax)
  ▼
src/proxy.ts  (Next 16 "proxy" = middleware, runs on the edge runtime)
  │  • allow-list for public auth routes + /api/health
  │  • jwtVerify(token)  → 401 (API) or redirect /login (pages)
  │  • blocks /admin/** and /api/admin/** when token claim role === 'member'
  │  • injects x-user-id and x-session-id into the forwarded request
  ▼
Route handler (src/app/api/**/route.ts)
  │  • zod parse of body / query
  │  • requireAuthenticatedUser | requireSystemAdmin | requireProjectPermission
  ▼
src/lib/domain/auth.ts   ← the real trust boundary
  │  • re-verifies the cookie JWT itself (does NOT trust x-user-id unless
  │    ALLOW_HEADER_AUTH=true)
  │  • validateActiveSession()  → AuthSession row must be un-revoked + unexpired
  │  • loads User (isActive check)
  │  • loads ProjectMember → role + extraPermissions
  │  • canAccessProjectPermission() → static role matrix ∪ extras, overridden by
  │    ProjectPermissionRule rows (project-wide, then area-scoped)
  ▼
Domain services (src/lib/domain/*.ts)
  ▼
Prisma → PostgreSQL
  │
  └─ side effects, all fire-and-forget (`void`), none durable:
       attachSlaTimers · dispatchWebhookEvent · sendWorkItemAssignmentEmail
       evaluateAutomationRules · createNotification · invalidateSprintCaches
```

**Two-layer auth is real and correct.** The proxy is a coarse gate; `domain/auth.ts`
independently re-verifies the JWT from the cookie, so a spoofed `x-user-id` header does
not authenticate (verified: `curl -H 'x-user-id: fake'` → 401). The exception is the
`ALLOW_HEADER_AUTH=true` escape hatch, which must never be set in production.

## 4. Frontend architecture

```text
src/app/layout.tsx  (server, theme provider + Sonner)
  ├── /login, /register        → auth pages (own shell)
  ├── /dashboard               → project picker
  ├── /projects                → static
  ├── /work-items/[issueId]    → full-screen work item (reachable, but almost
  │                              nothing navigates here)
  ├── /admin, /admin/panel, /admin/security
  └── /  ──────────────────────► src/app/page.tsx  (899 lines, 'use client')
                                    │
                                    │  const [currentView, setCurrentView] =
                                    │      useState<ViewType>('dashboard')
                                    │  27 possible views, ALL eagerly imported
                                    ▼
                        ~50 feature components, all reading one Zustand store
```

The entire product — board, backlog, list, sprints, reports, roadmap, portfolio,
calendar, dependencies, activity, OKRs, documents, retros, approvals, webhooks,
automations, imports, recurring tasks, test plans, SLA, API tokens, branding, ACL,
onboarding config — is **one client component switching on `useState`**.

Consequences (all verified in a browser):
- The URL is `/` for every view. No deep links, no browser back/forward, no bookmarks.
- One 1.17 MB JS chunk (2.6 MB total client JS) because nothing is code-split.
- No `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`, and no React
  error boundary anywhere — a render error in any view blanks the whole app.

**State:** a single Zustand store (`src/store/app-store.ts`, 562 lines) holds
`issues[]`, `users[]`, `labels[]`, `iterations[]`, `states[]`, `areas[]`, `teams[]`,
`workItemTypes[]` plus UI state. Only `activeProjectId` and two view-preference maps are
persisted to `localStorage` (correctly `partialize`d — no PII).

**Data fetching** is hand-rolled `fetch` + `fetchWithRetry`, primed by one
`/api/projects/bootstrap` call with a segmented fallback. `@tanstack/react-query` is a
dependency but is **never imported**.

## 5. Backend architecture

Layering is genuinely present and mostly respected:

| Layer | Location | Responsibility |
|---|---|---|
| Transport | `src/app/api/**/route.ts` | zod parsing, authz calls, HTTP shaping |
| Domain | `src/lib/domain/*.ts` | RBAC, workflow, reports, SLA, automation, webhooks |
| Data | `src/lib/db.ts` + Prisma | client singleton, transient-error retry helper |
| Platform | `src/lib/{auth,redis,email,email-queue}.ts` | JWT, cache, SMTP, BullMQ |

Strong points: optimistic locking on `Issue.version` enforced inside a transaction;
issue-key allocation under an advisory lock; idempotent, data-normalising SQL migrations;
HMAC-signed webhooks with backoff and auto-disable.

**The one architectural anomaly:** `ensureProjectSystemRecords()` is a lazy
self-healing provisioning/migration routine invoked from **13 read paths**. Per project
per process every 5 minutes it runs 10 parallel `COUNT` queries and, if anything looks
unprovisioned, executes a transaction with a **60-second timeout** that rewrites states,
areas, teams, type definitions, field mappings, transitions and migrates legacy issue
relations — inside a user's GET request. Its dedupe cache is in-process, so it does not
coordinate across replicas.

## 6. Async / background work

| Mechanism | Implementation | Durable? |
|---|---|---|
| Email | BullMQ queue + in-process worker (`instrumentation.ts`) | Yes (Redis), falls back to direct send |
| SLA breach detection | external cron → `POST /api/cron` every 2 min | Yes |
| Recurring tasks | same cron endpoint | Yes |
| Webhooks | `void dispatchWebhookEvent(...)` in the request | **No** |
| Notifications | `await createNotification(...)` inline | Partially |
| Automation rules | `await evaluateAutomationRules(...)` inline | **No** |
| SLA timer attach | `void attachSlaTimers(...)` in the request | **No** |
| "Real-time" | SSE endpoints that **poll the database** every 8–10 s | n/a |

## 7. Caching

`src/lib/redis.ts` exposes two families with **different failure semantics**:

- `cacheGet/cacheSet/cacheInvalidate` — no-op silently when Redis is unavailable.
- `ephemeralSet/ephemeralScan` — fall back to a per-process `Map`.

Auth-critical state (MFA challenges, password-reset OTPs) uses the **first** family.
See `security-audit.md` SEC-002: this makes Redis a hard dependency for login while the
health check still reports `status: "ok"`.

## 8. Recommended target architecture

Keep the monolith. It is the right shape for this team and domain. Change four things:

1. **Route-per-view.** Replace `page.tsx`'s `currentView` state machine with real App
   Router segments (`/p/[projectKey]/board`, `/backlog`, `/work-items/[id]`, …). This one
   change delivers deep links, back/forward, per-route code splitting, per-route
   `loading.tsx`/`error.tsx`, and server-side data loading.
2. **Move provisioning off the read path.** `ensureProjectSystemRecords` becomes an
   explicit step in project creation plus a migration/CLI backfill.
3. **Make side effects durable.** Move webhooks, automations and SLA attachment onto the
   BullMQ queue that already exists for email.
4. **Externalise blob storage.** Attachments/avatars to S3-compatible storage behind an
   authorising download route, never the public web root.
