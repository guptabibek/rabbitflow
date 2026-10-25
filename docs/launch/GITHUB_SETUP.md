# Owner GitHub setup

Git read via the platform proxy succeeds. A read-only API request to api.github.com is Forbidden; metadata updates and a PR were therefore not attempted. Do not request a PAT merely because CLI authentication reports a problem. Reuse platform access after the specific API path is available.

After merging the MIT license and launch files:

1. In repository **About**, set: “Self-hosted Agile project management with Kanban boards, sprints, backlogs, workflows, RBAC, MFA and analytics. An open-source alternative to Jira and Azure DevOps Boards.” This is a positioning statement, not a parity promise.
2. Add topics: project-management, self-hosted, open-source, jira-alternative, kanban, agile, scrum, sprint-planning, devtools, nextjs, typescript, docker, postgresql.
3. Add a website only after an authorized, functioning deployment exists. The suggested future hostname is not configured by this work.
4. Upload the existing public/brand/rabbitflow-social-card.png as social preview. Light/dark SVG banners are additional design assets; verify platform-supported raster export before upload.
5. Enable private vulnerability reporting, configure maintainer notifications and add a private conduct contact. Enable Discussions if desired: Announcements, Q&A, Ideas, Show and tell, Contributor help. Link them only after availability is confirmed.
6. Create labels: bug (#d73a4a), enhancement (#a2eeef), documentation (#0075ca), good first issue (#7057ff), help wanted (#008672), security (#b60205), discussion (#c5def5). Security label must never solicit public exploit reports.
7. Run CI, configure branch protection to require the observed CI verify job, and require review. Do not make an unexecuted workflow a claimed passing gate.
8. Publish only after release checklist completion and separate owner approval.

PR preparation: branch feat/launch-readiness. Suggested title: “Prepare RabbitFlow launch documentation, MIT licensing, community infrastructure and isolated marketing site”. Use [PR summary](PR_SUMMARY.md) and include actual validation limitations. No push, PR, metadata change or release is claimed as completed.
