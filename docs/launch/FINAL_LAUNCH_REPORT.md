# Final launch report

**Assessment: Not ready.** Updated on 2026-10-27 against the original ten-phase launch brief. Native installation/builds, application workflows and isolated production Compose have passed the checks below. Dependency advisories are remediated to zero. Public HTTPS/login/health observation passed on the owner-provided deployment. Authenticated live operation, off-host recovery and the expanded browser gate still need evidence before a production launch recommendation.

Reviewed baseline: `72ba988` (merge of launch PR #3). PR #12 was subsequently merged outside this work session as `f051dfb`; the remaining work stays on `feat/launch-readiness` in [PR #13](https://github.com/guptabibek/rabbitflow/pull/13). No merge, release, public deployment, DNS change, social post or directory submission was performed by this work.

## 1. Completed improvements

| Original deliverable | Final review and disposition |
| --- | --- |
| Repository audit | Inspected actual manifests/locks, CI, source/auth boundaries, migrations, Docker, branding, website and every launch document. This report supersedes the initial audit's runtime status. |
| Positioning and README | Purpose, deployment responsibility and pre-release status are explicit. Added an authentic product screenshot; removed obsolete network-blocker claims. No unsupported adoption, parity or certification claims. |
| Visual identity | Existing teal assets retained; light/dark type banners and real marketing captures exist. Genuine backlog capture uses a new synthetic Orbit project and Alex Example identity. Wider analytics/sprint/permissions media and recording remain incomplete. |
| Community infrastructure | Reviewed contribution, support, conduct, security, issue/PR templates and dependency update definitions. Owner-approved confidential email is published in SECURITY.md and CODE_OF_CONDUCT.md. GitHub private reporting and a backup moderator still require admin/owner action. |
| License | Owner-approved MIT is present; no new license decision is requested. |
| Developer experience | Verified migrations, bootstrap, native build and database suites. Removed the obsolete Bun lockfile for a different manifest; npm/package-lock.json are the supported workflow. |
| Website and SEO | Separate static site preserves app routes/authentication. Improved visible positioning, added the real backlog image, corrected pre-merge GitHub file links and fixed literal backslash-n bytes in robots/sitemap output. Default noindex remains intentional until an approved origin exists. |
| Demo | Isolated/read-only demo plan exists. No anonymous live demo or auth bypass was enabled. Hosting/policy decisions and a write-denial audit remain prerequisites. |
| Campaign and directories | Reviewed all platform drafts for factual claims and affiliation disclosure. Removed fictitious future release/video announcement placeholders. Current directory/platform rules are marked unverified where access was unavailable; no submissions are claimed. Awesome-Selfhosted's human-authorship and release-age gates are respected. |
| Community/growth | Contributor backlog, discussion categories, 30/60/90-day actions and privacy-respecting measurement are actionable; no arbitrary growth promises. |
| Verification/delivery | Added build-output safety and real-Redis recovery tests, genuine UI evidence and Docker operational checks. Consolidated duplicate implementation/PR summaries into this report; VALIDATION.md is now a reproduction runbook. |

Concrete fixes found by independent execution:

- Upgraded Next.js from 16.2.0 to 16.4.3, Nodemailer to 10.2.1, Sharp to 0.35.5 and compatible transitive dependencies. Root and separate Docker migration-CLI audits now report zero vulnerabilities. Retained eslint-config-next 16.2.0 and pinned the previously used React Hooks 7.0.1 policy; a newer compiler-rule preset exposed 65 pre-existing lint errors. No lint assertions/rules were disabled by this audit.
- Static builder rejects symlink/source output destinations and unowned output trees. Tests verify it preserves unrelated files and writes real robots directives.
- Fixed sidebar text contrast, project-initial badge contrast, unnamed onboarding progress bars and nested interactive board cards. A title button preserves the accessible work-item name and keyboard opening, while the enclosing draggable group retains drag behavior.
- Fixed production Redis healthcheck expansion: exec-form arguments previously passed a literal password-variable name. The shell check uses REDISCLI_AUTH and requires PONG without putting the password in the redis-cli argument list.
- Normalized runtime file/entrypoint permissions so restrictive checkout modes do not prevent the non-root image from starting or reading migrations/assets. The app still runs as nextjs.
- Added optional BuildKit `network_ca` trust for corporate proxies. TLS, package integrity and Prisma checksum verification remain enabled; the CA is not copied into the image.
- Reproduced a closed Redis client preventing recovery after a service outage. The client factory now discards a terminal connection. The real-Redis regression failed before the fix and passes after it; CI includes the regression and a dedicated Redis service.
- CI now runs presentation checks independently from database-dependent app checks and runs on branch pushes as well as PRs. No remote success for this follow-up is inferred from earlier runs.
- Fixed Redis-free mail delivery and worker startup; production SMTP rejects settings disabling certificate verification or transport encryption. Added six runtime checks, including a real password-reset email, OTP consumption, password change and session revocation.
- Added an explicit trusted-proxy CIDR for nginx. Verified Secure cookies through a trusted TLS edge and rejection of protocol spoofing from untrusted callers.
- Closed a fresh-install MFA storage gap: local Compose required enrollment but did not pass an encryption key. Both Compose stacks now require MFA_ENCRYPTION_KEY; the example, quick-start, helper and campaign instructions agree. The helper creates its environment file with mode 0600. Existing keys must be preserved during upgrades.
- Completed signed, encrypted database/uploads/configuration recovery into new isolated targets, including attachment byte comparison, anonymous denial and TOTP login with recovered MFA keys. No source database was overwritten.
- Corrected load-test pagination, authentication preflight, body timing, elapsed throughput and HTTP status reporting. Rate-limited requests remain failures; paced workloads can declare their think time explicitly.

## 2. Remaining launch blockers

1. **Authenticated deployed operation:** read-only HTTPS checks passed, but the deployed commit, first-admin MFA, uploads, real SMTP/inbox deliverability, cron/monitoring and origin firewall/trusted-proxy configuration remain unverified. The owner supplied the URL, not SMTP details or approval for authenticated live mutations. No deployment was performed.
2. **Off-host durability:** local signed/encrypted recovery of database, uploads and keys passed. No external storage provider/bucket/path, access binding, retention policy or separate production key custody was supplied. A local encrypted artifact does not prove off-host recovery.
3. **Browser coverage:** the original default Chromium suite passed. The first expanded CI matrix failed; it is not counted as a pass. A diagnostic run on Playwright-supported Ubuntu 24.04 is pending below. Resolve observed failures before launch.
4. **Capacity and human acceptance:** a 10,001-issue isolated dataset was exercised. The unpaced single-session check failed the error-rate budget because the executive-report limiter returned 429. Representative multi-user/host telemetry, independent newcomer reproduction, usability sessions and the full-sprint pilot remain unverified. These are not inferred from a low-concurrency local baseline.

Resolved blockers: zero dependency findings (including the separate image migration CLI), Redis-free direct/queued mail, confidential contact and full local encrypted uploads/key recovery. Prisma 6.19.3 uses a scoped deepmerge-ts 8.0.0 override retaining CJS/ESM support; generation, migrations and database tests passed. GitHub private reporting is an admin follow-up, with approved email available in the meantime.


## 3. Test results

Commands executed in this cloud machine with Node 24.19.0, npm 11.9.0, Prisma 6.19.3 and PostgreSQL 16. Docker uses Node 22; the tested Next.js version is 16.4.3. New databases and uniquely named Compose volumes contained only synthetic audit data. No existing/customer database was reset, dropped or migrated.

| Check | Result and boundary |
| --- | --- |
| npm ci (final lockfile) | Passed on Node 24: 700 packages installed; client regeneration, lint and domain tests passed after the frozen reinstall. |
| Prisma generation and committed migrations | Passed with verification enabled against new audit databases. The earlier artifact-network block is resolved. |
| npm run build | Passed after final source changes. |
| npm run lint | Passed with the retained baseline hook policy; no new rule disabling. |
| npx tsc --noEmit --incremental false | Passed; production build also runs TypeScript checking. |
| npm test | 306 passed, zero failed/skipped. |
| npm run test:integration | 116 passed, zero failed/skipped, against an isolated audit test database. Fixtures cleared only their newly created synthetic test data. |
| Marketing build tests | Six passed, including real robots lines, SEO origin consistency, safe rebuilds and symlink/unrelated-file preservation. |
| Real-Redis regression | One passed; same test failed before the terminal-client correction. |
| Core Chromium journeys | 18 passed including setup, authentication, roles/workflow, issue mutations/conflicts, onboarding, accessibility and mobile layout. |
| Full default Chromium suite | 49 passed, one expected registration-disabled skip under the opt-in registration server configuration. Covers administration, feedback, chaos/retry, notifications, planning, ceremonies, permissions and workspace navigation. Production registration remains disabled by default. |
| Marketing browser review | 1440×1000 and 390×844, light/dark: zero Axe violations, missing images, page errors or overflow; FAQ and keyboard skip navigation work. |
| Docker build | Passed with approved cloud-proxy CA supplied as a BuildKit secret. Initial DNS/trust problems and VFS disk exhaustion were diagnosed; only audit build cache/images were removed, not data volumes. |
| Production Compose | PostgreSQL, password-protected Redis and non-root app healthy; nginx/cron started. Readiness 200; anonymous project access 401; bootstrap MFA enrollment/TOTP, session, authenticated project read and work-item creation passed; brand PNG readable; production self-registration returned 403. |
| Fresh evaluation Compose | New PostgreSQL/Redis volumes, the verified local image and loopback-only alternate ports: readiness 200; mandatory bootstrap MFA/TOTP and encrypted seed envelope verified; anonymous projects 401; work-item creation passed; secret-authenticated cron 200 and missing-secret cron 401. App restart preserved the session/work item. Both stacks reject a missing MFA key. First-deploy helper creates mode-0600 configuration and lists all required keys. No existing volume was reused or removed. |
| App restart and encrypted recovery | Restart retained session/work item. Signed CMS/AES-256-GCM backup recovered byte-identical database dump, uploads and runtime keys. Tampered ciphertext was rejected. A new restored database/upload volume served the original attachment/session, denied anonymous reads and completed TOTP login with recovered keys. Local recovery only; no off-host durability claim. |
| Redis outage | Readiness correctly failed 503 while configured Redis was stopped. The initial recovered-service check exposed the terminal-client defect. After correction, the rebuilt container returned to 200 automatically after Redis restarted, with its session/work item preserved. |
| Documentation, YAML and secret checks | Maintained-document local links, YAML parsing, image paths and git diff whitespace reviewed. High-confidence new credential/private-key patterns are checked without printing values. These checks do not prove all remote links, Markdown renderers or secret formats. |
| npm audit | Zero vulnerabilities after remediation; the earlier 44-finding result is superseded. |
| SMTP runtime checks | Six passed, zero skipped: authenticated implicit TLS and STARTTLS, direct Redis-free fallback, untrusted-certificate and plaintext/config rejection, queued TLS delivery, password reset/OTP replay rejection/password change/session revocation against a disposable test database. |
| Trusted TLS edge | Readiness 200 using a trusted local CA; Secure/HttpOnly/SameSite session flags through the explicit trusted edge, and protocol spoof rejection from untrusted HTTP callers. Production nginx also rejected a trust-all `/0` configuration before starting. |
| Owner-provided deployment | GitHub read-only observation run [40439026932](https://github.com/guptabibek/rabbitflow/actions/runs/40439026932) passed on 2026-10-27: `/` 307 to `/login`; login, liveness and readiness 200. Normal TLS validation and HSTS on all four; readiness confirmed database/Redis. No authenticated requests or deployed-commit assertion. |
| Capacity stress check | 60.56s, four workers, 10,001 issues, no think time: 582 requests, 525 HTTP 200 and 57 HTTP 429; 9.61 requests/s, 9.79% errors, p75 579.8ms, p95 1174.5ms, p99 1286ms. **Failed** the 1% error budget; the report limiter allows 60/minute per client/user. No limits were weakened. |
| Paced local baseline | Same image/dataset, four workers, 1500ms think time: 60.03s, 142 HTTP 200, zero failures, 2.37 requests/s, p75 224ms, p95 667.2ms, p99 762.4ms. Passed the configured 1% error/1000ms p75 budgets. Single-session loopback baseline; not the required 25-user/15-minute production-host exercise. |

Browser execution used an external Chromium 138 binary and a temporary config, pointing at the native production server with one/two workers. The initial serverless single-process browser flag caused a setup crash; removing that flag corrected the test harness. Repeated production auth runs also exhausted the five-registration-per-hour client bucket; a fresh synthetic client identity was used without disabling the production rate limiter. Failed intermediate runs were investigated, not counted as passes. The test harness and secret-bearing audit files remain outside the checkout. The full Chromium pass preceded the final Redis-only correction; that change was checked with the failing-then-passing real-Redis test, native build/type/lint/domain checks and a rebuilt-container outage/recovery run.

Final verified Docker image: `sha256:4b9d8aafbd11216f7d5959591b941a362c2cb56dc023bfb047786949bc7a7ecb`. It is a local audit artifact, not a published release image. Maintained documentation checks found 79 valid local file links after this report refresh, and no high-confidence new secret patterns; these are bounded checks, not universal guarantees.

The native start command emits Next.js's standalone-output warning. Docker runs the packaged standalone server with its static/public assets and is the verified production packaging path. The local capacity observation above is not a production throughput guarantee. See [OPERATIONS_VERIFICATION.md](OPERATIONS_VERIFICATION.md) for recovery and live-check boundaries.

## 4. Security concerns

No authentication, authorization or database policy was weakened. Production MFA remained enabled for the bootstrap account, and the audit completed real TOTP enrollment rather than bypassing it. Integration tests exercised project/area boundaries, token/session checks, MFA encryption, attachments and work-item integrity. These results are not a penetration-test certification.

Keep JWT/cron/MFA keys independent and private, SMTP TLS verification enabled, header authentication disabled, database/cache internal, and uploads outside public assets. The deployment edge must overwrite forwarding headers and prevent direct bypass of the HTTP origin. Sensitive audit environment files, cookies, keys and database dumps were kept outside Git. Committed images show synthetic identities only.

Dependency findings and Redis-free mail-worker behavior are resolved; the approved email provides private reporting. Public TLS/health observation passed, while live SMTP and authenticated operating checks are not inferred from local tests. Do not describe RabbitFlow as production-ready or security-certified.

## 5. GitHub configuration requiring manual action

API-verified on 2026-10-27: default branch main, MIT detected, Issues enabled, Discussions disabled, topics empty, private vulnerability reporting disabled. Existing labels include bug, enhancement, documentation, good first issue and help wanted; the integration added the missing security/discussion labels. Description is the concise open-source/self-hosted positioning; the existing homepage is the owner's deployed app. No description/homepage change was made.

Owner actions: enable private reporting and maintainer notifications; add the documented topics (both API mutations were rejected with integration HTTP 403); confirm triage/backup responsibility for the published contact; optionally enable the proposed Discussions categories; upload the approved social preview; configure branch protection against the actual observed CI jobs; change the homepage to a marketing website only after authorized deployment. PRs #3/#12 are already merged; remaining work updates PR #13. No PR was merged by this work.

## 6. License decision requiring owner approval

**None outstanding:** the owner explicitly approved MIT on 2026-10-25, and LICENSE is present. Do not ask for the same decision again. Maintainers still need to confirm rights to pre-existing source/brand assets and preserve dependency notices; that is rights review, not a new license selection. See LICENSE_DECISION.md.

## 7. Deployment requirements

Use Docker Engine/Compose v2 with BuildKit, sufficient build disk and approved registry/Prisma access. Configure unique secrets, matching PostgreSQL credentials/URL, Redis password, actual APP_DOMAIN/APP_URL, MFA encryption and SMTP. Use the production Compose file, internal DB/cache network and named upload volume. Review bootstrap logs and complete MFA; health alone does not prove an administrator exists. Disable bootstrap after successful verification.

Put the HTTP origin behind a verified TLS edge/firewall. Set APP_TRUSTED_PROXY_CIDR to the actual edge's narrow IPv4 source/CIDR; never trust all callers. Back up PostgreSQL, uploads and encryption/configuration with off-host encrypted storage and separate key custody; rehearse restore into isolated targets. Do not use reset/down -v as upgrade recovery. See deployment.md for exact commands and optional CA trust. The owner's existing app URL does not configure the suggested marketing hostname; the marketing build stays noindex without an approved SITE_URL. Pre-merge website docs links use feat/launch-readiness; build with DOCS_REF=main after merge.

## 8. Ready-to-publish promotional content

Nothing is authorized for publication by this report. The following factual progress update is editorially usable after owner approval; it is not a production launch announcement:

> RabbitFlow is an MIT-licensed, self-hosted project-management app built with Next.js and PostgreSQL. It connects backlogs, Kanban boards and sprint planning. We have tested core workflows, project permissions and MFA against a production build and included a genuine synthetic-data backlog capture in the repository. It is still pre-release: broader browser and operating checks remain open. The code, installation guide and current audit are at https://github.com/guptabibek/rabbitflow. Reproducible install feedback is welcome; please use synthetic data.

HACKER_NEWS.md, REDDIT.md and PRODUCT_HUNT.md have channel-specific drafts, not posting approvals. DEV_COMMUNITY.md contains technical article drafts; personal motivation still needs owner input. LINKEDIN.md explicitly withholds nonexistent video/release announcements. YOUTUBE.md provides scripts/shot lists, not a recorded video. Recheck current community rules and released-version accuracy immediately before any post. No testimonials, user counts, ratings, full migration/parity promises or invented benchmark claims are supplied.

## 9. Recommended first launch platform

Start with **DEV Community**, after security/install gates are cleared, using a tested Docker walkthrough that explains configuration and operating trade-offs. It is useful without claiming a hosted demo or polished general availability. Then seek permission/rule compliance for an install-feedback post on r/selfhosted. Hold Show HN and Product Hunt until independent evaluation is straightforward, real media is complete and the maker can support the resulting questions. No popularity or star targets are promised.

## 10. Exact launch-day checklist

1. Pin the approved release commit/image and verify owner authorization to publish; do not merge or release automatically.
2. Recheck dependency advisories, private disclosure/contact ownership and all release blockers. Stop if any high-risk unresolved path lacks an accepted assessment.
3. Observe green CI for that exact commit, including runtime Redis recovery and presentation checks. Run the required browser/device matrix and a newcomer clean-install check.
4. Verify fresh production migrations, first-admin MFA sign-in, project/work-item/search behavior and anonymous/cross-project rejection using synthetic staging data.
5. Verify real TLS/forwarding, SMTP password reset, cron, monitoring, uploads and configured-Redis outage recovery. Confirm origin/DB/cache exposure is restricted.
6. Complete and record encrypted off-host PostgreSQL plus uploads/key restore, restart persistence and representative capacity checks.
7. Review final screenshots/video/captions for accuracy, personal data and secrets. Remove every unavailable demo/release link; do not invent replacements.
8. Merge only through the approved owner process. Rebuild the marketing site with actual SITE_URL and DOCS_REF=main; verify canonical, robots, sitemap, JSON-LD and all CTAs anonymously after deployment authorization.
9. Owner publishes the approved release/notes and confirms the real install URL. Only then adapt the reviewed channel draft, disclose affiliation and recheck current platform rules.
10. Launch on one channel at a time, answer technical questions, collect opt-in feedback and correct claims when failures appear. Do not solicit votes or submit to directories before eligibility; Awesome-Selfhosted requires owner-authored content and a verified release more than four months old.

Only audit processes may be stopped after validation; databases, named volumes and the verified local image are retained. No live process is assumed to survive an environment snapshot. The saved startup/network guidance is a configuration draft requiring user review/save/publication in environment settings; saving that draft does not apply it or publish an application release.

Until these gates are met, the honest category is **Not ready**, even though repository presentation and core development validation are substantially improved.
