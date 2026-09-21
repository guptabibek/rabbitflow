# Security Audit

> Audit date: 2026-09-05 · Findings marked **[VERIFIED]** were reproduced against a
> running instance of this code, not inferred from reading it.

## Summary

| Severity | Count |
|---|---|
| P0 | 5 |
| P1 | 8 |
| P2 | 9 |
| P3 | 3 |

The authorization model is the strongest part of this codebase: two independent auth
layers, correct project scoping, area-level ACLs, and no SQL injection (every raw query
is parameterised via `Prisma.sql`). The failures are concentrated in **file uploads,
MFA policy, credential generation, and infrastructure exposure**.

---

## P0 — Critical

### SEC-001 · Arbitrary file upload → stored XSS on the app origin **[VERIFIED]**

| | |
|---|---|
| **Category** | Application security / file upload |
| **Location** | `src/app/api/users/[userId]/avatar/route.ts:30-46`, `src/app/api/attachments/route.ts:80-84` |
| **Complexity** | S (½ day) · **Risk of fix**: low |

**Problem.** Neither upload endpoint validates file content. The avatar route checks
`file.type.startsWith('image/')` — a **client-supplied** MIME string — and then derives
the stored filename's extension from the **attacker-controlled** original filename.
The attachment route performs no type check whatsoever. Files land in
`public/uploads/**`, which Next.js serves as static content from the application origin.

**Evidence (reproduced).**
```console
$ curl -b admin.jar -X POST .../api/users/<id>/avatar -F "file=@evil.html;type=image/png"
{"avatar":"/uploads/avatars/cmtnxxxdn0000upo4vzvnur0d-1788586133537.html", ...}

$ curl -b admin.jar -D- .../uploads/avatars/cmtnxxxdn0000upo4vzvnur0d-1788586133537.html
HTTP/1.1 200 OK
Content-Type: text/html; charset=UTF-8

<html><body><script>alert(document.domain)</script>XSS-PROOF</body></html>
```

**Why it matters.** Any authenticated user obtains script execution on the application's
own origin. The session cookie is `httpOnly`, so it cannot be read directly — but the
script runs *as the victim's browser*, so it can issue same-origin `fetch` calls to every
API: exfiltrate all readable projects, change the victim's email, mint API tokens, or
add itself to projects if the victim is an admin. This is a full account-takeover
primitive. `image/svg+xml` gives the same result via SVG.

**Fix.**
1. Allow-list extensions **and** verify magic bytes (`sharp` is already a dependency and
   can validate/normalise images); reject anything else.
2. Generate the stored filename entirely server-side (`randomUUID()` + extension derived
   from the *detected* type). Never trust `path.extname(file.name)`.
3. Stop serving uploads from `public/`. Serve through an authorising route that checks
   the caller can read the parent issue and sets
   `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
4. Add a CSP with `sandbox` for the upload path.

---

### SEC-002 · Redis outage permanently breaks login and password reset **[VERIFIED]**

| | |
|---|---|
| **Category** | Availability / auth |
| **Location** | `src/lib/auth-otp.ts:60-105`, `src/lib/redis.ts:97-113` |
| **Complexity** | M (1–2 days) · **Risk of fix**: medium |

**Problem.** MFA challenges and password-reset OTPs are stored with `cacheSet`, which
**silently discards the write** when Redis is unavailable (`if (!client) return`). The
matching `cacheGet` then returns `null` forever. `MFA_REQUIRE_ENROLLMENT` defaults to
`true` in `docker-compose.production.yml`, so every non-admin login goes through a
challenge.

**Evidence (reproduced with Redis stopped).**
```console
$ curl -X POST .../api/auth/login -d '{"email":"mfauser@test.local","password":"..."}'
{"mfaRequired":true,"setupRequired":true,"challengeToken":"235d4636-...","qrCodeDataUrl":"..."}

$ curl -X POST .../api/auth/mfa/verify -d '{"challengeToken":"235d4636-...","code":"123456"}'
HTTP 401  {"error":"MFA session expired. Please sign in again."}

