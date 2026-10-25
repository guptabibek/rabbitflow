# Launch-readiness audit

Audit date: 2026-10-25. Checkout: guptabibek/rabbitflow, base 52b9206b21b58cf8bd4203c51d030ee49c6a9c56. Scope: repository inventory; manifests/locks; Docker/entrypoint/nginx; Prisma schema/migrations; auth/proxy/domain boundaries; UI/API feature inventory; tests, historical audits, branding and public pages. This is a code/setup review, not an independent penetration test or exhaustive verification of every feature.

## Critical

- **Required runtime validation blocked.** npm dependencies install and PostgreSQL starts, but Prisma schema/query engine checksum requests to binaries.prisma.sh return proxy HTTP 403. Client generation, migrations, database tests and full app behavior cannot be validated. Added the exact domain to the environment configuration draft; runtime access still requires settings propagation. Do not bypass checksums or call the app production-ready.
- **License absent at baseline — resolved in this branch.** Owner explicitly approved MIT. Standard license added; reuse claims updated. Review ownership/third-party notices before release.

## High

- **No clean first-deploy evidence.** Docker entrypoint applies migrations and continues after seed failure. HTTP readiness does not prove an administrator exists. Require actual first login and project/work-item creation.
- **Misleading setup commands — documentation corrected.** Node 18 is insufficient for TypeScript scripts; Node 24 is now the native/CI target, Docker remains Node 22. start is next start, not Bun. db:push prepare queries Project before first schema creation. Direct push omits SQL search triggers. New guidance uses migrate deploy on a new database.
- **Production runbook drift — corrected/cross-referenced.** Historical guide referred to missing .env.production.example, public uploads, published DB ports and generic health. Current production Compose has private DB/cache networking, /app/var/uploads and readiness probes. New deployment guide is authoritative.
- **Security/conduct contact not established.** Private GitHub vulnerability reporting and backup moderation contact must be enabled/designated by owner. Do not invent an email or promise response times.
- **No current CI — definition added, remote execution pending.** Earlier history removed workflows. Added Node 24 + real Postgres verification; its success must be observed after push. Browser matrix is a separate release gate.
- **Recovery and upgrade assurance pending.** Named production DB/Redis/upload volumes exist; restore and compatibility drills have not run. Local evaluation Compose lacks an app uploads volume; documented rather than silently changing production storage.

## Medium

- **README marketing overstated readiness and feature roadmap was stale — rewritten.** Features have code evidence; no guarantee of capacity, parity, compliance or independent security assurance.
- **Release history unverified.** package.json is 0.2.0; no local tags. Git read works. GitHub API request is Forbidden, so API releases, settings and Discussions status cannot be confirmed.
- **Brand assets exist, product screenshots do not.** Existing teal assets retained; new light/dark type banners and isolated marketing site added. Screenshot capture pending a seeded running instance; no fabricated dashboards.
- **SEO cannot be activated for an assumed domain.** Standalone site has semantic metadata; default noindex. Build with a known approved HTTPS origin to emit canonical, OG, sitemap and robots. Application routes/authentication remain unchanged.
- **Redis documentation drift.** auth-otp.ts stores AuthChallenge in PostgreSQL; old comments say Redis. Native Redis is optional, but configured Redis failure makes health unready. Updated configuration guidance distinguishes those facts. Runtime also showed email worker ECONNREFUSED without a Redis binding: email-queue.ts unconditionally constructs a localhost worker, unlike job-queue.ts. Redis-free worker operation needs a separate behavior fix or a configured Redis during evaluation.
- **No anonymous demo isolation.** Viewer role alone is not proof of globally read-only behavior. Keep anonymous access disabled; follow demo plan.

## Low

- Community templates/support/contribution guidance missing — added with actionable scope and no invented service commitments.
- E2E README referenced absent .env.e2e.example — corrected to existing environment template and actual runner contract.
- Discoverability metadata/social-preview settings require owner changes; exact steps recorded.

## Evidence and release decision

See [validation results](VALIDATION.md) for current commands/outcomes. Installation and PostgreSQL readiness are verified; complete application readiness is **not established**. License selection is resolved; network access, runtime validation, private disclosure and release operations remain gates. No production data or schema was modified by this branch.
