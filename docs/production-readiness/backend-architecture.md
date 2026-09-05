# Backend Architecture & Reliability Audit

## Layering

The intended layering is real and mostly respected — this is above average for a Next.js
codebase:

```text
src/app/api/**/route.ts     transport: zod parse → authz → shape HTTP response
src/lib/domain/*.ts         domain: RBAC, workflow, reports, SLA, automation, webhooks
src/lib/db.ts               data: Prisma singleton + transient-retry helper
src/lib/{auth,redis,email}  platform
```

Business logic largely lives in `src/lib/domain`. The exception is
`src/app/api/issues/[issueId]/route.ts` (1,109 lines), which carries substantial update
orchestration inline — state transitions, custom-field diffing, notification fan-out and
audit detail construction.

---

## BE-001 · Side effects are fire-and-forget and silently lost · **P1**

**Location** `src/app/api/issues/route.ts:414,470`, `[issueId]/route.ts`, and 6 others

```ts
void attachSlaTimers(issue.id, data.projectId, issue.priority, issue.workItemType)
void sendWorkItemAssignmentEmail({ ... })
void dispatchWebhookEvent(data.projectId, 'issue.created', { ... })
```

These promises are not awaited, not retried, not queued and not logged on failure. In a
serverless or autoscaled deployment the runtime may terminate the invocation as soon as
the response is flushed — the work simply never happens. Even on a long-lived Node server,
an unhandled rejection produces nothing a user or operator can see.

Concretely: **SLA timers may never attach**, **webhooks may never fire**, and **assignment
emails may never send** — with no error, no dead-letter and no metric.

**Fix.** BullMQ is already a dependency with a working worker (`instrumentation.ts`).
Enqueue these effects as jobs with the same `attempts: 3` / exponential backoff the email
queue already uses, plus a dead-letter list and a queue-depth metric.

---

## BE-002 · Lazy provisioning on the read path · **P1**

**Location** `src/lib/domain/project-bootstrap.ts`, invoked from **13 routes**

`ensureProjectSystemRecords(projectId)` runs inside user GET requests. Per project, per
process, every 5 minutes it executes **10 parallel `COUNT` queries**; if any check fails
it runs a transaction with `timeout: 60_000` that rewrites states, areas, teams, work-item
type definitions, field mappings and state transitions, backfills area/iteration paths,
and migrates legacy `parent`/`child` issue relations.

Three problems:

1. **Latency**: a user's board load can block on a 60-second schema-repair transaction.
2. **Correctness under scale**: the dedupe cache (`ensuredAtByProject`, a module-level
   `Map`) is per-process. With N replicas you get N concurrent repair transactions
   contending for locks on `State`, `Area` and `Issue`.
3. **Failure mode**: if the transaction throws, the user's read request 500s.

**Fix.** Run provisioning explicitly at project creation, and move the repair/backfill
logic into a migration plus a `scripts/` CLI. Keep a cheap read-time assertion at most.

---

## BE-003 · SSE "real-time" is database polling · **P1**

**Location** `api/realtime/project/stream/route.ts`, `api/notifications/stream/route.ts`

Both endpoints hold an open connection for 5 minutes and poll PostgreSQL on an interval
(8 s for project activity — 2 queries each; 10 s for unread counts — 1 query each).

Cost model per connected user: `~0.125 + 0.1 ≈ 0.22 queries/sec`, plus a held HTTP
connection. At 100 concurrent users that is **~22 queries/sec of pure polling** against a
Prisma pool of 20 (`DATABASE_CONNECTION_LIMIT` default), on top of real traffic. The
5-minute forced close also produces a synchronised reconnect stampede.