$ curl .../api/health
{"status":"ok","checks":{"database":"ok","redis":"degraded"}}   ← still reports healthy
```

**Why it matters.** Losing Redis locks every non-administrator out of the product with an
error that instructs them to retry a loop that can never succeed. Password reset — the
documented recovery path — fails identically: the user receives an OTP email for a code
that was never stored. Meanwhile `/api/health` returns **200 `"ok"`**, so Docker and any
orchestrator keep the instance in rotation. The README's claim of "graceful fallback when
Redis is not available" is false for the auth path.

**Fix.** Persist MFA challenges and reset OTPs in PostgreSQL (a short-lived
`AuthChallenge` table with an `expiresAt` index), or reuse the `ephemeralSet` in-memory
fallback and pin sessions. Separately, make `/api/health` distinguish **liveness** from
**readiness** and fail readiness when a dependency required for login is down.

---

### SEC-003 · System administrators bypass MFA unconditionally **[VERIFIED]**

| | |
|---|---|
| **Category** | Authentication policy |
| **Location** | `src/app/api/auth/login/route.ts:126-150` |
| **Complexity** | S (½ day) · **Risk of fix**: low |

**Problem.** The admin branch returns a fully authenticated session *before* MFA is
considered:

```ts
if (user.globalRole === 'admin') {
  const session = await createAuthSession({ request, userId: user.id,
                                            mfaVerified: false, mfaBypassed: true })
  ...
  return response          // ← returns before hasConfiguredMfa is ever evaluated
}
```

An admin who has **explicitly enrolled** in MFA is still never challenged.

**Evidence (reproduced with `MFA_REQUIRE_ENROLLMENT=true`).**
```console
$ curl -X POST .../api/auth/login -d '{"email":"admin@rabbitflow.local","password":"..."}'
{"user":{...,"globalRole":"admin"}}          ← session issued, no challenge

$ psql -c 'SELECT "mfaBypassed","mfaVerifiedAt" FROM "AuthSession" ORDER BY "createdAt" DESC LIMIT 1;'
 t | (null)
```

**Why it matters.** The accounts with the most authority — able to create projects, delete
users, revoke sessions and read every project — are the only accounts exempt from the
second factor. This inverts the intended policy and is the first thing an auditor or
pen-test will flag.

**Fix.** Delete the branch. Admins follow the same enrolment/verification path as
everyone else. If a break-glass path is genuinely needed, make it an explicit, separately
credentialed, heavily audited flow — not a silent `globalRole` check.

---

### SEC-004 · Password-reset OTPs generated with `Math.random()`

| | |
|---|---|
| **Category** | Cryptography |
| **Location** | `src/lib/auth-otp.ts:33-37` |
| **Complexity** | XS (1 hour) · **Risk of fix**: none |

```ts
export function generateNumericOtp(length = 6) {
  const max = 10 ** length, min = 10 ** (length - 1)
  return String(Math.floor(Math.random() * (max - min) + min))
}
```

`Math.random()` is a non-cryptographic PRNG (V8 uses xorshift128+). Its internal state is
recoverable from a modest number of outputs, making subsequent OTPs predictable. This is
the **account-recovery** code path.

**Fix.** `crypto.randomInt(100000, 1000000)`. Also compare the submitted code with
`crypto.timingSafeEqual` rather than `!==`.

---

### SEC-005 · No backups, no restore procedure, no disaster recovery **[VERIFIED]**

| | |
|---|---|
| **Category** | Operations / data durability |
| **Location** | repository-wide |
| **Complexity** | M (2–3 days) · **Risk of fix**: low |

A repository-wide search for `backup`, `pg_dump`, `restore`, `pitr`, `wal` returns
**zero matches** in `docker/`, `docker-compose*.yml`, `scripts/`, and `README.md`.
`postgres_data`, `redis_data` and `app_uploads` are plain Docker volumes with no snapshot,
no retention policy and no tested restore. A volume loss, a bad migration, or the
`DELETE /api/users/[userId]` cascade in SEC-007 is unrecoverable.

**Fix.** Nightly `pg_dump` sidecar to off-host storage, WAL archiving for PITR, uploads
mirrored to object storage, retention policy, and a **restore rehearsal** recorded in the
runbook. A backup that has never been restored is a hypothesis.

---

## P1 — High

### SEC-006 · SSRF with a full read primitive via webhooks **[VERIFIED by code path]**

**Location** `src/lib/domain/webhook-service.ts:163-196`, `src/app/api/webhooks/route.ts:11`

Webhook URLs are validated only by `z.string().url()` — no scheme allow-list, no
private/link-local address blocking. The dispatcher then stores the response:

```ts
const response = await fetch(webhook.url, { method: 'POST', headers, body, signal })
statusCode   = response.status
responseBody = await response.text().catch(() => null)
...
await db.webhookDelivery.create({ data: { ..., responseBody: responseBody?.slice(0, 4096) } })
```

`webhook-management.tsx:120-127` fetches `/api/webhooks/{id}?deliveries=true` and renders
`responseBody`. A project Admin (or any role with `operations:manage`) can therefore read
4 KB of any HTTP endpoint the container can reach — `http://169.254.169.254/…` for cloud
credentials, or `http://postgres:5432` / `http://redis:6379` on the compose `internal`
network. Redis has no password (SEC-010), which compounds this.

