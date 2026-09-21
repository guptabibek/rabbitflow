# DevOps & Deployment Audit

## OPS-001 · No CI/CD · **P1**

`.github/` does not exist. No GitHub Actions, no GitLab CI, no Jenkinsfile, no pipeline of
any kind.

Nothing runs on push or pull request: not `tsc`, not `eslint`, not `npm test`, not
Playwright, not `docker build`, not a vulnerability scan. Every quality gate in this
repository is opt-in and manual.

The commit history reflects the consequence — `..`, `........`, `......`,
`...................` as messages, with `9fe8281 all bugs fixed` and `339e81c fixes`.
There is no review gate and no automated verification that any commit builds.

**Fix.** A pipeline on every PR: install → `prisma generate` → `tsc --noEmit` → `eslint` →
`npm test` → `prisma migrate deploy` against an ephemeral Postgres → Playwright → `docker
build`. Block merge on failure. Add Dependabot/Renovate and `npm audit`.

---

## OPS-002 · No backups, no restore, no DR · **P0**

Repeated from `security-audit.md` SEC-005 because it is an operations finding first.
Repository-wide search for `backup`, `pg_dump`, `restore`, `pitr`, `wal` → **zero matches**
in `docker/`, `docker-compose*.yml`, `scripts/`, `README.md`.

`postgres_data`, `redis_data`, `app_uploads` are plain named volumes. No snapshots, no
retention, no off-host copy, no tested restore, no RPO/RTO stated anywhere.

**Fix.** Nightly `pg_dump` to off-host object storage; WAL archiving for PITR; uploads
mirrored (or moved) to object storage; documented retention; and a **restore rehearsal**
recorded in the runbook with a date.

---

## OPS-003 · No TLS in the production stack · **P0**

`docker/nginx.production.conf.template` has a single `listen 80;`. Commit `91ea184` is
literally titled *"remove https"*. There is no certificate management, no HTTP→HTTPS
redirect, and no HSTS.

Combined with `getAuthCookieOptions` deriving `secure` from the client-supplied
`X-Forwarded-Proto` (see SEC-011), every session cookie crosses the network in cleartext
without the `Secure` flag.

**Fix.** Terminate TLS at nginx (or put the stack behind a managed LB/Cloudflare); redirect
:80 → :443; add HSTS with preload; set `$forwarded_proto` from `$scheme` at the trusted
edge rather than echoing the client header.

---

## OPS-004 · Datastore ports published in the production compose · **P0**

```yaml
postgres:  ports: ["${POSTGRES_PORT:-5433}:5432"]
redis:     ports: ["${REDIS_PORT:-6380}:6379"]
           command: ["redis-server","--appendonly","yes","--save","60","1",
                     "--loglevel","warning"]        # ← no --requirepass
```

A production compose file publishes both datastores to the host interface, and Redis
requires **no password**. Redis holds MFA challenges and password-reset OTPs, so
unauthenticated Redis access is an authentication bypass.

The `internal` network is already declared `internal: true` and both services are attached
to it — the port publishing is unnecessary as well as dangerous.

**Fix.** Delete both `ports:` blocks. Add `--requirepass ${REDIS_PASSWORD}` and pass it
through to `REDIS_URL`. If host access is genuinely required for ops, bind to `127.0.0.1`.

---

## OPS-005 · No environment contract · **P1**

There is **no `.env.example`** in the repository. `.dockerignore` references
`!.env.docker.example`, a file that does not exist.

The application reads **31 environment variables**, discovered only by grepping source:

```
DATABASE_URL  DATABASE_CONNECTION_LIMIT  JWT_SECRET  CRON_SECRET
APP_URL  NEXT_PUBLIC_APP_URL  NODE_ENV
REDIS_URL  REDIS_TLS_URL  UPSTASH_REDIS_URL  UPSTASH_REDIS_TLS_URL
REDIS_HOST  REDIS_PORT  REDIS_PASSWORD  REDIS_KEY  REDIS_USERNAME  REDIS_TLS
UPSTASH_REDIS_PASSWORD
AUTH_SESSION_TTL_SECONDS  AUTH_SESSION_TTL_DAYS  ALLOW_HEADER_AUTH
MFA_ISSUER  MFA_REQUIRE_ENROLLMENT  MFA_CHALLENGE_TTL_SECONDS
PASSWORD_RESET_OTP_TTL_SECONDS
SMTP_HOST  SMTP_PORT  SMTP_SECURE  SMTP_USER  SMTP_PASS  SMTP_FROM
SMTP_TLS_REJECT_UNAUTHORIZED
RUN_BOOTSTRAP_SEED  SEED_ADMIN_*  SEED_PROJECT_*
```

**No startup validation.** `JWT_SECRET` in particular:

```ts
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)
```

If unset, this encodes to an empty key rather than failing loudly. `docker-compose.production.yml`
does use `${JWT_SECRET:?...}` guards for six variables, which is good — but the application
itself has no guard, so any non-compose deployment can start misconfigured.

**Also:** Prisma CLI reads `.env`, not `.env.local`, so `npx prisma migrate deploy` fails
for a developer who followed the Next.js convention. Undocumented friction.

**Fix.** Commit `.env.example` documenting all 31 variables. Add a zod-validated
`src/lib/env.ts` parsed once at startup that hard-fails on missing/invalid required
variables, with `JWT_SECRET` required to be ≥32 bytes. Document the `.env` vs `.env.local`
distinction.

