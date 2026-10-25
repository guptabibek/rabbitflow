# Changelog

## Unreleased

This section records this branch's launch preparation, not a published release. package.json currently reports 0.2.0; no local Git tags were present during the audit. Historical versioned releases have not been independently verified through the blocked GitHub API.

- Reorganized installation, deployment, backup and configuration guidance.
- Added contributor/support policies, issue and PR templates, dependency-update configuration and CI definition.
- Added an isolated static marketing site and launch campaign/measurement runbooks.
- Documented unresolved licensing, runtime-validation and security-contact gates.

Before the first release, replace the provisional release scope with verified changes since the chosen base commit and record migration/upgrade requirements. Do not retroactively invent release dates.

### Final audit follow-up

- Updated Next.js to 16.4.3 to address direct Next.js advisories; residual dependency findings remain documented release blockers. Retained eslint-config-next 16.2.0 and pinned the baseline React Hooks 7.0.1 policy rather than disabling rules or introducing a broad lint migration.
- Removed the obsolete Bun lockfile for an older manifest; npm/package-lock.json are the supported installation workflow.
- Fixed generated robots directives, protected build outputs from symlink/source overwrites and corrected pre-merge documentation links.
- Added authentic synthetic-data product imagery and corrected app accessibility failures found by the browser suite.
- Fixed production Redis healthcheck password expansion and added optional BuildKit CA trust without bypassing verification.
