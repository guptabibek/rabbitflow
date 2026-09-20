# Release validation evidence

Use this runbook against the immutable release image and a disposable load or staging database. Do not record a gate as passed until the command output and date are attached to the release.

## Automated product checks

```bash
npm ci
npx prisma generate
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run test:integration
E2E_FULL_MATRIX=true npm run test:e2e
```

The Playwright matrix covers desktop Chromium, Firefox, WebKit, Pixel 7, and iPhone 15. `tests/e2e/accessibility.spec.ts` fails on critical or serious Axe violations and checks mobile page overflow and accessible button names.

## Production-scale data and capacity

Seed only a disposable database whose URL contains `test`, `load`, or `staging`:

```bash
ALLOW_SCALE_SEED=true SCALE_PROJECT_ID=<id> SCALE_ISSUE_COUNT=10000 npm run seed:scale
```

Run a short capacity gate with an authenticated test-session cookie. The command prints request rate, failures, and p75/p95/p99 latency and exits non-zero above the configured error-rate or p75 budget.

```bash
LOAD_TEST_BASE_URL=https://staging.example.com \
LOAD_TEST_PROJECT_ID=<id> \
LOAD_TEST_COOKIE='auth-token=<test-session-token>' \
LOAD_TEST_DURATION_SECONDS=900 \
LOAD_TEST_CONCURRENCY=25 \
LOAD_TEST_MAX_ERROR_RATE=0.01 \
LOAD_TEST_MAX_P75_MS=1000 \
npm run test:load
```

Record the release image digest, dataset counts, environment shape, command output, database pool saturation, CPU/memory peaks, and logs. Repeat while restarting the app, then while stopping Redis. Readiness must fail when a required dependency is unavailable, in-flight work must recover, and the application must return ready without manual data repair.

## Human acceptance gates

The product success targets require at least five Product Managers, Scrum Managers, Developers, QA users, and Viewers who did not build the feature. Record task outcome, duration, abandonment, browser/device, SUS response, and any workaround for each session. The two-team pilot must cover planning through retrospective for one full sprint.

| Gate | Date | Release/image | Evidence link | Owner | Result |
|---|---|---|---|---|---|
| Cross-browser critical journeys |  |  |  | QA | Pending |
| WCAG automation and manual keyboard/screen-reader review |  |  |  | QA/Design | Pending |
| Production-scale dataset and capacity |  |  |  | Engineering/SRE | Pending |
| Restart and dependency-loss recovery |  |  |  | SRE | Pending |
| Representative usability sessions |  |  |  | Product/Design | Pending |
| Two-team full-sprint pilot |  |  |  | Product/Scrum | Pending |

General availability remains blocked while any row is pending or while a severity-1 or severity-2 product defect is open.
