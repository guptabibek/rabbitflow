# Release checklist

Do not infer completion from a document or workflow file. The [final report](FINAL_LAUNCH_REPORT.md) records dated source/image evidence. Recheck the approved release commit separately; no merge, deployment or publication is authorized by this checklist.

Completed in isolated audit/CI targets:

- [x] Owner approved MIT; license and confidential conduct/security email are present.
- [x] Prisma generation/migrations, native installation, search, lint, types, domain/integration suites and build passed.
- [x] Production images built and exercised with mandatory admin MFA, work-item mutations, authorized uploads, cron, Sharp and restart persistence; high/critical scans passed for all five runtime images.
- [x] Redis terminal-client regression, Redis loss/recovery, verified SMTP TLS/STARTTLS and password reset/session revocation passed with synthetic local services.
- [x] Signed encrypted database/uploads/configuration restore into new targets passed, including tamper rejection, attachment bytes and recovered-key TOTP.
- [x] Production browser matrix passed 155 cases with three expected registration-mode skips and no retries; focused auth/delayed-response gates also passed. This includes automated accessibility/device checks; independent human acceptance remains below.
- [x] Genuine synthetic backlog and desktop/mobile board screenshots were reviewed for sensitive content.
- [x] Maintained local documentation links and static marketing/SEO tests passed.

Still required for an actual launch:

- [ ] Observe green verify, presentation, browser-e2e and production-images jobs for the approved release commit. Check browser retries/skips and the final report rather than treating an earlier passing run as current sign-off.
- [ ] Obtain independent newcomer installation and human workflow/accessibility acceptance. Complete the general-availability sprint pilot if claiming general availability.
- [ ] Verify the deployed commit and authenticated workflows on isolated staging using private deployment configuration.
- [ ] Verify real SMTP inbox delivery/reset, monitoring, cron and TLS/origin/DB/cache restrictions on the intended deployment.
- [ ] Verify scheduled off-host upload, retention, separate key custody and retrieval/restore into isolated targets; record RPO/RTO. Local encrypted recovery is already verified but does not complete this gate.
- [ ] Run representative multi-user/host capacity acceptance; the bounded local baseline is not a production throughput guarantee.
- [ ] Owner reviews source/asset rights, dependency notices, confidential-report triage and backup responsibility; enables GitHub private reporting and appropriate branch protection.
- [ ] Approve final media/captions and no-demo evaluation messaging; record a video only if using video-based promotion.
- [ ] Prepare approved tag/release notes, final image digest and upgrade notes. Recheck documentation links after merge and rebuild the marketing site with an authorized origin.
- [ ] Obtain separate owner authorization to merge, deploy, release and post. Check platform rules before using the reviewed promotional drafts.

Start with a pre-release/pilot if the [existing release validation](../production-readiness/release-validation.md) general-availability criteria remain unmet. Do not market a pilot as production-ready.
