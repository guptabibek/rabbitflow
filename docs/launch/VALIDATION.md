# Reproducing validation

Current results, fixed defects, remaining failures and exact scope are in [FINAL_LAUNCH_REPORT.md](FINAL_LAUNCH_REPORT.md). This runbook replaces the superseded initial blocked-run table; early Prisma 403 errors no longer describe the current runtime.

From the repository root with Node 24:

```bash
npm ci
npm run db:generate
npm run lint
npx tsc --noEmit --incremental false
npm test
node --test tests/marketing/build.test.mjs
# With REDIS_TEST_URL aimed at a separate test Redis:
node --test --experimental-strip-types tests/runtime/redis-recovery.test.ts
python3 scripts/check-launch-docs.py
npm run build
npm audit
```

Use the [development guide](../getting-started.md) to create separate disposable database targets. Apply SQL migrations before database tests. Both DATABASE_URL and TEST_DATABASE_URL must name the same dedicated test database; integration fixtures clear their own test data. Never point the suite at existing development/customer data. New audit databases and unique Docker volumes were used for this review.

For browser checks, use the documented Playwright configuration after provisioning a compatible browser. This environment used externally installed Chromium 138, one worker and the existing authentication, issue, project-onboarding and accessibility specs. The full default Chromium suite was then run (49 passes and one configuration-specific skip). Firefox/WebKit and the full device matrix were not executed. Do not infer its results from selected Chromium checks.

For Docker, use [deployment.md](../deployment.md), a new Compose project and unique POSTGRES_VOLUME_NAME/REDIS_VOLUME_NAME/UPLOADS_VOLUME_NAME values. A successful config parse is not a runtime pass: require all service health, seeded login and a representative mutation. Optional corporate CA trust is supported without turning off TLS. Back up and restore only into a separate database; do not reset or remove data volumes during validation.
