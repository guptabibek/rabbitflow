# Owner GitHub setup

Git and GitHub API access now work. The final audit verified MIT on main, Issues enabled, Discussions disabled, empty topics and private vulnerability reporting disabled. Existing launch PR #3 was already merged before the audit; the feature branch now carries a follow-up. See [final report](FINAL_LAUNCH_REPORT.md) for current evidence and manual gates.

After merging the MIT license and launch files:

1. In repository **About**, set: “Self-hosted Agile project management with Kanban boards, sprints, backlogs, workflows, RBAC, MFA and analytics. An open-source alternative to Jira and Azure DevOps Boards.” This is a positioning statement, not a parity promise.
2. Add topics: project-management, self-hosted, open-source, jira-alternative, kanban, agile, scrum, sprint-planning, devtools, nextjs, typescript, docker, postgresql.
3. Add a website only after an authorized, functioning deployment exists. The suggested future hostname is not configured by this work.
4. Upload the existing public/brand/rabbitflow-social-card.png as social preview. Light/dark SVG banners are additional design assets; verify platform-supported raster export before upload.
5. Enable private vulnerability reporting, configure maintainer notifications and add a private conduct contact. Enable Discussions if desired: Announcements, Q&A, Ideas, Show and tell, Contributor help. Link them only after availability is confirmed.
6. Create labels: bug (#d73a4a), enhancement (#a2eeef), documentation (#0075ca), good first issue (#7057ff), help wanted (#008672), security (#b60205), discussion (#c5def5). Security label must never solicit public exploit reports.
7. Run CI, configure branch protection to require the observed CI verify job, and require review. Do not make an unexecuted workflow a claimed passing gate.
8. Publish only after release checklist completion and separate owner approval.

PR preparation: branch feat/launch-readiness. Suggested title: “Prepare RabbitFlow launch documentation, MIT licensing, community infrastructure and isolated marketing site”. Use [final launch report](FINAL_LAUNCH_REPORT.md) and include actual validation limitations. The original branch was pushed and PR #3 was merged before this audit. Follow-up changes require a new PR; no automatic merge or release is authorized.
