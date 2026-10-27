# Reproducing validation

Current results, fixed defects, remaining failures and exact scope are in [FINAL_LAUNCH_REPORT.md](FINAL_LAUNCH_REPORT.md). This runbook replaces the superseded initial blocked-run table; early Prisma 403 errors no longer describe the current runtime.

From the repository root with Node 24:

```bash
npm ci
npm run db:generate
npm audit --audit-level=low
npm run lint
npx tsc --noEmit --incremental false
npm test
node --test tests/marketing/build.test.mjs
# With REDIS_TEST_URL aimed at a separate test Redis:
node --test --experimental-strip-types tests/runtime/redis-recovery.test.ts
# With TEST_DATABASE_URL (also used as DATABASE_URL) naming an isolated migrated
# test database, REDIS_TEST_URL, and openssl available:
node --test --experimental-strip-types tests/runtime/smtp-tls.test.ts
node --test --experimental-strip-types tests/runtime/registration-mfa.test.ts
python3 scripts/check-launch-docs.py
npm run build
```

Use the [development guide](../getting-started.md) to create separate disposable database targets. Apply SQL migrations before database tests. Both DATABASE_URL and TEST_DATABASE_URL must name the same dedicated test database; integration fixtures clear their own test data. Never point the suite at existing development/customer data. New audit databases and unique Docker volumes were used for this review.

For browser checks, use the documented Playwright configuration after provisioning compatible browsers (`npx playwright install --with-deps chromium firefox webkit`). Run `E2E_PRODUCTION_BUILD=true E2E_FULL_MATRIX=true npm run test:e2e` for desktop Chromium/Firefox/WebKit plus the selected Android/iPhone planning/accessibility specs against a production build. CI uses the preinstalled Playwright 1.58.2 container matching the lockfile. Production rate limits stay enabled; test fixtures use distinct synthetic client identities against the isolated server. Registration is deliberately opted in; the default-disabled path is checked separately by integration/container tests. The final CI matrix, any retry cases and expected registration-mode skips are recorded in the final report; do not infer cross-browser results from selected Chromium checks.

For Docker, use [deployment.md](../deployment.md), a new Compose project and unique POSTGRES_VOLUME_NAME/REDIS_VOLUME_NAME/UPLOADS_VOLUME_NAME values. A successful config parse is not a runtime pass: require all service health, seeded login and a representative mutation. Optional corporate CA trust is supported without turning off TLS. Back up and restore only into a separate database; do not reset or remove data volumes during validation.

For the committed production container smoke test, use an isolated Docker host with Docker Compose v2 and enough build disk:

```bash
docker build -t rabbitflow:container-review .
docker build -f docker/nginx.Dockerfile -t rabbitflow-nginx:local .
docker build -f docker/postgres.Dockerfile -t rabbitflow-postgres:local .
node tests/runtime/container-smoke.mjs
```

The script creates random synthetic secrets and uniquely named Compose volumes, checks mandatory TOTP, authorization, mutation, upload bytes, cron, Sharp and restart persistence, then stops the stack while retaining its data volumes. It does not target a supplied database. The `Container review / production-images` CI job also scans app, nginx, PostgreSQL, cron and Redis with Trivy 0.76.1 against the official vulnerability database; high/critical findings fail the job without exclusions. See that workflow for the exact scan commands. Hosted results do not mean images were published. Local cloud builds additionally need the saved Alpine package-host allowance applied; TLS/checksums must remain enabled.
