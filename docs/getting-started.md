# Development and evaluation

## Native development

Use Node.js 24, npm and PostgreSQL 16. Node 24 is the development/CI target; Docker currently runs Node 22. Never use production data for evaluation or tests.

1. Run `npm ci` from the repository root. The npm lockfile is the installation authority for this workflow; use npm ci for reproducible installs. The stale Bun lockfile described a different dependency set and was removed; Bun installation is not a supported workflow.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to a new local PostgreSQL database and generate a unique `JWT_SECRET` with `openssl rand -base64 48`. Generate separate `CRON_SECRET` (`openssl rand -hex 32`) and `MFA_ENCRYPTION_KEY` (`openssl rand -base64 32`) values. Preserve the MFA key in encrypted backups. Set `APP_URL` to your development origin. Keep secret files private.
3. For native development without Redis, remove/comment `REDIS_URL` and leave alternative Redis bindings unset. If configured, Redis must be reachable for readiness. MFA/OTP challenges use PostgreSQL (`src/lib/auth-otp.ts`). SMTP remains necessary to deliver password-reset mail. With no Redis binding, email is sent directly and no email worker starts; with Redis configured, BullMQ queues delivery and direct SMTP is the enqueue-failure fallback. Both paths have runtime TLS tests. Production SMTP requires verified implicit TLS or STARTTLS.
4. Run `npm run db:generate`, then `npx prisma migrate deploy` against the empty development database. Migrations include SQL full-text-search triggers and indexes. Do not substitute `db push` for a full feature evaluation. Do not run reset commands on existing data.
5. Export the seed variables from a private shell configuration: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, optionally `SEED_ADMIN_NAME`, `SEED_CREATE_PROJECT=true`, `SEED_PROJECT_KEY`, `SEED_PROJECT_NAME`. Run the seed with `.env` loaded: `node --env-file=.env scripts/seed-bootstrap.mjs`. Remove the bootstrap password from your session after success. The seed can promote an existing matching account; use a new database and intentional email.
6. Run `npm run dev`. Verify `curl --fail http://127.0.0.1:3000/api/health/ready`, open the login page, sign in and create a test project/work item. HTTP health alone does not validate the complete workflow.

`npm run db:push` runs a prepare hook querying Project before schema creation; it is unsuitable for initializing an empty database. `npx prisma db push` skips that hook but omits migration-managed SQL behavior.

## Tests

```bash
npm run lint
npx tsc --noEmit --incremental false
npm test
npm run build
```

Create a **separate disposable database with `test` in its name**. Integration helpers truncate tables. Load `.env` in your shell without printing its values, then point **both** `DATABASE_URL` and `TEST_DATABASE_URL` at the test database. Apply `npx prisma migrate deploy` there before `npm run test:integration`. Do not leave the application's development database selected: route handlers use DATABASE_URL while test fixtures use TEST_DATABASE_URL.

For Playwright, read [the E2E guide](../tests/e2e/README.md) and `playwright.config.ts`; install browsers with `npx playwright install --with-deps chromium`. E2E provisioning changes data and must use an isolated database/app. The historical `.env.e2e.example` reference points to a missing file; use `.env.example` and inspect `tests/e2e/support/env.ts` instead.

## Docker evaluation

From a clean checkout: copy `.env.docker.example` to `.env.docker`, generate independent JWT/cron/MFA secrets and set your own bootstrap email/password. Both Compose stacks require an MFA encryption key. Preserve any existing key when upgrading; generating a replacement makes enrolled users' encrypted seeds unreadable. Run:

```bash
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker logs app
curl --fail http://127.0.0.1:4080/api/health/ready
```

Sign in and verify the configured administrator exists. The app logs a bootstrap failure and continues, so healthy HTTP does not prove seeding succeeded. Disable RUN_BOOTSTRAP_SEED after success. The local stack uses public development database defaults and persists PostgreSQL/Redis in named volumes; do not expose it to the Internet. `down` preserves volumes; **`down -v` and `docker:reset` destroy data**. Local Compose does not persist uploads in a named app volume; use the production stack for durable attachments.

For external installation allow HTTPS package registries, Docker image registries, `binaries.prisma.sh`, Alpine's `dl-cdn.alpinelinux.org`, and Go's `proxy.golang.org`/`sum.golang.org` plus documented artifact redirects. Compose builds the app, nginx and PostgreSQL images; see [deployment](deployment.md) for the security fixes in those images. Preserve artifact checksums and TLS checks.

The native `npm run start` command currently invokes `next start`, which serves the built app but warns when output is standalone. For production, use the Docker image's tested standalone entrypoint rather than assuming the native start command packages static assets. The complete Docker image includes those assets and applies migrations at boot.
