# Video scripts and shot lists

Capture only the actual application with synthetic data. Add accurate captions, a transcript, version/commit and install-guide links. No private data, credentials or fabricated charts. These scripts await a running validated instance; no video is claimed to exist.

## 90-second introduction

| Time | Shot | Narration |
| --- | --- | --- |
| 0–10s | Existing logo, then real project | “RabbitFlow is a self-hosted Agile project-management app for engineering teams.” |
| 10–30s | Backlog and one issue hierarchy | “Start with a structured backlog, then identify the next work to deliver.” |
| 30–50s | Iteration and board | “Plan an iteration and move work through configured states.” |
| 50–65s | Actual analytics | “Review the sprint using the data this sample project produces.” |
| 65–80s | Roles and deployment docs | “Project access is explicit; self-hosting includes TLS, backups, mail and updates.” |
| 80–90s | GitHub/install guide | “Read the code, review limitations and try an isolated synthetic workspace.” |

## Installation tutorial (6–8 minutes)

Show prerequisites and exact commit, copy the environment template without displaying filled secrets, explain independent random keys and intentional admin identity, validate Compose quietly, build, inspect migration/seed outcome, verify readiness, sign in and create a work item. Explain persistent volumes and why `down -v` is destructive. End with production TLS/backup responsibilities and current limitations. If any command fails, diagnose honestly or stop; do not edit a failure into an implied success.

## Feature walkthrough (5–7 minutes)

Follow one seeded project through hierarchy, labels, iteration/capacity, board transitions, comments/relationships, role checks and sprint analytics. Narrate only controls/results visible in the current released UI. Show an authorized and forbidden operation without exposing tokens. State unsupported requirements plainly.

## Architecture overview (4–6 minutes)

Start from docs/architecture.md's diagram. Trace a browser request into Next.js, identity/session resolution, project permission, domain transaction, Prisma and PostgreSQL. Explain optional native Redis versus configured readiness, migration-managed search, private attachment serving, and Compose's cron/edge/internal network. Finish with open validation questions and the test/restore runbook. No invented performance figures or microservice claims.