---

## OPS-006 · Migrations run in the app entrypoint · **P1**

```sh
# docker/entrypoint.sh
npx prisma migrate deploy
if [ "${RUN_BOOTSTRAP_SEED:-false}" = "true" ]; then npm run db:seed:bootstrap; fi
exec node server.js
```

Three problems:

1. **Every replica runs migrations on start.** Prisma's advisory lock serialises them, but
   the losers block until the winner finishes — potentially past their healthcheck
   `start_period` (45s), causing restart loops during a slow migration.
2. **No `CREATE INDEX CONCURRENTLY`** anywhere (verified: 0 occurrences across 138 index
   creations), so a migration on a populated table blocks writes for its duration — see
   `database-architecture.md` DB-002.
3. **No rollback path.** Prisma has no down-migrations, and none are hand-written. There is
   no documented procedure for a failed deploy.

**Fix.** A dedicated one-shot migration job that runs to completion before the app rolls;
`CONCURRENTLY` for indexes on populated tables; expand/contract for column changes; a
documented rollback procedure per release.

---

## OPS-007 · Dockerfile inefficiencies · **P2**

```dockerfile
FROM base AS runner
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev                              # ← prunes a full node_modules
COPY --from=builder /app/.next/standalone ./          # ← which standalone already bundles
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
```

`output: "standalone"` already produces a self-contained `node_modules`. Copying the full
`deps` tree and then pruning it duplicates work and inflates the image. There is also **no
`HEALTHCHECK` instruction** (the healthcheck lives only in compose, so a plain
`docker run` has none).

`.dockerignore` omits `tests`, `playwright-report`, `test-results`, `docs`, `.vs`,
`prisma/dev.db` — all of which land in the build context. Note that `prisma/dev.db`
(a SQLite file) is **committed to the repository** despite the datasource being PostgreSQL.

**Fix.** Drop the `deps` copy and the prune; rely on standalone plus the Prisma engine
copy. Add `HEALTHCHECK`. Extend `.dockerignore`. Delete `prisma/dev.db`, `dev.err.log`,
`dev.out.log`, `.vs/`, `test-results/`, `playwright-report/` from version control.

---

## OPS-008 · No rate limiting or WAF at the edge · **P1**

`nginx.production.conf.template` declares no `limit_req_zone` and no `limit_conn_zone`.
Nothing throttles `/api/auth/login`, `/api/auth/register`,
`/api/auth/password-reset/request`, `/api/search`, or the nine report endpoints.

Also: `add_header` directives inside the `location /_next/static/` block **discard** the
four server-level security headers for static assets (nginx `add_header` inheritance
replaces rather than merges).

**Fix.** `limit_req_zone` per IP for `/api/auth/*`; `limit_conn` globally; repeat the
security headers in every `location` block that adds its own (or use `always` at server
level and avoid location-level `add_header`).

---

## OPS-009 · No observability stack · **P1**

No metrics endpoint, no tracing, no log aggregation, no error tracker, no alerting, no
dashboards, no uptime monitoring. Logging is 273 `console.error` calls to stdout, captured
only by the compose `json-file` driver with 10 MB × 5 rotation.

There is no way to answer "is the product currently healthy?" beyond a health endpoint
that returns `ok` while login is broken (BE-009).

**Fix.** Structured JSON logging with a request ID from `proxy.ts`; `/api/metrics` for
Prometheus (request latency, error rate, DB pool utilisation, BullMQ queue depth and
failure rate, webhook success rate, auth failure rate); OpenTelemetry traces; Sentry;
alerts on error rate, p99 latency, queue depth and health-check failure.

---

## OPS-010 · Single points of failure · **P2**

- **Uploads on local disk.** `app_uploads` is a single-node volume — the app cannot scale
  horizontally without shared storage, and the volume has no backup.
- **BullMQ worker runs in-process** (`instrumentation.ts`). Scaling the web tier scales the
  worker with it; there is no independent worker deployment and no way to scale email
  throughput separately.
- **Cron is a single alpine container** with no leader election. Running two would double
  every recurring task and SLA evaluation.
- **No `deploy.resources` limits** on any service — one runaway report query can starve the
  host.

---

## What is good

Genuinely competent for a project with no CI:

- **Multi-stage Dockerfile** with `output: "standalone"`, running as a **non-root** user
  (`nextjs`), with `openssl`/`ca-certificates` installed for Prisma.
- **`security_opt: no-new-privileges:true`** on every service.
- **nginx runs `read_only: true`** with tmpfs mounts for `/tmp`, `/var/cache/nginx`,
  `/var/run` — a detail most projects miss.
- **Dependency-ordered startup** with real healthchecks (`pg_isready`, `redis-cli ping`,
  an app-level `fetch` to `/api/health`) and `condition: service_healthy` gating.
- **Network segmentation** with an `internal: true` network for datastores — correct in
  design, undermined only by the published ports in OPS-004.
- **Log rotation** configured on every service.
- **Required-variable guards** (`${JWT_SECRET:?...}`) in the production compose.
- **Four security headers** at the nginx server level.
- **`init: true`** for correct signal/zombie handling.
- **Named, parameterised volumes** — easy to snapshot once a backup process exists.
