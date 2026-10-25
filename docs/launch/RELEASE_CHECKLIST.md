# Release checklist

Do not infer completion from a generated document or workflow file. Attach dated evidence and the exact commit/image digest to each gate.

- [x] Owner explicitly approved MIT; license text added on launch branch.
- [ ] Owner reviews existing source/asset rights and dependency notices.
- [ ] Apply required Prisma network domain; generate client with checksums verified.
- [ ] Fresh native install, migrations, full-text search and actual sign-in verified.
- [ ] Fresh Docker build, seeded admin sign-in, project/work-item creation verified.
- [ ] Lint, type check, domain/integration tests and build green on target commit.
- [ ] Cross-browser/mobile/keyboard/accessibility critical journeys complete.
- [ ] Restart, Redis-loss/recovery, persistence and encrypted backup restore verified.
- [ ] SMTP password reset, MFA enrollment/recovery, cron and authorization boundaries verified.
- [ ] Owner enables private vulnerability reporting and designates conduct/security triage.
- [ ] Synthetic screenshots/video captured and sensitive-data review complete.
- [ ] Tag, release notes, image digest and upgrade notes prepared; owner authorizes publication.
- [ ] Documentation links and claims checked after merge.
- [ ] Public demo isolation or explicit no-demo evaluation messaging accepted.

Start with a pre-release/pilot if general-availability criteria in [existing release validation](../production-readiness/release-validation.md) remain unmet. Do not market a pilot as production-ready. No release/deployment/publication is authorized by this checklist.
