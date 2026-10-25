# Community growth operating plan

## Before inviting contributors

Owner enables private vulnerability reporting, designates security/conduct triage and a backup, reviews MIT/third-party rights and gets clean installation evidence. Use Issues until Discussions is actually enabled. Proposed categories: Announcements, Q&A, Ideas, Show and tell, Contributor help.

## Proposed first-issue backlog

These are scoped proposals, not created/assigned issues. Recheck current code and acceptance criteria before labeling.

| Task | Acceptance criteria | Suggested label |
| --- | --- | --- |
| Reproduce native setup on a second OS | Exact versions/commands and sanitized success/failure report; no production data | documentation |
| Verify E2E setup guide | Existing env template, isolated database, one actual critical journey completed | help wanted |
| Capture a synthetic backlog tour | Real released UI, no sensitive data, readable alt text and dimensions | documentation |
| Test missing mail configuration behavior | Meaningful existing-route regression test and documented expected response | help wanted |
| Audit README/site keyboard use | Tab order, visible focus, mobile overflow and descriptive links verified | good first issue after maintainer scope review |

Do not label auth/migration/security changes as easy first issues. Offer a bounded reproduction and a maintainer contact path before assigning.

## Weekly maintenance loop

Twice a week when maintainers are available, triage reproducible bugs and setup feedback; request missing versions/logs without requesting secrets. No response SLA is promised. Route private security reports separately. Mark duplicates with a useful canonical link; close stale reports only after a reasonable follow-up, not an arbitrary bot timer.

For feature requests, ask for the workflow, affected users, alternatives and operational/security constraints. Keep roadmap statuses Proposed / Investigating / Planned / In progress / Released accurate and avoid dates without capacity. Announce releases with tested commands, migrations, limitations and recovery instructions.

Recognize reviewed contributions in changelog/release notes with consent. Ask newcomers whether setup worked and which step failed; use opt-in feedback, not invasive telemetry. Monthly, summarize repeated installation issues and accepted external PRs. Protect focus by limiting active feature work and maintain a public list of known blockers.
