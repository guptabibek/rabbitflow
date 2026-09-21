# Remediation Log

Changes made during the audit engagement, after the audit was complete. Each entry
names the finding it closes and how it was verified.

## Validation after these changes

```console
npx tsc --noEmit     →  clean (was: 2 errors in tests/e2e/project-onboarding.spec.ts)
npm test             →  221 passing, 0 failing (was: 155 passing)
npm run lint         →  2 errors, both pre-existing (react-hooks/set-state-in-effect)
npm run build        →  Compiled successfully; /api/health, /api/health/live,
                        /api/health/ready all registered
```

---

## Closed — P0

### SEC-001 · Arbitrary file upload → stored XSS
**Files:** `src/lib/domain/file-upload.ts` (new), `api/users/[userId]/avatar/route.ts`,
`api/attachments/route.ts`, `next.config.ts`

- New `validateUploadBuffer()` validates uploads by **magic bytes**, not by the
  client-supplied `File.type` or filename extension.
- Stored filenames are now **fully server-generated**
  (`<prefix>-<timestamp>-<uuid><detected-extension>`); no part of the client filename
  survives, so extension smuggling and path traversal are structurally impossible.
- SVG is deliberately excluded from the allow-list — it is XML that browsers execute
  script from.
- Text attachments are additionally screened for markup/script prefixes, since HTML,
  SVG and JS are all valid UTF-8 and cannot be distinguished by content alone.
- `Attachment.mimeType` now records the **detected** type; `fileName` stores a
  sanitised display-only name.
- Defence in depth in `next.config.ts`: `/uploads/*` responses carry
  `Content-Security-Policy: default-src 'none'; ...; sandbox` plus `nosniff`, and
  `/uploads/attachments/*` additionally carries `Content-Disposition: attachment`.
  Avatars are deliberately excluded from the attachment disposition so they still
  render in `<img>`.

**Verified:** the exact payload reproduced against the running app during the audit
(`<html><body><script>alert(document.domain)</script>XSS-PROOF</body></html>` uploaded
as `evil.html` with `Content-Type: image/png`) is now rejected on both the avatar and
attachment paths. 13 regression tests in `tests/domain/file-upload.test.ts`.

**Not yet done (Phase 0.2):** uploads still live under `public/`. Serving them through
an authorising route remains outstanding — a user of project A can still fetch a
project B attachment if they learn its URL. The CSP and validation remove the
code-execution vector; they do not add per-file authorization.

### SEC-003 · Administrators bypassed MFA
**File:** `api/auth/login/route.ts`

Removed the `if (user.globalRole === 'admin')` branch that issued a session with
`mfaBypassed: true` before MFA was ever evaluated. Administrators now follow the same
enrolment and verification path as every other account. A comment records why the
branch must not return.

**Verified:** the only remaining `mfaBypassed` reference in the login route is
`mfaBypassed: false` on the legitimate no-MFA-configured path.

### SEC-004 · Password-reset OTPs from `Math.random()`
**File:** `src/lib/auth-otp.ts`

`generateNumericOtp()` now uses `crypto.randomInt()`. Added `secretsMatch()` — a
constant-time comparison built on `timingSafeEqual` that handles length mismatch
without throwing.

**Verified:** 7 regression tests in `tests/domain/auth-otp.test.ts`, including a
distribution check over 1000 draws.

### OPS-004 · Datastores exposed on the host; Redis unauthenticated
**File:** `docker-compose.production.yml`

- Removed `ports:` from `postgres` and `redis`; both now use `expose:` and are
  reachable only over the `internal` network.
- Redis requires `--requirepass ${REDIS_PASSWORD}`; the healthcheck authenticates;
  `REDIS_URL` carries the credential.
- `REDIS_PASSWORD` is a required variable (`:?` guard).

---

## Closed — P1 / P2

### SEC-009 · User directory readable by any account
**File:** `src/lib/domain/search-service.ts`

User search now filters on `projectMemberships: { some: { projectId: { in: targetProjectIds } } }`,
matching the scoping every other search branch already applied. The early return was
simplified accordingly: a caller with no memberships now has nothing to search.

### SEC-008 · Open self-registration
**File:** `api/auth/register/route.ts`

Registration is disabled unless `ALLOW_SELF_REGISTRATION=true`, and can be further
restricted with `ALLOWED_SIGNUP_EMAIL_DOMAINS`. Returns 403 with a distinguishable
`code` rather than silently accepting.

**Behaviour change:** existing deployments relying on open signup must set
`ALLOW_SELF_REGISTRATION=true` explicitly.

### SEC-015 · Password reset did not revoke sessions
**File:** `api/auth/password-reset/confirm/route.ts`

Calls `revokeAllUserSessions(userId, 'PASSWORD_RESET')` on success, and compares the
submitted OTP with `secretsMatch` instead of `!==`.