**Mitigating factor:** project creation requires a system admin, so a self-registered
user cannot mint their own project to use as a gadget.

**Fix.** Allow-list `https:` (and `http:` only for explicitly configured internal hosts);
resolve the hostname and reject RFC-1918, loopback, link-local and IPv6-mapped equivalents
**before** connecting, re-checking after redirects (or disable redirects); do not persist
response bodies beyond a status code and a short reason.

---

### SEC-007 · Hard user deletion cascades into catastrophic data loss

**Location** `src/app/api/users/[userId]/route.ts:120-139`, `prisma/schema.prisma:481`

```prisma
reporter User @relation("ReportedIssues", fields: [reporterId], references: [id], onDelete: Cascade)
```

`DELETE /api/users/{id}` calls `db.user.delete()`. Because `Issue.reporter` cascades,
**deleting a user deletes every work item they ever reported** — along with those items'
comments, attachments, activity, relations, field values and SLA timers. Offboarding one
employee can erase years of project history. There is no confirmation requirement, no
soft delete, no audit event, and no self-deletion guard.

**Fix.** Change `onDelete: Cascade` → `SetNull`/`Restrict` on `Issue.reporter`,
`Attachment.user` and `Comment.author`; replace the endpoint with the existing
deactivation flow (`isActive`, `deactivatedAt` already exist and are used by
`/api/admin/security/users/[userId]`); write a `SecurityAuditEvent` for every change.

---

### SEC-008 · Open self-registration on an "enterprise workspace" **[VERIFIED]**

**Location** `src/app/api/auth/register/route.ts`

`POST /api/auth/register` is public and unrestricted. No invitation, no email
verification, no domain allow-list, no admin approval, no rate limit — and it issues a
session **immediately**, bypassing the MFA enrolment policy that the login route enforces.

```console
$ curl -X POST .../api/auth/register -d '{"name":"Attacker","email":"attacker@evil.test","password":"Password123!"}'
{"user":{"id":"cmtnxz0fo0002up7c06vrcuyy","globalRole":"member"}}   ← HTTP 201, session set
```

New accounts see no project data (project scoping holds), but they gain an authenticated
foothold: the user directory (SEC-009), `/api/portfolio`, `/api/reports/executive`, and
any future endpoint that assumes "authenticated ⇒ trusted".

**Fix.** Gate registration behind `ALLOW_SELF_REGISTRATION` (default `false`) plus an
email-domain allow-list; require email verification; route new users through the same MFA
enrolment as login.

---

### SEC-009 · User directory (names + emails) disclosed to any account **[VERIFIED]**

**Location** `src/lib/domain/search-service.ts:219-243`

The user branch of `globalSearch` queries `db.user.findMany` with **no membership or
tenancy filter** — unlike every other branch, which is scoped to
`accessibleProjectIds`.