The code comments acknowledge this ("In production, replace the polling approach with
Redis pub/sub"). Redis is already a required dependency.

**Fix.** Redis pub/sub fan-out; publish on write, push on receive. Add jitter to the
reconnect window regardless.

---

## BE-004 · API tokens authenticate nothing · **P1**

**Location** `src/app/api/api-tokens/**`, `src/components/project-management/api-token-management.tsx` (395 lines)

Tokens are generated correctly (`rf_<8hex>_<64hex>`, SHA-256 hashed at rest, prefix
stored, expiry, 20-per-user cap) and surfaced in a full management UI. But a
repository-wide search for `apiToken`, `tokenHash`, `Authorization` and `Bearer` **outside
those CRUD routes returns zero results.**

There is no token authentication middleware. Users can mint credentials, see them listed
with "last used" columns that will never populate, and integrate nothing. `scopes` is
`z.array(z.string())` — arbitrary strings, validated against nothing, enforced nowhere.

**Fix.** Either implement bearer-token auth in `getIdentityFromRequest` (validate hash,
check expiry, enforce scopes, update `lastUsedAt`) — or remove the feature and its UI
until it is real. Shipping credential issuance that grants nothing is worse than not
shipping it.

---

## BE-005 · Redundant authorization round-trips · **P2**

**Location** `src/app/api/issues/route.ts:265-291`

`POST /api/issues` calls `requireProjectPermission` up to **three times** (create, assign,
transition). Each call re-runs `resolveActorContext`: verify JWT → `authSession.findFirst`
→ `user.findUnique` → `projectMember.findUnique` → `getProjectPermissionRules`. That is
~15 queries before a single row is written.

**Fix.** Resolve the actor once per request and pass the context to subsequent permission
checks (the signature already accepts an `ActorContext`-shaped object).

---

## BE-006 · Substring search instead of the full-text index · **P2**

**Location** `src/app/api/issues/route.ts:178-184`

```ts
where.OR = [
  { title: { contains: search, mode: 'insensitive' } },
  { key:   { contains: search, mode: 'insensitive' } },
  { description: { contains: search, mode: 'insensitive' } },
]
```

`ILIKE '%term%'` cannot use a B-tree index — this is a sequential scan of the project's
issues on every keystroke-driven request. Meanwhile the schema *has* a
`searchVector Unsupported("tsvector")` column maintained by a DB trigger, and
`search-service.ts` uses it correctly. The primary issue list simply does not.

**Fix.** Route `?search=` through the tsvector path, or add a `pg_trgm` GIN index if
substring semantics are genuinely wanted.

---

## BE-007 · Inconsistent error contract · **P2**

Errors take at least four shapes across the API:

```jsonc
{ "error": "Forbidden" }
{ "error": "Invalid request", "details": [ /* zod issues */ ] }
{ "error": "Forbidden", "details": { "role": "...", "requiredPermission": "...",
                                     "grantedPermissions": [...] } }
{ "error": "<raw error.message>" }            // password-reset/request:56-63
```

There is no error code, no correlation ID, and no machine-readable discriminator. The
fourth shape leaks internal messages (e.g. SMTP/nodemailer text) to the client.

**Fix.** One envelope — `{ error: { code, message, details?, requestId } }` — produced by a
shared helper. Never echo `error.message` for 5xx.

---

## BE-008 · Observability is 273 `console.error` calls · **P1**

There is no structured logging, no correlation/request IDs, no metrics, no tracing, and no
error tracker. The only instrumentation in the codebase is `console.error(...)` in 273
places, plus `log: ['error']` on the Prisma client.

You cannot currently answer: *what happened, why, who was affected, when*. The audit trail
(`Activity`, `SecurityAuditEvent`) is good for business events but tells you nothing about
latency, error rates, queue depth or DB saturation.

**Fix.** Structured JSON logger with a request ID injected in `proxy.ts` and propagated;
`/api/metrics` exposing request latency/error rate, DB pool utilisation, BullMQ queue
depth and job failure rate, webhook delivery success rate, auth failure rate; OpenTelemetry
traces; Sentry (or equivalent) for exceptions.

---

## BE-009 · Health check does not reflect readiness · **P1**

**Location** `src/app/api/health/route.ts`

```ts
const ready = databaseOk        // Redis is reported but never affects the verdict
return NextResponse.json({ status: ready ? 'ok' : 'degraded', ... },
                         { status: ready ? 200 : 503 })
```

Verified with Redis stopped: `{"status":"ok","checks":{"redis":"degraded"}}` with HTTP 200
— while every non-admin login was broken (see SEC-002). Docker's healthcheck and any
orchestrator will keep the instance serving.

**Fix.** Split `/api/health/live` (process up) from `/api/health/ready` (dependencies
required to serve traffic). Redis must fail readiness while auth depends on it.

---

## BE-010 · No graceful shutdown · **P2**

Nothing handles `SIGTERM`. On deploy or restart the process dies with in-flight requests,
open SSE streams and a running BullMQ worker. BullMQ jobs mid-execution are not `close()`d,
so they wait for the stalled-job timeout before being retried.

**Fix.** `SIGTERM` handler: stop accepting connections, drain in-flight requests, close
SSE streams, `await worker.close()`, `await db.$disconnect()`.

---

## Reliability posture

| Capability | Status |
|---|---|
| DB transient-error retry | ✅ `runWithDbRetry`, sensible Prisma code set |
| Optimistic locking | ✅ real, enforced in-transaction, 409 on conflict |
| Advisory-lock key allocation | ✅ `lockProjectIssueSequence` |
| Webhook retry + backoff + auto-disable | ✅ good |
| Email queue with retry | ✅ BullMQ, 3 attempts, exponential |
| Idempotency keys on mutations | ❌ none |
| Dead-letter queue | ❌ none |
| Circuit breakers | ❌ none |
| Graceful shutdown | ❌ none |
| Readiness vs liveness | ❌ conflated |
| Durable side effects | ❌ fire-and-forget |
