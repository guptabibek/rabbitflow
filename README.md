# RabbitFlow

A full-stack Agile project management platform inspired by Jira and Azure DevOps Boards.

RabbitFlow supports project planning, backlog grooming, sprint execution, drag-and-drop board management, issue relationships, comments, attachments, analytics, and role-based collaboration.

## What This Project Includes

- Project and member management
- Work item lifecycle with workflow rules
- Azure DevOps-style Sprint View:
  - Sprint board (Kanban with drag-and-drop)
  - Sprint backlog
  - Sprint analytics (burndown and progress)
- Labels, states, iterations, and area paths
- Parent/child and dependency links between issues
- Commenting and activity/audit trail
- JWT authentication (login/register/logout/me)
- Authenticator-based MFA per-user (enabled users are challenged on login)
- Password reset via email OTP
- Project-scoped RBAC permissions
- Redis-backed caching (with graceful fallback when Redis is not available)

## Tech Stack

### Frontend

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui + Radix UI
- Zustand for client state
- dnd-kit for board interactions
- Recharts for analytics
- Sonner for toasts

### Backend

- Next.js Route Handlers (`src/app/api/**/route.ts`)
- Prisma ORM
- PostgreSQL
- Zod validation

### Auth and Platform

- `jose` for JWT signing/verification
- `bcryptjs` for password hashing
- `ioredis` for cache layer
- Proxy-based auth gate (`src/proxy.ts`)

## High-Level Architecture

- UI layer: reusable project-management views and dialogs under `src/components/project-management`
- API layer: route handlers under `src/app/api`
- Domain layer: RBAC, workflow transitions, audit helpers in `src/lib/domain`
- Data layer: Prisma schema and PostgreSQL via `prisma/schema.prisma`
- State layer: Zustand store in `src/store/app-store.ts`
- Auth pipeline:
  1. User logs in or registers via `/api/auth/*`
  2. Server sets `auth-token` httpOnly cookie
  3. `src/proxy.ts` verifies JWT on protected routes
  4. Proxy injects `x-user-id` header for downstream RBAC checks

## Main Features

### 1. Projects and Team Collaboration

- Create and manage multiple projects
- Archive and switch projects
- Add/remove members and update project roles

### 2. Work Item Management

- Work item types: `epic`, `feature`, `story`, `task`, `bug`
- Status flow: `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`
- Priority, severity, story points, assignee/reporter
- Labels, areas, iterations, due/start/completion dates

### 3. Sprint Management

- Create and update sprint iterations
- Associate issues to sprints
- Visualize sprint work via:
  - Board tab
  - Backlog tab
  - Analytics tab

### 4. Workflow and Rules

- Controlled status transitions through domain workflow rules
- Optimistic locking via issue `version`
- Relation constraints and hierarchy support

### 5. Security and Authorization

- Authentication routes:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- RBAC roles (project level): `Admin`, `PM`, `Dev`, `QA`, `Viewer`
- Permission checks for create/update/delete/reorder/sprint actions
- Login flow supports MFA per user:
  - Users with MFA enabled must submit a valid TOTP code to complete sign-in
  - Optional org-wide enrollment can be enabled with `MFA_REQUIRE_ENROLLMENT=true`
- Password reset flow uses email OTP (SMTP configuration required)

### 6. Caching and Performance

- Optional Redis caching through `src/lib/redis.ts`
- Cache reads/writes are non-fatal when Redis is unavailable
- Sprint analytics route uses cache and invalidation support

## Folder Structure

```text
.
|-- prisma/
|   `-- schema.prisma
|-- public/
|-- src/
|   |-- app/
|   |   |-- page.tsx
|   |   |-- login/page.tsx
|   |   |-- register/page.tsx
|   |   `-- api/
|   |       |-- auth/
|   |       |-- issues/
|   |       |-- projects/
|   |       |-- sprints/
|   |       `-- ...
|   |-- components/
|   |   |-- project-management/
|   |   `-- ui/
|   |-- lib/
|   |   |-- auth.ts
|   |   |-- redis.ts
|   |   `-- domain/
|   |-- store/
|   `-- hooks/
`-- src/proxy.ts
```

## Environment Variables

Create a `.env` file at project root.

Required:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB_NAME
```

