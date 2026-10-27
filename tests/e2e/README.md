# Playwright E2E suite

Use Node.js 24 and a disposable PostgreSQL database/app. Start with [development setup](../../docs/getting-started.md), `.env.example`, `tests/e2e/support/env.ts` and `playwright.config.ts`. There is no `.env.e2e.example` in this checkout.

Install with `npm ci`, generate Prisma, apply SQL migrations and install browsers with `npx playwright install --with-deps chromium`. Configure the actual E2E variables from support/env.ts; the default app origin is http://127.0.0.1:3000. The runner's webServer configuration starts the app if needed. Test setup provisions synthetic identities; never aim it at production or shared data.

Run `npm run test:e2e` for the default Chromium project. Set `E2E_FULL_MATRIX=true` after installing Firefox/WebKit to include the configured desktop/mobile matrix. Existing Chrome can be selected with E2E_BROWSER_CHANNEL=chrome when intentionally testing that channel. CI sets `E2E_PRODUCTION_BUILD=true` to build/start the production app with rate limits enabled and runs the full matrix in the lockfile-matched Playwright 1.58.2 container. Use `E2E_PRODUCTION_BUILD=true E2E_FULL_MATRIX=true npm run test:e2e` to reproduce after installing all three browser engines. Full browser coverage is a separate release gate, not implied by domain/integration tests.

The suite covers authentication, projects, issues, permissions, planning, ceremonies, feedback, resilience and accessibility. Inspect current runner results; screenshots/videos/traces may contain session or synthetic-user information and must be reviewed before sharing. Reusable auth states are ignored by Git.