```console
# attacker@evil.test — zero project memberships
$ curl -b att.jar '.../api/search?q=admin&types=user'
{"items":[{"type":"user","title":"Audit Admin","subtitle":"admin@rabbitflow.local"}],"total":1}

$ curl -b att.jar '.../api/search?q=rabbitflow&types=user'
{"items":[{"type":"user","title":"Audit Admin","subtitle":"admin@rabbitflow.local"}],...}
```

Searching the corporate email domain enumerates staff 5 at a time. Combined with SEC-008
this is an unauthenticated-equivalent PII harvest and a phishing target list.

**Fix.** Restrict user results to users who share at least one project with the caller
(or gate behind a `project:members:manage`-style permission), and return `email` only
when the caller has a legitimate need.

---

### SEC-010 · Datastores exposed on the host; Redis unauthenticated

**Location** `docker-compose.production.yml:139-141, 158-160, 149`

```yaml
postgres:  ports: ["${POSTGRES_PORT:-5433}:5432"]
redis:     ports: ["${REDIS_PORT:-6380}:6379"]
           command: ["redis-server","--appendonly","yes","--save","60","1", ...]   # no --requirepass
```

A *production* compose publishes both datastores to the host. Redis runs with **no
password**. Redis holds MFA challenges, password-reset OTPs and cached permission data,
so unauthenticated Redis access is an authentication bypass, not just a cache leak.

**Fix.** Delete both `ports:` blocks — the `internal` network already provides access.
Set `--requirepass` and pass `REDIS_PASSWORD`. Use `expose:` if host access is genuinely
needed for ops, and bind to `127.0.0.1` only.

---

### SEC-011 · No TLS anywhere; auth cookie `Secure` flag driven by a client header

**Location** `docker/nginx.production.conf.template:34`, `src/lib/auth.ts:63-79`

nginx listens on `:80` only (commit `91ea184` "remove https"). The auth cookie's `Secure`
attribute is set from `requestUsesHttps()`, which reads the **client-supplied**
`X-Forwarded-Proto` header, and nginx forwards it via
`map $http_x_forwarded_proto $forwarded_proto`. In practice every session cookie is
transmitted in cleartext without `Secure`. Verified: `#HttpOnly_localhost FALSE / FALSE`.

**Fix.** Terminate TLS at nginx, redirect `:80` → `:443`, add HSTS, and set
`$forwarded_proto` from `$scheme` at the trusted edge instead of echoing the client value.

---

### SEC-012 · No rate limiting on any endpoint; lockout is a DoS vector

**Location** `docker/nginx.production.conf.template` (no `limit_req_zone`),
`src/app/api/auth/login/route.ts:19-20`

Nothing limits request rate at the edge or in the application: not login, not
registration, not password reset, not search, not the report endpoints. The only control
is a **per-account** lockout at `MAX_FAILED_LOGIN_ATTEMPTS = 3` for 60 minutes — which,
without a rate limit, lets anyone who knows an email address lock that user out
indefinitely with three requests per hour.

**Fix.** `limit_req_zone` per IP at nginx for `/api/auth/*` and `/api/search`; add
application-level throttling keyed on IP + email; raise the lockout threshold and use
exponential backoff rather than a hard lock.

---

### SEC-013 · Area-level ACLs bypassed by global search

**Location** `src/lib/domain/search-service.ts` (zero references to area scoping)

`/api/issues` applies `getAreaAccessScope` + `applyAreaScopeFilter`, so a user restricted
to certain area paths sees only those work items. `globalSearch` scopes by project
membership only. A user whose ACL confines them to one area can retrieve titles,
descriptions and keys of restricted-area items through search and the command palette.

**Fix.** Apply the same `getAreaAccessScope` filter inside the issue, comment and document
branches of `globalSearch`.

---

## P2 — Medium

