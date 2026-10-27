# Owner GitHub setup

Git and GitHub API access work. On 2026-10-27 the audit verified MIT on main, Issues enabled, Discussions disabled, empty topics and private vulnerability reporting disabled. The About homepage already points to the owner's existing app at https://devops.rabbittech.com.np/; it is not an anonymous demo. The integration created the missing security/discussion labels, but topic updates and private-reporting enablement were rejected with HTTP 403. See [final report](FINAL_LAUNCH_REPORT.md) for current evidence and manual gates.

Remaining owner setup (MIT and the initial launch files are already on main):

1. The existing description is “RabbitFlow — Open-source, self-hosted Agile project management for engineering teams.” Keep this concise positioning; an alternative-to claim must not imply feature parity.
2. Add topics: project-management, self-hosted, open-source, jira-alternative, kanban, agile, scrum, sprint-planning, devtools, nextjs, typescript, docker, postgresql.
3. Keep the existing app homepage only if intended for discovery. Change it to a marketing URL only after an authorized, functioning marketing deployment exists. The suggested future hostname is not configured by this work.
4. Upload the existing public/brand/rabbitflow-social-card.png as social preview. Light/dark SVG banners are additional design assets; verify platform-supported raster export before upload.
5. Enable private vulnerability reporting and configure maintainer notifications. The approved confidential security/conduct contact guptabibek166@gmail.com is already documented; designate backup triage. Enable Discussions if desired: Announcements, Q&A, Ideas, Show and tell, Contributor help. Link them only after availability is confirmed.
6. Labels are present: bug, enhancement, documentation, good first issue, help wanted, security and discussion. The security label says public hardening only and directs vulnerabilities to private reporting; never solicit public exploit reports.
7. Run CI, configure branch protection to require the observed CI verify job, and require review. Do not make an unexecuted workflow a claimed passing gate.
8. Publish only after release checklist completion and separate owner approval.

Audit branch: feat/launch-readiness. PRs #3, #12 and #13 were merged outside this work session. Further MFA/installation fixes and updated evidence remain on the branch for a new follow-up PR. Its description must reflect the [final launch report](FINAL_LAUNCH_REPORT.md) and actual validation limitations. No automatic merge or release is authorized.
