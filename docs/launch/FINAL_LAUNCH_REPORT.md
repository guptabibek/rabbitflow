# Final launch report

**Assessment: Not ready.** Updated on 2026-10-27 against the original ten-phase launch brief. Native installation/builds, application workflows and isolated production Compose have passed the checks below. Project/CLI npm audits report zero findings, and all five hardened runtime images passed the high/critical container scan. Public HTTPS/login/health observation passed on the owner-provided deployment. The operator will configure mail and backups privately; live mail delivery, off-host durability and representative operating acceptance still require evidence.

Reviewed baseline: `72ba988` (merge of launch PR #3). PRs #12, #13 and #15 were subsequently merged outside this work session as `f051dfb`, `298a1c7` and `ce96df6`. Remaining container hardening, UI regression fixes and final evidence are in [PR #16](https://github.com/guptabibek/rabbitflow/pull/16) on `feat/launch-readiness`. No merge, release, public deployment, DNS change, social post or directory submission was performed by this work. The final documentation/FAQ commit follows the verified application source `f9a6aa1`; the FAQ change separately passed six marketing tests and repeated desktop/mobile light/dark browser checks.

## 1. Completed improvements

| Original deliverable | Final review and disposition |
| --- | --- |
| Repository audit | Inspected actual manifests/locks, CI, source/auth boundaries, migrations, Docker, branding, website and every launch document. This report supersedes the initial audit's runtime status. |
| Positioning and README | Purpose, deployment responsibility and pre-release status are explicit. Added an authentic product screenshot; removed obsolete network-blocker claims. No unsupported adoption, parity or certification claims. |
| Visual identity | Existing teal assets retained; light/dark type banners and real marketing captures exist. Genuine backlog, desktop board and mobile board captures use the synthetic Orbit project and Alex Example identity. Wider analytics/sprint/permissions media and recording remain incomplete. |
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
- Fixed opt-in registration issuing a session before policy-required MFA. Account creation now redirects to sign-in/enrollment without an authenticated session when enrollment is required. Two isolated runtime cases verify this boundary and the explicit MFA-disabled compatibility path. Login/registration fields remain disabled until React hydration, preventing input loss/native form submission races.
- Native production startup also requires the MFA encryption key; failed environment validation is never cached as success.
- Reproduced and fixed a late team-list response overwriting a newly opened draft. Named mobile board/list/sprint icon controls and prevented in-flight notification failures from replacing the offline message. Browser fixtures now wait for actual workspace initialization before following legacy links.
- Added hosted build/runtime/security review for all five production images. Patched nginx packages, removed unused runtime npm and rebuilt the PostgreSQL gosu helper with patched Go; preserved PostgreSQL 16, app UID/GID 999 and third-party notices.
- Hosted browser CI now uses production builds with rate limits enabled and preinstalled matching browsers; fixed Firefox profile ownership without disabling its sandbox.
- Completed signed, encrypted database/uploads/configuration recovery into new isolated targets, including attachment byte comparison, anonymous denial and TOTP login with recovered MFA keys. No source database was overwritten.
- Corrected load-test pagination, authentication preflight, body timing, elapsed throughput and HTTP status reporting. Rate-limited requests remain failures; paced workloads can declare their think time explicitly.

## 2. Remaining launch blockers

1. **Private deployment acceptance:** public HTTPS, health, brand asset and anonymous-access checks passed. The deployment operator still needs to verify the deployed commit, authenticated MFA/workflows, real password-reset/inbox delivery, scheduled cron/monitoring and origin firewall/proxy settings. The owner will configure services in a private environment file. Configuration values do not need to be shared in chat or audit documents.
2. **Off-host durability:** local signed/encrypted database/uploads/key recovery passed. Production storage, scheduled upload/retention, separate recovery-key custody and retrieval/restore from that storage still need operator verification. Keep those settings private; record only safe outcomes and recovery measurements. A local encrypted artifact does not establish off-host durability.
3. **Capacity and human acceptance:** a 10,001-issue isolated dataset was exercised. The unpaced single-session check failed its error budget on the preserved report limiter; a paced baseline passed. Representative multi-user/host telemetry, independent newcomer reproduction, usability sessions and the full-sprint pilot remain unverified. These are not inferred from a low-concurrency loopback baseline.

Resolved blockers: the final production browser matrix passed 155 cases with three expected skips and no retries, after focused gates also passed. Project and migration-CLI npm audits report zero findings; all five hardened runtime images passed the high/critical container scan. Redis-free direct/queued mail, confidential contact, signup MFA enforcement, production MFA-key validation and local encrypted uploads/key recovery are verified. Prisma 6.19.3 uses a scoped deepmerge-ts 8.0.0 override retaining CJS/ESM support; generation, migrations and database tests passed. GitHub private reporting is an admin follow-up, with approved email available meanwhile.


## 3. Test results

Commands executed in this cloud machine with Node 24.19.0, npm 11.9.0, Prisma 6.19.3 and PostgreSQL 16. Docker uses Node 22; the tested Next.js version is 16.4.3. New databases and uniquely named Compose volumes contained only synthetic audit data. No existing/customer database was reset, dropped or migrated.

| Check | Result and boundary |
| --- | --- |
| npm ci (final lockfile) | Passed on Node 24 against the frozen lockfile; generation, lint, types, tests and build also passed in hosted CI. |
| Prisma generation and committed migrations | Passed with verification enabled against new audit databases. The earlier artifact-network block is resolved. |
| npm run build | Passed after final source changes. |
| npm run lint | Passed with the retained baseline hook policy; no new rule disabling. |
| npx tsc --noEmit --incremental false | Passed; production build also runs TypeScript checking. |
| npm test | 307 passed, zero failed/skipped, including production MFA-key enforcement and repeated validation failure remaining closed. |
| npm run test:integration | 116 passed, zero failed/skipped, against an isolated audit test database. Fixtures cleared only their newly created synthetic test data. |
| Marketing build tests | Six passed, including real robots lines, SEO origin consistency, safe rebuilds and symlink/unrelated-file preservation. |
| Real-Redis regression | One passed; same test failed before the terminal-client correction. |
| Configured desktop/mobile matrix | [PR run 40474356209](https://github.com/guptabibek/rabbitflow/actions/runs/40474356209) at source head `f9a6aa1`: 155 passed, three expected skips, no retries (8.2 minutes). The focused authentication and delayed-response gates each passed 10 cases with no retries. [Branch run 40474350817](https://github.com/guptabibek/rabbitflow/actions/runs/40474350817) independently passed the same counts (8.0 minutes for the full matrix). Includes desktop Chromium/Firefox/WebKit and selected Pixel/iPhone planning/accessibility specs against a production build with rate limits enabled. The three expected skips cover registration-disabled assertions on the deliberately opt-in server; default registration 403 is verified in integration/container tests. Earlier failed runs are not counted as passes. |
| Delayed-response UI regression | Reproduced the old production build overwriting a new team draft after a held API response. The identical interaction preserved the draft after the fix. The three retry-prone journeys plus setup then passed in native Chromium: four passed, no retries. |
| Marketing browser review | 1440×1000 and 390×844, light/dark: zero Axe violations, missing images, page errors or overflow; FAQ, updated readiness-report link and keyboard skip navigation work. Repeated after the final website copy change. |
| Docker build | The earlier Debian image built locally using approved proxy CA trust; the hardened Alpine images built on hosted GitHub runners. Local Alpine builds remain blocked until the saved package-host network allowance is applied. TLS/checksums were preserved. VFS build-cache exhaustion was resolved without removing data volumes. |
| Hardened production images | Hosted [Container review](https://github.com/guptabibek/rabbitflow/actions/runs/40474356148) built all three custom images, then verified non-root startup/migrations/bootstrap, mandatory TOTP, permissions, mutation, uploads, cron, Sharp and restart persistence. All five runtime images had zero high/critical Trivy findings. Source `f9a6aa1` passed in the PR context, including the latest production MFA guard and mobile/offline UI fixes. |
| Production Compose | PostgreSQL, password-protected Redis and non-root app healthy; nginx/cron started. Readiness 200; anonymous project access 401; bootstrap MFA enrollment/TOTP, session, authenticated project read and work-item creation passed; brand PNG readable; production self-registration returned 403. |
| Fresh evaluation Compose | New PostgreSQL/Redis volumes, the verified local image and loopback-only alternate ports: readiness 200; mandatory bootstrap MFA/TOTP and encrypted seed envelope verified; anonymous projects 401; work-item creation passed; secret-authenticated cron 200 and missing-secret cron 401. App restart preserved the session/work item. Both stacks reject a missing MFA key. First-deploy helper creates mode-0600 configuration and lists all required keys. No existing volume was reused or removed. |
| App restart and encrypted recovery | Restart retained session/work item. Signed CMS/AES-256-GCM backup recovered byte-identical database dump, uploads and runtime keys. Tampered ciphertext was rejected. A new restored database/upload volume served the original attachment/session, denied anonymous reads and completed TOTP login with recovered keys. Local recovery only; no off-host durability claim. |
| Redis outage | Readiness correctly failed 503 while configured Redis was stopped. The initial recovered-service check exposed the terminal-client defect. After correction, the rebuilt container returned to 200 automatically after Redis restarted, with its session/work item preserved. |
| Documentation, YAML and secret checks | 86 local links across 34 maintained documents passed; 10 YAML files parsed, image paths and git diff whitespace reviewed. High-confidence new credential/private-key patterns are checked without printing values. These checks do not prove all remote links, Markdown renderers or secret formats. |
| npm audit | Zero vulnerabilities after remediation; the earlier 44-finding result is superseded. |
| SMTP runtime checks | Six passed, zero skipped: authenticated implicit TLS and STARTTLS, direct Redis-free fallback, untrusted-certificate and plaintext/config rejection, queued TLS delivery, password reset/OTP replay rejection/password change/session revocation against a disposable test database. |
| Opt-in signup/MFA boundary | Two passed: required enrollment issues neither a cookie nor database session before TOTP succeeds; the final MFA session and encrypted seed are verified. Explicit MFA-disabled signup retains its session behavior. Default registration-disabled integration check also passes. |
| Trusted TLS edge | Readiness 200 using a trusted local CA; Secure/HttpOnly/SameSite session flags through the explicit trusted edge, and protocol spoof rejection from untrusted HTTP callers. Production nginx also rejected a trust-all `/0` configuration before starting. |
| Owner-provided deployment | Read-only [run 40450702373](https://github.com/guptabibek/rabbitflow/actions/runs/40450702373) passed: `/` 307 to `/login`; login, liveness, readiness and brand image 200; anonymous projects/users APIs 401. TLS, HSTS and nosniff were present; readiness confirmed database/Redis and the image was readable. No authenticated requests or deployed-commit assertion. |
| Capacity stress check | 60.56s, four workers, 10,001 issues, no think time: 582 requests, 525 HTTP 200 and 57 HTTP 429; 9.61 requests/s, 9.79% errors, p75 579.8ms, p95 1174.5ms, p99 1286ms. **Failed** the 1% error budget; the report limiter allows 60/minute per client/user. No limits were weakened. |
| Paced local baseline | Same image/dataset, four workers, 1500ms think time: 60.03s, 142 HTTP 200, zero failures, 2.37 requests/s, p75 224ms, p95 667.2ms, p99 762.4ms. Passed the configured 1% error/1000ms p75 budgets. Single-session loopback baseline; not the required 25-user/15-minute production-host exercise. |

Earlier local browser checks used external Chromium 138 against a native production server. The final hosted matrix uses the lockfile-matched Playwright 1.58.2 browsers and production Next build. Repeated earlier auth runs exhausted a real registration bucket; isolated synthetic client identities now keep production rate limits enabled without combining every test into the same client. Earlier failed runs exposed MFA assumptions, shared-account lockout, the delayed team-draft bug, mobile accessible-name defects and async recovery/navigation races. They were investigated and retained as failed evidence rather than relabeled as passes. Secret-bearing audit fixtures stay outside Git.

The local encrypted-recovery/TLS-edge drill used image `sha256:77b8bb104a9a34fb97b3573dd3d911a5584b3e8e5d3189ccae7436a9ec8747b2`. It passed mandatory TOTP, trusted HTTPS Secure/HttpOnly cookies, recovered attachment bytes, anonymous 401 and default registration 403 on source/restored targets. Signing/encryption, byte comparison and tamper rejection were repeated with fresh synthetic certificates on 2026-10-27. Hosted CI subsequently built and tested the hardened Alpine images; its reviewed digests are listed with the security results. The earlier capacity observations used image `4b9d8aafbd11` and are not a benchmark of the final image. No image was published. Local documentation links and new-secret patterns were checked; these are bounded checks, not universal guarantees.

The native start command emits Next.js's standalone-output warning. Docker runs the packaged standalone server with its static/public assets and is the verified production packaging path. The local capacity observation above is not a production throughput guarantee. See [OPERATIONS_VERIFICATION.md](OPERATIONS_VERIFICATION.md) for recovery and live-check boundaries.

## 4. Security concerns

No authentication, authorization or database policy was weakened. Production MFA remained enabled for the bootstrap account, and the audit completed real TOTP enrollment rather than bypassing it. Integration tests exercised project/area boundaries, token/session checks, MFA encryption, attachments and work-item integrity. These results are not a penetration-test certification.

Keep JWT/cron/MFA keys independent and private, SMTP TLS verification enabled, header authentication disabled, database/cache internal, and uploads outside public assets. The deployment edge must overwrite forwarding headers and prevent direct bypass of the HTTP origin. Sensitive audit environment files, cookies, keys and database dumps were kept outside Git. Committed images show synthetic identities only.

Project/CLI npm findings and Redis-free mail behavior are resolved; the approved email provides private reporting. The complete-image scan also found issues outside the npm lockfile, which were remediated without exclusions:

| Runtime image | Initial high / critical findings | Hardened result |
| --- | --- | --- |
| App (Debian/global npm → Alpine 3.24 without runtime npm) | 67 / 1 | 0 / 0 |
| nginx (patched Brotli/curl libraries) | 3 / 0 | 0 / 0 |
| PostgreSQL 16 (gosu release source rebuilt with Go 1.27.3) | 25 / 1 | 0 / 0 |
| Cron (Alpine 3.24.3) | 0 / 0 | 0 / 0 |
| Redis 7 | 0 / 0 | 0 / 0 |

Trivy 0.76.1 used the official GHCR vulnerability database on 2026-10-27. This gate covers high/critical findings, not a zero-finding claim for every severity or a penetration-test certification. Go module checksum verification remains enabled and third-party notices are retained. PostgreSQL stays on major 16 and app UID/GID 999 is preserved. Public TLS/health/access checks passed; live SMTP, off-host durability and authenticated operator acceptance are still separate checks on the privately configured deployment.

Reviewed images from [run 40474356148](https://github.com/guptabibek/rabbitflow/actions/runs/40474356148), source head `f9a6aa1`, PR merge context against `ce96df6` (not published):

| Image | CI image ID |
| --- | --- |
| App | `sha256:7ab863bb91b191d1c39ee32f2437d7f9b4888d9a4f1bf04619611dc8a6a1d770` |
| nginx | `sha256:94702b4325f93f6cad288b644ec53265c2c1286c067a4dbf029146e59b502d60` |
| PostgreSQL | `sha256:9df7d2006308c534224e5299ff7585876e3b7bc324ef08a33fa32a93ce49ade3` |
| Cron | `sha256:b92841763c5c2140a20eeb2a44e94ebb0e80fd51d9d6b5895ea72fa999525d68` |
| Redis | `sha256:98c6ca8f397f86e469be752c3e7ed5eb8b17f2479840cb69a2e413037038e9f4` |

CI images were temporary runner artifacts. Record the new digests when building an approved release; do not infer that these images are published or retained locally.

## 5. GitHub configuration requiring manual action

API-verified on 2026-10-27: default branch main, MIT detected, Issues enabled, Discussions disabled, topics empty, private vulnerability reporting disabled. Existing labels include bug, enhancement, documentation, good first issue and help wanted; the integration added the missing security/discussion labels. Description is the concise open-source/self-hosted positioning; the existing homepage is the owner's deployed app. No description/homepage change was made.

Owner actions: enable private reporting and maintainer notifications; add the documented topics (both API mutations were rejected with integration HTTP 403); confirm triage/backup responsibility for the published contact; optionally enable the proposed Discussions categories; upload the approved social preview; require the observed `verify`, `presentation`, `browser-e2e` and `production-images` checks with review; change the homepage to a marketing website only after authorized deployment. PRs #3/#12/#13/#15 are already merged externally; remaining fixes are in PR #16. No PR was merged by this work.

## 6. License decision requiring owner approval

**None outstanding:** the owner explicitly approved MIT on 2026-10-25, and LICENSE is present. Do not ask for the same decision again. Maintainers still need to confirm rights to pre-existing source/brand assets and preserve dependency notices; that is rights review, not a new license selection. See LICENSE_DECISION.md.

## 7. Deployment requirements

Use Docker Engine/Compose v2 with BuildKit, sufficient build disk and approved registry/npm/Prisma/Alpine/Go module access. Build all three custom images; app Node 22 on Alpine runs as UID/GID 999 without runtime npm, and PostgreSQL stays on major 16. Configure unique secrets, matching PostgreSQL credentials/URL, Redis password, actual APP_DOMAIN/APP_URL, MFA encryption and SMTP. Use the production Compose file, internal DB/cache network and named upload volume. Review bootstrap logs and complete MFA; health alone does not prove an administrator exists. Disable bootstrap after successful verification.

Put the HTTP origin behind a verified TLS edge/firewall. Set APP_TRUSTED_PROXY_CIDR to the actual edge's narrow IPv4 source/CIDR; never trust all callers. Back up PostgreSQL, uploads and encryption/configuration with off-host encrypted storage and separate key custody; rehearse restore into isolated targets. Do not use reset/down -v as upgrade recovery. See deployment.md for exact commands and optional CA trust. The owner's existing app URL does not configure the suggested marketing hostname; the marketing build stays noindex without an approved SITE_URL. Pre-merge website docs links use feat/launch-readiness; build with DOCS_REF=main after merge.

This checkout defines CI and read-only observation workflows; it contains no deployment workflow. The existing deployment may use external automation, but neither that pipeline nor its deployed commit was verified. Green CI and public health do not establish deployment provenance.

## 8. Ready-to-publish promotional content

Nothing is authorized for publication by this report. The following factual progress update is editorially usable after owner approval; it is not a production launch announcement:

> RabbitFlow is an MIT-licensed, self-hosted project-management app built with Next.js and PostgreSQL. It connects backlogs, Kanban boards and sprint planning. We have tested core workflows, project permissions and MFA against a production build and included a genuine synthetic-data backlog capture in the repository. It is still pre-release: live operating checks remain open. The code, installation guide and current audit are at https://github.com/guptabibek/rabbitflow. Reproducible install feedback is welcome; please use synthetic data.

HACKER_NEWS.md, REDDIT.md and PRODUCT_HUNT.md have channel-specific drafts, not posting approvals. DEV_COMMUNITY.md contains technical article drafts; personal motivation still needs owner input. LINKEDIN.md explicitly withholds nonexistent video/release announcements. YOUTUBE.md provides scripts/shot lists, not a recorded video. Recheck current community rules and released-version accuracy immediately before any post. No testimonials, user counts, ratings, full migration/parity promises or invented benchmark claims are supplied.

## 9. Recommended first launch platform

Start with **DEV Community**, after security/install gates are cleared, using a tested Docker walkthrough that explains configuration and operating trade-offs. It is useful without claiming a hosted demo or polished general availability. Then seek permission/rule compliance for an install-feedback post on r/selfhosted. Hold Show HN and Product Hunt until independent evaluation is straightforward, real media is complete and the maker can support the resulting questions. No popularity or star targets are promised.

## 10. Exact launch-day checklist

1. Pin the approved release commit/image and verify owner authorization to publish; do not merge or release automatically.
2. Recheck dependency advisories, private disclosure/contact ownership and all release blockers. Stop if any high-risk unresolved path lacks an accepted assessment.
3. Observe green CI for that exact commit, including `verify`, `presentation`, `browser-e2e` and `production-images` (runtime Redis/SMTP/MFA checks plus zero high/critical image findings). Inspect browser retries/skips and run the required browser/device matrix and a newcomer clean-install check.
4. Verify fresh production migrations, first-admin MFA sign-in, project/work-item/search behavior and anonymous/cross-project rejection using synthetic staging data.
5. Verify real TLS/forwarding, SMTP password reset, cron, monitoring, uploads and configured-Redis outage recovery. Confirm origin/DB/cache exposure is restricted.
6. Complete and record encrypted off-host PostgreSQL plus uploads/key restore, restart persistence and representative capacity checks.
7. Review final screenshots/video/captions for accuracy, personal data and secrets. Remove every unavailable demo/release link; do not invent replacements.
8. Merge only through the approved owner process. Rebuild the marketing site with actual SITE_URL and DOCS_REF=main; verify canonical, robots, sitemap, JSON-LD and all CTAs anonymously after deployment authorization.
9. Owner publishes the approved release/notes and confirms the real install URL. Only then adapt the reviewed channel draft, disclose affiliation and recheck current platform rules.
10. Launch on one channel at a time, answer technical questions, collect opt-in feedback and correct claims when failures appear. Do not solicit votes or submit to directories before eligibility; Awesome-Selfhosted requires owner-authored content and a verified release more than four months old.

Audit containers, the audit-owned native server on port 3100 and the static-site verification server were stopped after validation. The baseline `rabbitflow-dev-pg` was left running; databases, named volumes, private recovery artifacts and historical local image `77b8bb104a9a` were retained. Hardened images were built only in CI and were not published or retained locally. No live process is assumed to survive an environment snapshot. The saved startup/network guidance is a configuration draft requiring user review/save/publication in environment settings; saving that draft does not apply it or publish an application release.

Until these gates are met, the honest category is **Not ready**, even though repository presentation and core development validation are substantially improved.