Optional but recommended:

```env
REDIS_URL=redis://USER:PASSWORD@HOST:PORT
JWT_SECRET=replace-with-a-long-random-secret
```

Notes:

- If `JWT_SECRET` is omitted, a default fallback is used. For production, always set a strong `JWT_SECRET`.
- If `REDIS_URL` is omitted or unreachable, the app still works (cache layer gracefully disables itself).

## Getting Started

## 1) Prerequisites

- Node.js 18+
- npm
- PostgreSQL database
- Optional: Redis server
- Optional for current `start` script: Bun runtime

## 2) Install Dependencies

```bash
npm install
```

## 3) Prisma Setup

```bash
npm run db:generate
npm run db:push
```

## 4) Start Development Server

```bash
npm run dev
```

Open: `http://localhost:3000`

## 5) Bootstrap Admin Access

For Docker deployments, bootstrap seeding is controlled through `.env.docker`:

- `RUN_BOOTSTRAP_SEED=true`
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_NAME`
- `SEED_ADMIN_PASSWORD`

On first startup, the stack creates the configured admin account if it does not already exist.

Optional first-project bootstrap variables:

- `SEED_CREATE_PROJECT=true`
- `SEED_PROJECT_KEY`
- `SEED_PROJECT_NAME`
- `SEED_PROJECT_DESCRIPTION`
- `SEED_PROJECT_COLOR`
- `SEED_PROJECT_ICON`

When enabled, bootstrap seeding also creates or repairs a starter project, makes the bootstrap admin a project admin, and initializes the default workflow/work-item metadata for that project.

## Available Scripts

- `npm run dev` - Start dev server on port 3000
- `npm run build` - Create production build (standalone output)
- `npm run start` - Start standalone production server (uses Bun)
- `npm run lint` - Run ESLint
- `npm run db:push` - Push Prisma schema to DB
- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Create/apply migration in dev
- `npm run db:reset` - Reset DB via Prisma

## Production Notes

- Project uses `output: "standalone"` in Next config.
- Current `start` script uses Bun:

```bash
npm run start
```

If Bun is not available, run Node directly:

```bash
NODE_ENV=production node .next/standalone/server.js
```

On Windows, run the production server command in PowerShell-compatible form if needed.

## Docker Deployment (Postgres + Redis + Persistent Data)

This repository includes a production Docker setup with:

- Next.js app container
- Nginx reverse proxy container (public entrypoint)
- PostgreSQL container with persisted volume
- Redis container with AOF persistence and persisted volume
- External SMTP credentials via environment variables for OTP email delivery

MFA and OTP variables:

- `MFA_ISSUER` (default: `RabbitFlow`)
- `MFA_CHALLENGE_TTL_SECONDS` (default: `600`)
- `PASSWORD_RESET_OTP_TTL_SECONDS` (default: `600`)

SMTP variables:

- `SMTP_HOST` (required)
- `SMTP_PORT` (default: `587`)
- `SMTP_SECURE` (default: `false`)
- `SMTP_USER`, `SMTP_PASS` (optional for authenticated SMTP)
- `SMTP_FROM` (default: `RabbitFlow <no-reply@rabbitflow.local>`)

Before running Docker commands, ensure Docker Desktop is installed and the Docker engine is running.

### 1) First-Time Deploy (Single Command)

Run from repository root:

```bash
npm run docker:first-deploy
```

This command:

- creates `.env.docker` from `.env.docker.example` if missing
- builds the images
- starts RabbitFlow + Nginx + PostgreSQL + Redis
- runs bootstrap seed on container start (admin user only)

After first deploy, update secrets in `.env.docker`.

### 2) Create/Review Docker Environment File

Copy `.env.docker.example` to `.env.docker` and set secure secrets.

Required updates:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `SEED_ADMIN_PASSWORD`
- `APP_URL` (for email links, e.g. `http://localhost:4080`)

