# API Audit

**124 route handlers under `src/app/api/**`**

## Authorization coverage

Every route was enumerated and classified by the authorization helper it calls.

| Guard | Routes | Assessment |
|---|---|---|
| `requireProjectPermission` | 78 | ✅ correct — project-scoped, permission-checked |
| `requireAuthenticatedUser` | 17 | ⚠️ correct only where the resource is user-owned |
| `requireSystemAdmin` | 9 | ✅ correct |
| `requireOnboardingManager` | 7 | ✅ correct (wraps `requireProjectPermission`) |
| Shared-secret (`CRON_SECRET`) | 3 | ✅ fails closed when unset |
| Intentionally public | 6 | ✅ auth endpoints + `/api/health` |

**No unauthenticated route was found that should have been authenticated.** The seven
routes that initially appeared unguarded (`onboarding/*`, `onboarding-guides/[id]`) use
`requireOnboardingManager`, and the three cron routes use a constant-secret check that
correctly refuses when `CRON_SECRET` is unset:

```ts
if (!CRON_SECRET || secret !== CRON_SECRET) return 401
```

This is the strongest area of the codebase. The issues below are about *contract quality*,
not missing authorization — with two exceptions (API-002, API-003).

---

## API-001 · No consistent error envelope · **P2**

Four shapes in production use:

```jsonc
{ "error": "Forbidden" }
{ "error": "Invalid request", "details": [ /* raw zod issues */ ] }
{ "error": "Forbidden", "details": { "role", "requiredPermission", "grantedPermissions" } }
{ "error": "<raw error.message>" }      // password-reset/request/route.ts:56-63
```

No error `code`, no `requestId`, no machine-readable discriminator. Clients cannot
distinguish "validation failed" from "conflict" from "quota exceeded" without string
matching. The fourth shape leaks internal messages (nodemailer/SMTP text) on 5xx.

**Fix.** One envelope from a shared helper:
`{ error: { code: 'WORKITEM_VERSION_CONFLICT', message, details?, requestId } }`.
Never echo `error.message` for 5xx.

---

## API-002 · 401 returned where 403 is correct · **P1**

`requireProjectPermission` returns **401 Unauthorized** when `resolveActorContext` yields
`null` — which happens for a perfectly valid session belonging to a **non-member** of the
project:

```ts
// src/lib/domain/auth.ts:196-201
if (!actor) return { ok: false, response: NextResponse.json(
  { error: 'Authentication required' }, { status: 401 }) }
```

Verified: an authenticated user hitting a project they don't belong to receives
`401 {"error":"Authentication required"}` on `issues`, `projects/{id}`, `areas`, `labels`,
`teams`, `users`, `activity`, `dashboard` and `views`.

Any well-behaved client treats 401 as "session is dead" and redirects to login. So
following a stale link to a project you were removed from **logs you out of the product**.

**Fix.** 401 only when there is no valid session. 403 when the session is valid but the
actor lacks access.

---

## API-003 · `/api/rbac` grants phantom permissions to non-members · **P1**

```ts
// src/app/api/rbac/route.ts:34-43
if (!membership) {
  return NextResponse.json({ projectId, userId, role: 'Viewer',
                             permissions: listPermissions('Viewer'), membership: null },
                           { status: 200 })
}
```

A non-member gets **HTTP 200** with a full Viewer permission set. Verified live: the
self-registered attacker account received `{"role":"Viewer","permissions":["project:read",…]}`
for a project it had no membership in.

Two consequences: it confirms the project exists (information disclosure), and the
frontend — which drives its UI from this response — renders a read-enabled workspace whose
every subsequent API call then fails with 401 (API-002). Backend authorization is not
bypassed, so this is not privilege escalation; it is an information leak that produces a
broken UI.

**Fix.** Return 403 with no permission payload for non-members.

---

## API-004 · Pagination is inconsistent and mostly unused · **P2**

Three different conventions coexist:

| Route | Convention |
|---|---|
| `/api/issues` | `?page`/`?pageSize` → `x-page`, `x-page-size`, `x-total-count` **headers** |
| `/api/reports/work-items` | `{ pagination: { page, pageSize, total, totalPages } }` in **body** |
| Most collection routes | none — return everything |

Routes returning unbounded collections include `/api/labels`, `/api/areas`, `/api/teams`,
`/api/states`, `/api/iterations`, `/api/work-item-types`, `/api/activity`,
`/api/relations`. Fine at current data volumes; unbounded by construction.

**Fix.** One convention (body envelope is friendlier for clients that can't read custom
headers through a proxy), applied to every collection, with a mandatory server-side cap.

---

## API-005 · No idempotency on mutating endpoints · **P2**

No `Idempotency-Key` support anywhere. A retried `POST /api/issues` after a network
timeout creates a duplicate work item. The optimistic-lock `version` field protects
*updates* well, but *creates* have no equivalent.

The one place idempotency exists is issue-key allocation (`lockProjectIssueSequence`
advisory lock), which correctly prevents duplicate keys under concurrency — but not
duplicate issues.

**Fix.** Accept `Idempotency-Key` on POST; store key → response for 24h in Redis.

---

## API-006 · Bulk operations are partial · **P2**

`POST /api/issues/bulk` is the only bulk endpoint. There is no bulk delete, bulk assign,
bulk label, bulk move-to-sprint, or bulk transition — and no bulk endpoints at all for
labels, areas, iterations, members or webhooks. The UI has a `bulk-action-toolbar.tsx` and
selection checkboxes in List View, so the frontend is further along than the API.

---

## API-007 · No API documentation or versioning · **P2**

No OpenAPI spec, no generated client, no `/v1` prefix, no deprecation policy. The
README lists four auth endpoints out of 124. Any consumer — including the API-token
feature that BE-004 shows is not wired up — has nothing to build against.

**Fix.** Generate OpenAPI from the zod schemas (they already exist on every route);
publish at `/api/openapi.json`; version the surface before external consumers exist.

---

## API-008 · No rate limiting · **P1**

Covered in `security-audit.md` SEC-012. Restated here because it is an API-contract gap:
no route declares or enforces a quota, including `/api/auth/login`, `/api/auth/register`,
`/api/auth/password-reset/request`, `/api/search`, and the nine report endpoints (several
of which run multi-table aggregations).

---

## Conventions that are done well

- **Zod validation on every mutating route.** Schemas are specific — enums for status and
  priority, bounded numerics (`storyPoints: 0-100`, `estimatedHours: 0-10000`), trimmed
  non-empty strings, explicit nullable/optional distinctions.
- **Correct status codes for the common cases**: `201` on create, `409` on optimistic-lock
  conflict, `423` on account lockout, `429` on OTP attempt exhaustion, `503` when SMTP is
  unconfigured.
- **Cross-field validation** lives in the domain layer and is reused — e.g.
  `validateIssueSchedule`, `validateIssueReferences`, `validateSprintAssignmentTeamContext`.
- **Reference integrity is checked before writes**, not left to FK errors.
- **Async params handled correctly** for Next 16 (`{ params }: { params: Promise<…> }`).
- **Audit logging on business mutations** via `createAuditLog`, and `SecurityAuditEvent`
  on privileged admin actions.
