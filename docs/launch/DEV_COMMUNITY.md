# Technical article drafts

Drafts for owner review, not published. Personal motivation must be supplied/approved by the maker. Add real screenshots and command evidence after release validation; do not imply the examples ran when they did not.

## 1. Why RabbitFlow exists: keeping the planning loop together

A team can lose context as work moves from a backlog to an iteration, then into a board and a retrospective. RabbitFlow explores a connected planning loop on infrastructure the team operates. Its code links work items, project membership, iterations and workflow states rather than treating a board as an isolated list.

The trade-off is explicit: self-hosting gives deployment control and creates work around TLS, mail, backups and upgrades. MIT licensing permits reuse, but it does not promise reliability. The project is pre-release and needs verified install and core-workflow evidence before a broad launch.

Maker note to add before publication: a truthful account of the team/workflow that motivated the project. Do not invent a customer story. Code: https://github.com/guptabibek/rabbitflow.

## 2. Building a self-hosted Agile platform with Next.js and PostgreSQL

RabbitFlow serves React UI and API handlers from one Next.js application. Zustand manages client state; domain services handle workflow and project permissions; Prisma connects to PostgreSQL. This keeps deployment compact while making domain boundaries important: an authenticated user still needs project-level permission for a mutation.

Search illustrates a detail schema generators cannot hide. PostgreSQL tsvector triggers are installed by SQL migrations. A development database created only with schema push can look structurally correct while full-text behavior is incomplete. A clean evaluation should apply migrations, then test search against actual synthetic items.

A useful architectural review follows a single work-item edit through the API, authoritative actor resolution, project-role check, transaction and cache invalidation. It should test failure paths, not simply confirm that a button exists. No scale benchmark is asserted by this architecture.

## 3. Deploying RabbitFlow with Docker: configuration before convenience

Clone the repository, copy `.env.docker.example` into a private `.env.docker`, generate independent JWT and cron secrets, and choose your own administrator email/password. Validate with `docker compose --env-file .env.docker config --quiet`, then run `docker compose --env-file .env.docker up -d --build`.

The entrypoint runs migrations and optionally bootstrap seeding. Read logs: a bootstrap failure is reported while the app still starts, so readiness alone is insufficient. Sign in and create a project/work item, then disable bootstrap. Use the production Compose file for private database networking and durable upload storage; the local stack is for evaluation.

This tutorial must include clean-build evidence before publication. At the current audit, Prisma downloads are network-blocked, so full startup is not claimed. Use docs/deployment.md for TLS, backup and recovery responsibilities.

## 4. Evaluating RabbitFlow alongside managed Agile tools

Compare workflows rather than logo lists. Can a team represent its hierarchy, organize an iteration, enforce role boundaries and inspect the reporting it needs? RabbitFlow contains code for those workflows, but an evaluation should use the team's actual constraints and a synthetic project before making a migration decision.

Managed tools reduce infrastructure work; a self-hosted app gives more deployment control. RabbitFlow does not claim every Jira/Azure DevOps feature, enterprise certification or drop-in import compatibility. Use a small matrix of must-have workflows, integration needs, operational staffing and recovery requirements, and record observed results.

## 5. Security boundaries in multi-user planning software

A signed session is only the start of authorization. A project-management API must resolve the current identity, validate membership and permission, and check that related records belong to the intended project. UI restrictions cannot replace server checks.

RabbitFlow's code includes project roles, session persistence and MFA. Challenge data is stored in PostgreSQL; configured Redis still affects readiness. An MFA encryption key must be managed and backed up separately from data. Attachments live outside public web assets and are served through authorizing handlers.

Tests should exercise cross-project references, stale roles, revoked sessions and forbidden mutations against a real disposable database. These controls are inspectable design choices, not evidence of an independent security certification. Report vulnerabilities privately using SECURITY.md.