### SEC-023 · Timing-unsafe secret comparison
**Files:** `api/cron/route.ts`, `api/recurring-tasks/execute/route.ts`,
`api/sla-timers/check-breaches/route.ts`

All three now use `secretsMatch(CRON_SECRET, secret)`. The fail-closed behaviour when
`CRON_SECRET` is unset is preserved.

### SEC-020 · No security headers from the application
**File:** `next.config.ts`

`nosniff`, `SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, HSTS on all routes;
`poweredByHeader: false`. These are emitted by the app because nginx's `add_header`
inheritance means any `location` block with its own header discards the server-level
set — as `/_next/static/` currently does.

### BE-009 · Health check reported `ok` while login was broken
**Files:** `api/health/route.ts`, `api/health/live/route.ts` (new),
`api/health/ready/route.ts` (new), `src/proxy.ts`, `docker-compose.production.yml`

- `/api/health/live` — process liveness only; never checks dependencies, because a
  restart cannot fix a downed database.
- `/api/health/ready` — fails with 503 when Postgres **or** a configured Redis is
  unreachable, because auth state lives in Redis.
- `/api/health` keeps its shape but now factors Redis into the verdict.
- The proxy allow-list covers `/api/health/*`.
- The compose healthcheck now targets `/api/health/ready`, so an instance that cannot
  serve logins leaves the rotation instead of continuing to take traffic.

This makes the **symptom** of SEC-002 visible. The underlying cause — auth state stored
in a cache whose writes are silently dropped — is Phase 0.5 and is **not yet fixed**.

### TEST-001 · Three test files silently excluded
**Files:** `package.json`, `tests/support/alias-hooks.mjs`,
`tests/support/alias-resolver.mjs` (both new)

`npm test` now globs `tests/domain/**/*.test.ts` instead of enumerating 18 filenames.
The three previously-omitted files needed more than a glob: `work-item-schema.test.ts`
reaches an `@/lib/db` import, which Node's ESM resolver cannot resolve because it does
not read `tsconfig` paths. Added a resolver hook that maps `@/*` to `src/*`.

**Result: 155 → 221 passing tests.** 47 previously-unrun tests now execute, including
the full suite for the 676-line configurable work-item schema engine.

### TEST-005 · E2E suite did not typecheck
**File:** `tests/e2e/support/ui.ts`

`readJson` accepted only `APIResponse`, but `page.waitForResponse()` returns the
unrelated `Response` type. Widened to a union. `npx tsc --noEmit` is now clean across
the whole repository including tests.

### OPS-005 · No environment contract
**Files:** `.env.example` (new), `.gitignore`

Documents all 31 environment variables with their purpose, generation commands for
secrets, and the operational consequence of leaving each unset. Records the `.env` vs
`.env.local` trap that breaks the Prisma CLI. `.gitignore` negates `.env*` for this
file.

### REPO-001 · Build artifacts in version control
**File:** `.gitignore`

Untracked `prisma/dev.db` (a SQLite file in a PostgreSQL project), `dev.err.log`,
`dev.out.log`, `.vs/slnx.sqlite`, `playwright-report/`, `test-results/`.

---

## Still open — highest priority

| ID | Finding | Phase |
|---|---|---|
| **SEC-002** | Redis outage still breaks login; challenges must move to Postgres | 0.5 |
| **SEC-005** | No backups, no restore, no DR | 0.8 |
| **OPS-003** | No TLS; cookie `Secure` flag from a client header | 0.6 |
| **SEC-001b** | Uploads still served from `public/` without per-file authorization | 0.2 |
| **SEC-006** | Webhook SSRF with a read primitive | 1.8 |
| **SEC-007** | User deletion cascade-deletes reported work items | 1.9 |
| **SEC-012** | No rate limiting anywhere | 1.5 |
| **API-002/003** | 401 instead of 403; `/api/rbac` leaks to non-members | 1.7 |
| **OPS-001** | No CI/CD | 1.1 |
| **FE-001** | No routing — no deep links, no code splitting | 2.1 |

See [production-roadmap.md](production-roadmap.md) for the full sequence.

---

## Deliberately not changed

- **The 200-item cap** (FE-003). Removing it without server-side pagination and list
  virtualisation would move the problem rather than fix it. Phase 2.3.
- **`ensureProjectSystemRecords` on the read path** (BE-002). Correct fix is to move
  provisioning to project creation plus a migration backfill; doing that safely needs a
  data migration, not an in-place edit. Phase 3.2.
- **The `status` / `stateId` denormalisation** (DB-004). It is deliberate, applied
  consistently, and load-bearing for board queries. Add a constraint rather than
  unwinding it.
- **Unused dependencies** (FE-004). Removal is safe but touches `package-lock.json`
  broadly; batched into Phase 6.7 so it lands in one reviewable change. `sharp` should
  be **kept** — it is the right tool for image re-encoding in a later hardening pass.
