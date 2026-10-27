# Changelog

## Unreleased

The package version is 0.2.0. GitHub API checks on 2026-10-27 found no releases or tags; these changes have not been published as a release.

- Added owner-approved MIT licensing, contributor/support/security policies, issue/PR templates and launch preparation documents. The approved confidential contact is published; GitHub private reporting still needs owner enablement.
- Reorganized installation, deployment, configuration, backup and upgrade instructions. Added genuine synthetic-data backlog and desktop/mobile board captures, an isolated responsive marketing site, SEO artifacts and channel-specific campaign drafts.
- Updated Next.js to 16.4.3 and remediated the project and separate Prisma CLI dependency audits to zero findings. Retained the existing React Hooks lint policy without disabling rules.
- Fixed Docker runtime permissions, Redis health authentication and terminal-client recovery, Redis-free mail fallback, and verified production SMTP TLS settings.
- Required MFA encryption keys in both Compose stacks and native production startup and withheld opt-in signup sessions until required MFA enrollment. Made authentication forms wait for hydration and preserved new team drafts across delayed loading. Named mobile icon controls and kept in-flight notification failures from overwriting offline status.
- Added explicit trusted-proxy configuration, protocol-spoof rejection and a guard against trusting every IPv4 client.
- Hardened application/service images: maintained Alpine packages, removal of unused runtime npm, patched nginx libraries and a PostgreSQL 16 gosu helper rebuilt with patched Go. Preserved app UID/GID 999 and third-party notices.
- Added runtime SMTP/signup/Redis checks, production browser coverage and isolated container build/runtime/security review. Local signed encrypted database/uploads/key recovery and read-only deployed health evidence are documented in the final report.

Before release, pin the approved commit/images, recheck the final launch report and complete the remaining live operating gates. Preserve JWT/MFA keys and existing volumes during upgrades. No schema migration, deployment, release or external launch is authorized by this changelog.
