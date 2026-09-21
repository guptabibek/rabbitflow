# Performance Audit

> Measurements taken from a production build (`npm run build`) and a running instance.
> No load testing was performed — the findings below are structural, not benchmark-derived.

## Frontend

### PERF-001 · 1.17 MB single JS chunk · **P1**

```console
$ find .next/static/chunks -name "*.js" | sort by size
  1167.4 KB  0yyj7gudcnehv.js      ← the monolithic page.tsx chunk
   222.3 KB  0yl257biw2tv8.js
   134.2 KB  178a4ynnpox30.js
   127.2 KB  × 3
   ...
  Total client JS: 2.6 MB (uncompressed)
```

`src/app/page.tsx` statically imports all 27 view components, so a user landing on the
Dashboard downloads and parses the code for Reports, Roadmap, Portfolio, Test Plans, SLA,
Automations, Imports, Branding and the 2,023-line work-item-type editor — none of which
they may ever open.

Roughly ~330 KB gzipped for that one chunk, before the framework. On a mid-tier laptop
over typical office wifi this is tolerable; on a 3G connection or a low-end device it is
several seconds of blank screen.

**Fix.** Route-based code splitting (FE-001) is the structural fix and gives this for free.
As an interim, `next/dynamic` for the ten heaviest views (`work-item-type-management`,
`admin-config-panel`, `reports-view`, `sprint-view`, `import-wizard`,
`automation-rule-builder`, `test-plan-manager`, `branding-studio`, `acl-management`,
`onboarding-config-view`) would cut the initial chunk substantially with a one-day change.

### PERF-002 · Twelve unused dependencies in the tree · **P2**

`@tanstack/react-query`, `next-auth`, `next-intl`, `framer-motion`,
`@tanstack/react-table`, `@mdxeditor/editor`, `react-syntax-highlighter`,
`@reactuses/core`, `@hookform/resolvers`, `uuid`, `sharp`, `z-ai-web-dev-sdk` — all zero
references in `src/`. Tree-shaking removes most from the client bundle, but they inflate
install time, image size and supply-chain surface. See FE-004.

### PERF-003 · No list virtualisation · **P2**

List View, Backlog and board columns render every loaded row. Currently capped at 200
items (FE-003), so this is masked — but the cap is itself the bug. Removing the cap
without virtualisation will move the problem rather than solve it.

**Fix.** `@tanstack/react-virtual` (or the already-installed-but-unused
`@tanstack/react-table` with virtualisation) for lists over ~100 rows, introduced together
with server-side pagination.

### PERF-004 · No image optimisation · **P3**

`next/image` is not used; `@next/next/no-img-element` is disabled in ESLint. Avatars and
attachments are served as raw files from `public/uploads` at original resolution — a
5 MB avatar upload is served as 5 MB to every viewer. `sharp` is installed and unused.

---

## Backend

### PERF-005 · SSE polling is the dominant query load · **P1**

Two SSE endpoints poll PostgreSQL on a timer while holding a connection for 5 minutes:

| Endpoint | Interval | Queries/poll |
|---|---|---|
| `/api/realtime/project/stream` | 8 s | 2 (presence + activity) |
| `/api/notifications/stream` | 10 s | 1 (unread count) |

Per connected user: **~0.22 queries/sec of pure polling**, plus a held HTTP connection.
At 100 concurrent users that is ~22 q/s before any real traffic, against a Prisma pool of
20 (`DATABASE_CONNECTION_LIMIT` default). The synchronised 5-minute forced close also
produces a reconnect stampede.

**Fix.** Redis pub/sub (Redis is already required); publish on write. Add jitter to the
reconnect window regardless.

### PERF-006 · `ensureProjectSystemRecords` on 13 read paths · **P1**

10 parallel `COUNT` queries per project per process per 5 minutes, guarded by an
**in-process** cache — so the cost multiplies by replica count. On a cache miss where the
provisioning check fails, a user's GET blocks on a transaction with a 60-second timeout.
See BE-002.

### PERF-007 · Three actor resolutions per issue creation · **P2**

`POST /api/issues` calls `requireProjectPermission` three times (create, assign,
transition). Each re-runs the full chain: JWT verify → `authSession.findFirst` →
`user.findUnique` → `projectMember.findUnique` → `getProjectPermissionRules`. That is
~15 queries before the first write. See BE-005.