| ID | Finding | Location |
|---|---|---|
| SEC-014 | **MFA secrets stored in plaintext.** `User.mfaSecret` is an unencrypted column. Any DB read (backup, replica, SQL injection elsewhere, SEC-010) yields every user's TOTP seed. Encrypt at rest with a KMS/env key. | `prisma/schema.prisma:21` |
| SEC-015 | **Password reset does not revoke sessions.** After a compromise-driven reset, the attacker's existing 30-day session stays valid. Call `revokeAllUserSessions` on success. | `password-reset/confirm/route.ts:63-80` |
| SEC-016 | **Non-members receive 401, not 403.** `requireProjectPermission` returns 401 when `resolveActorContext` yields null. Clients treat 401 as "session dead" and log the user out. Also leaks nothing, but breaks UX. Return 403 for authenticated-but-unauthorised. | `src/lib/domain/auth.ts:196-201` |
| SEC-017 | **`/api/rbac` grants phantom Viewer permissions to non-members** (HTTP 200 + full Viewer permission list), confirming project existence and driving a UI the backend then rejects. Return 403. | `src/app/api/rbac/route.ts:34-43` |
| SEC-018 | **`ALLOW_HEADER_AUTH` escape hatch.** When `true`, `x-user-id` alone authenticates. Not exploitable through the proxy today, but one misconfiguration or one direct-to-container route from full compromise. Delete it or hard-fail when `NODE_ENV === 'production'`. | `src/lib/domain/auth.ts:36-45` |
| SEC-019 | **Regex "sanitiser" gives false confidence.** `sanitizeRichText` strips only `<script>` tags and `javascript:`; `<img onerror>`, `<svg onload>` and nested-tag tricks pass. Not currently exploitable because `react-markdown` escapes raw HTML, but the safety depends on a renderer choice made elsewhere. Use a real sanitiser or drop the function and document the invariant. | `src/lib/domain/content.ts` |
| SEC-020 | **No security headers from the app.** `next.config.ts` sets no CSP, HSTS, X-Frame-Options or Permissions-Policy. nginx sets four, but `add_header` in the `/_next/static/` block **discards** the server-level headers for static assets. `poweredByHeader` is not disabled (`X-Powered-By: Next.js` observed). | `next.config.ts`, nginx template |
| SEC-021 | **Stale `role` claim in a 30-day JWT.** The proxy gates `/admin/**` on the token's `role`. A demoted admin keeps `role: "admin"` in their token until it expires. API routes re-check the DB, so this is page-routing only — but shorten the token TTL and add a refresh, or drop `role` from the claims. | `src/lib/auth.ts:30-42`, `src/proxy.ts:47-55` |
| SEC-022 | **Spoofable client IP in audit records.** nginx uses `$proxy_add_x_forwarded_for` (appends), and `parseClientIpFromHeaders` takes the **first** entry — i.e. the client's own value. Session and audit IPs are attacker-controlled. Use `$remote_addr` at the trusted edge or take the last hop. | `auth-session-core.ts:38-48` |

## P3 — Low

| ID | Finding |
|---|---|
| SEC-023 | Timing-unsafe comparisons for `CRON_SECRET` and password-reset OTP (`!==`). Use `crypto.timingSafeEqual`. |
| SEC-024 | Weak password policy: `z.string().min(8)` only — no complexity, no breach-list check, no maximum-length guard for bcrypt's 72-byte truncation. |
| SEC-025 | User enumeration via distinct responses on register (409), login (401 vs 403 `ACCOUNT_DEACTIVATED` vs 423 `ACCOUNT_LOCKED`), and password reset (503 when SMTP is unset). |

## What is genuinely good

Worth stating plainly, because it is unusual:

- **No SQL injection.** All 12 raw queries use `Prisma.sql` tagged templates with bound
  parameters, including the `tsquery` search path.
- **Two independent auth layers.** Header spoofing is not sufficient to authenticate.
- **Project scoping holds.** A non-member was denied on `issues`, `projects/{id}`,
  `areas`, `labels`, `teams`, `users`, `activity`, `dashboard` and `views` (verified).
- **Optimistic locking is real** — `updateMany({ where: { id, version } })` inside a
  transaction, with a 409 on mismatch.
- **Webhooks are HMAC-signed** (`X-Webhook-Signature-256`), with timeout, backoff and
  auto-disable after 10 failures.
- **Sessions are server-side and revocable**, with device labels, an admin revocation UI
  and a `SecurityAuditEvent` trail.
- **Logout actually revokes** the `AuthSession` row rather than just clearing the cookie.
- **No `any`, no `@ts-ignore`, no `console.log`** in 62.7k lines.