Bootstrap seed variables:

- `SEED_ADMIN_EMAIL` (default: `rabbittech46@gmail.com`)
- `SEED_ADMIN_NAME` (default: `RabbitFlow Admin`)
- `SEED_ADMIN_PASSWORD` (required strong password)

### 3) Build and Start the Stack

Run from repository root:

```bash
npm run docker:up
```

What happens on startup:

- Postgres and Redis start first and report healthy status.
- App container waits for dependencies.
- App runs `prisma migrate deploy` automatically.
- Nginx exposes the app on `NGINX_PORT` (default `4080`).

### 4) Open the Application

- `http://localhost:4080`

### 5) Redeploy Without Data Loss

You can rebuild/redeploy safely and keep data:

```bash
npm run docker:up
```

Data remains because Docker named volumes are used:

- `rabbitflow_postgres_data`
- `rabbitflow_redis_data`

### 6) Stop or Restart

Stop containers (preserves volumes):

```bash
npm run docker:down
```

Restart containers:

```bash
npm run docker:up
```

### 7) Danger Zone: Full Cleanup (Removes Data)

Only run this if you intentionally want to wipe PostgreSQL and Redis data:

```bash
npm run docker:reset
```

### 8) Production Reset + Seed (Admin-Only)

To fully reset database/cache and redeploy with only bootstrap admin seeded:

```bash
npm run docker:reset
npm run docker:up
```

After reset, the first app startup runs `db:seed:bootstrap` automatically and creates only the configured admin user.

## API Surface (Grouped)

### Auth

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/logout`
- `/api/auth/me`

### Core Domain

- `/api/projects`
- `/api/projects/[projectId]`
- `/api/projects/[projectId]/members`
- `/api/projects/[projectId]/members/[memberId]`
- `/api/users`
- `/api/users/[userId]`
- `/api/issues`
- `/api/issues/[issueId]`
- `/api/comments`
- `/api/comments/[commentId]`
- `/api/labels`
- `/api/labels/[labelId]`
- `/api/states`
- `/api/iterations`
- `/api/iterations/[iterationId]`
- `/api/attachments`
- `/api/relations`

### Agile Views and Operations

- `/api/backlog`
- `/api/board`
- `/api/sprints`
- `/api/sprints/[sprintId]`
- `/api/sprints/[sprintId]/analytics`
- `/api/dashboard`
- `/api/rbac`

### Utility

- `/api/seed`
- `/api`

## Data Model Highlights

Key models in Prisma schema:

- `User`
- `Project`
- `ProjectMember`
- `Issue`
- `Iteration`
- `State`
- `Area`
- `Label` / `IssueLabel`
- `Comment`
- `Attachment`
- `IssueRelation`
- `Activity`

Includes:

- project-scoped uniqueness (`projectId + key`, `projectId + name`)
- useful indexes for board/backlog/sprint queries
- issue hierarchy and relation graph
- optimistic locking field (`Issue.version`)

## Quality and Reliability Notes

- Validation is done with Zod on API inputs.
- Validation errors are normalized to user-safe string messages.
- Redis/cache failures do not break request flows.
- Authentication guard is centralized in `src/proxy.ts`.

## Troubleshooting

### Login does not work

- Ensure users have `passwordHash` values (seed route sets these)
- Re-run seed:

```bash
curl -X POST http://localhost:3000/api/seed
```

### Database errors

- Verify `DATABASE_URL`
- Run:

```bash
npm run db:generate
npm run db:push
```

### Redis not connecting

- Verify `REDIS_URL`
- If Redis is down, app still runs without cache

### Build warnings about workspace root

If Next.js warns about multiple lockfiles, remove unrelated lockfiles outside this project or explicitly set Turbopack root in config.

## Future Improvements

- Add unit/integration/end-to-end tests
- Add CI pipeline for lint/build/test
- Add Docker and docker-compose setup
- Add rate limiting and audit dashboards
- Add multi-tenant/org-level boundaries

## License

No explicit license file is currently included.
Add a LICENSE file (for example MIT) if you plan to distribute this project publicly.