### PERF-008 · `ILIKE '%term%'` on the primary issue list · **P2**

```ts
where.OR = [ { title: { contains: search, mode: 'insensitive' } },
             { key:   { contains: search, mode: 'insensitive' } },
             { description: { contains: search, mode: 'insensitive' } } ]
```

Leading-wildcard `ILIKE` cannot use a B-tree index — a sequential scan of the project's
issues per request. The `Issue.searchVector` tsvector column exists and is used correctly
by `search-service.ts`; the primary list ignores it. See BE-006.

### PERF-009 · Offset pagination · **P3**

`skip: (page - 1) * pageSize` degrades linearly with depth. Irrelevant at current volumes;
becomes measurable past ~10k rows. Keyset pagination on `[updatedAt, id]` (already indexed)
is the eventual fix.

### PERF-010 · Report endpoints are unbounded and uncached · **P2**

`src/lib/domain/reports.ts` is 1,258 lines of multi-table aggregation across nine
endpoints. Only sprint analytics uses `withCache`. There is no rate limit (SEC-012), no
result cap, and no query timeout — so the Reports tab is the cheapest available way for an
authenticated user to saturate the database.

---

## Database

### PERF-011 · Connection pool sized below concurrent demand · **P1**

`DATABASE_CONNECTION_LIMIT` defaults to **10** in `src/lib/db.ts` and **20** in the
production compose. Against that budget:

- SSE polling (PERF-005) holds and cycles connections continuously,
- `ensureProjectSystemRecords` issues 10 parallel counts (PERF-006),
- `POST /api/issues` uses ~15 sequential queries (PERF-007),
- report aggregations hold connections for seconds (PERF-010).

Pool exhaustion surfaces as Prisma `P2024` — which `isTransientDbError` correctly
classifies and `runWithDbRetry` retries, so the symptom is latency rather than errors.
That masking makes it harder to diagnose.

**Fix.** Raise the limit, add PgBouncer in transaction mode, and — more importantly —
remove the polling and lazy-provisioning load that creates the pressure.

### PERF-012 · Index creation locks tables at deploy · **P1**

138 `CREATE INDEX` statements, **zero** `CONCURRENTLY`, executed from the app container
entrypoint. On a populated table this is write downtime during deploy. See DB-002 /
OPS-006.

### PERF-013 · Unbounded log tables · **P2**

`Activity`, `Notification`, `WebhookDelivery` (up to 4 KB response body per attempt),
`AutomationLog`, `SecurityAuditEvent`, `AuthSession` grow forever with no retention or
partitioning. See DB-005.

---

## What is good

- **Indexing is thorough and query-shape-driven.** `Issue` carries 19 indexes including
  the exact composites the board and backlog need
  (`[projectId, status, columnOrder]`, `[projectId, status, parentIssueId, columnOrder]`).
- **A bootstrap endpoint collapses 9 requests into 1** (`/api/projects/bootstrap`), with a
  segmented `Promise.allSettled` fallback that degrades partially rather than failing whole.
- **`withCache` is used correctly** where it is used — sprint analytics, work-item detail
  bootstrap — with explicit invalidation from write paths (`invalidateSprintCaches`).
- **Transient DB errors are classified and retried** with backoff (`runWithDbRetry`).
- **Advisory locking for issue-key allocation** avoids both duplicate keys and a global
  sequence bottleneck.
- **Pagination and caps exist at the API layer** (`pageSize` capped at 200, search results
  at 50) even though the UI does not use them.
- **`minimal=true` projection** on `/api/issues` returns a narrow column set for pickers —
  a deliberate over-fetching mitigation.

## Priority order

Fix in this sequence — each reduces the pressure that makes the next one visible:

1. **PERF-005** SSE polling → Redis pub/sub *(largest DB load reduction)*
2. **PERF-006** lazy provisioning off the read path
3. **PERF-001** code splitting *(largest user-perceived win)*
4. **PERF-012** `CONCURRENTLY` + migration job *(removes deploy downtime)*
5. **PERF-011** pool sizing + PgBouncer
6. **PERF-008 / PERF-010** tsvector search, report caching and rate limits
