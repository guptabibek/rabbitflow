# Playwright E2E Suite

Folder structure:

```text
tests/e2e/
|-- fixtures/
|   `-- app.fixture.ts
|-- setup/
|   `-- auth.setup.ts
|-- support/
|   |-- db.ts
|   |-- env.ts
|   `-- ui.ts
|-- auth.spec.ts
|-- issues.spec.ts
|-- notifications-permissions.spec.ts
`-- project-onboarding.spec.ts
```

Run locally:

```bash
copy .env.e2e.example .env
npm install
npm run db:generate
npm run db:push
npm run test:e2e
```

The suite assumes:

- the app is available at `E2E_BASE_URL` or `http://127.0.0.1:3000`
- Playwright can reach the same PostgreSQL database the app uses
- base test users are created automatically during `tests/e2e/setup/auth.setup.ts`