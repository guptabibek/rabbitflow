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
npm audit
```

Use the [development guide](../getting-started.md) to create separate disposable database targets. Apply SQL migrations before database tests. Both DATABASE_URL and TEST_DATABASE_URL must name the same dedicated test database; integration fixtures clear their own test data. Never point the suite at existing development/customer data. New audit databases and unique Docker volumes were used for this review.

For browser checks, use the documented Playwright configuration after provisioning compatible browsers (`npx playwright install --with-deps chromium firefox webkit`). Set `E2E_FULL_MATRIX=true` for desktop Chromium/Firefox/WebKit plus the selected Android/iPhone planning/accessibility specs. The earlier native production-server run used externally installed Chromium 138 and completed the full default suite (49 passes and one registration-mode skip). The expanded CI run and any failures are recorded in the final report; do not infer cross-browser results from selected Chromium checks.

For Docker, use [deployment.md](../deployment.md), a new Compose project and unique POSTGRES_VOLUME_NAME/REDIS_VOLUME_NAME/UPLOADS_VOLUME_NAME values. A successful config parse is not a runtime pass: require all service health, seeded login and a representative mutation. Optional corporate CA trust is supported without turning off TLS. Back up and restore only into a separate database; do not reset or remove data volumes during validation.
