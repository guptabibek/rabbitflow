# Hacker News launch draft

Do not post yet. Read the official [Show HN guidance](https://news.ycombinator.com/showhn.html) immediately before submission. The official page returned HTTP 403 in this environment; current policy is not verified here. Use a working project/evaluation path, disclose maker affiliation, avoid vote solicitation and remain available for technical discussion. Prefer a functioning demo or frictionless way to try the actual product before submitting.

## Title options

- Show HN: RabbitFlow, self-hosted Agile project management
- Show HN: RabbitFlow – backlogs, Kanban boards and sprints on your own server
- Show HN: An MIT-licensed project-management app built with Next.js and PostgreSQL

## Maker introduction — owner to verify personal statements

“I maintain RabbitFlow, a self-hosted project-management application for engineering teams. It connects backlogs, boards, iterations and configurable work-item workflows. The stack is Next.js/React, Prisma/PostgreSQL, with a Docker Compose deployment and optional native Redis caching.

This is a pre-release project. I would value feedback on whether the install guide and backlog-to-sprint workflow are clear. It is not a Jira feature-parity claim, and self-hosting means operating backups, TLS, mail and upgrades yourself.

Code and install guide: https://github.com/guptabibek/rabbitflow. There is no public demo yet; please use a disposable local environment. I will update this post with verified limitations and fixes.”

Use first-person only after the owner confirms authorship/motivation; do not invent a founding story. Replace readiness language only after release gates pass.

## Likely technical questions

- **License?** MIT, explicitly selected by the owner; review LICENSE and third-party notices.
- **Architecture?** One Next.js app serves UI and route handlers; domain services and Prisma use PostgreSQL. Not a microservice system.
- **Auth/isolation?** JWT sessions, database-backed identity and project permissions, MFA; no independent security certification.
- **Redis?** Optional in native development; production Compose includes it and readiness requires it when configured.
- **Migration from Jira?** No full compatibility/import guarantee is made. Evaluate the implemented data model and import code against your actual export.
- **Scale/HA?** No published capacity or HA benchmark; supplied Compose is single-host.
- **Why use it?** Evaluate when owning deployment and a connected sprint workflow matter more than managed operations; no universal superiority claim.

Launch only after clean install and core workflow evidence exists. Answer criticism with reproduction details and acknowledge missing features; never coordinate votes or repetitive resubmissions.
