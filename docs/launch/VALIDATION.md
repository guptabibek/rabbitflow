# Validation evidence

Date: 2026-10-25. Base commit: 52b9206b21b58cf8bd4203c51d030ee49c6a9c56; branch feat/launch-readiness. Node 24.19.0, npm 11.9.0, Docker Engine 28.4.0. All data used for setup is isolated local development data; no production database was accessed.

| Check | Actual outcome |
| --- | --- |
| npm ci | Passed, 695 packages; npm lockfile unchanged |
| PostgreSQL 16 container + pg_isready | Passed, loopback-only development instance |
| npm run db:generate | Blocked: binaries.prisma.sh checksum fetch HTTP 403; no verification bypass |
| prisma generate --no-engine diagnostic | Also blocked fetching schema-engine checksum; no usable generated client |
| npm test | 280 reported entries: 275 pass, five test-file load failures caused by missing generated Prisma exports; no skips. Not a passing suite |
| npm run test:integration | Initial attempt failed for missing TEST_DATABASE_URL. Retried with both database variables aimed at the isolated test target: 14 test-file initialization failures from ungenerated PrismaClient; zero behavioral tests validated |
| npm run build | Bundling compiled, TypeScript stage failed with missing generated Prisma types/derived type errors. Build did not pass; cannot isolate all possible repository defects until generation works |
| npx tsc --noEmit --incremental false | Failed, missing Prisma model types/JsonNull and downstream inference errors; must rerun after client generation |
| npm run lint | Passed before and after branch changes |
| App startup + functional request | Dev process started; login and readiness returned HTTP 500 because PrismaClient was uninitialized. This does not validate application readiness |
| Static marketing build | Passed without a deployment origin; robots disallows crawling and no canonical/sitemap is invented |
| Marketing browser checks | Chromium 138: 1440×1000 and 390×844, light and dark; zero overflow, broken images or page errors; FAQ opens and first Tab reaches skip link |
| Marketing accessibility | Axe: zero violations across those four configurations after correcting one light-theme contrast issue; manual screen-reader audit not performed |
| New static build contract tests | Passed: four tests covering default noindex, explicit-origin SEO, invalid origin rejection and preservation of unrelated files |
| Documentation link check | Passed: 68 local file links across 33 maintained documents; checks file existence, not remote availability/Markdown renderer parity |
| Docker Compose config --quiet | Passed for evaluation, production and E2E files with ephemeral synthetic variables; this is configuration parsing, not startup |
| Git read | ls-remote origin HEAD succeeds via platform HTTPS proxy |
| GitHub API | Read-only repo API request Forbidden; no metadata changes, PR or remote CI execution claimed |

Browser screenshots in docs/images/marketing-* show the **marketing website**, not the RabbitFlow application. Real product screenshots, full browser app journeys, Docker image startup, seeded login, search, migrations, restart/persistence and restore drills remain unverified.

Additional observed runtime issue: the email worker attempts localhost Redis even when no Redis binding exists, while the side-effect worker reports inline fallback. See src/lib/email-queue.ts and instrumentation.ts. Native Redis-free operation is therefore not validated as a clean fallback; configure Redis for a complete worker evaluation or address that behavior separately. This branch does not change worker/auth/application behavior.

The domain/client failures are setup-dependent; no claim is made that all underlying code is defect-free. Network domain addition is saved in the environment draft, not evidence of live access or publication. Required next step: apply settings, regenerate client with verified artifacts, migrate the isolated databases and rerun required checks before any release.

Final review: git diff --check passed; five new YAML configuration files parsed; changed/new text was scanned for common credential/private-key patterns with zero findings. This is a heuristic scan, not a guarantee. Application source, Prisma schema/migrations, dependency declarations, lockfiles, Dockerfile and Compose definitions are unchanged.

Environment configuration draft persisted: install_script, start_skill and custom allowed domain binaries.prisma.sh. The script includes the currently blocked generation/migration steps; it has not completed end to end. Saving did not apply the policy or publish a snapshot. Review/save the environment settings, rerun setup and required validation after access propagates, then publish the environment when ready. No fresh-task restoration was tested.
