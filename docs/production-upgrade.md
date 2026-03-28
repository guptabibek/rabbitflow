# RabbitFlow Production Upgrade

## 1. Codebase Analysis

### Current stack
- Frontend: Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, Zustand, dnd-kit, Recharts.
- Backend: Next.js route handlers, Prisma ORM, PostgreSQL schema, JWT cookie auth, optional Redis.
- State/data flow: client-heavy bootstrapping with Zustand store populated from REST endpoints.

### Main issues found before changes
- Authentication was inconsistent. Middleware protected routes, but project permission checks allowed anonymous access by default.
- Actor resolution trusted request parameters and fallback ids, which meant user identity could be spoofed in some mutations.
- Project list and user list endpoints returned too much data globally, which broke multi-project isolation.
- Active project selection was not durable. Reloading often fell back to the first project instead of the selected one.
- RBAC existed in the schema/domain layer but frontend and several APIs still used mixed legacy roles.
- Labels, profile, and member management had UI scaffolding but incomplete production behavior.
- Redis existed but only one sprint analytics endpoint used it. Board/backlog/dashboard remained uncached.
- Some mutation routes did not invalidate derived views, so board/backlog/sprint data could drift stale.

## 2. Target Architecture

### Modules
- Authentication and session context: JWT cookie, middleware header propagation, authenticated-user resolver.
- Workspace and project context: project membership filtered project list plus active-project cookie.
- Work items: project-scoped CRUD, hierarchy, labels, relations, audit log, optimistic locking.
- Sprint and iteration system: sprint CRUD, analytics, capacity planning, sprint-specific board/backlog views.
- RBAC: canonical project roles (`Admin`, `PM`, `Dev`, `QA`, `Viewer`) mapped to permissions.
- Caching: Redis-backed read caching for board, backlog, dashboard, sprint analytics, sprint capacity.
- Profile and identity: self-service profile updates, password change, avatar upload endpoint.

### Separation of concerns
- `src/lib/domain/auth.ts` is now the trust boundary for request actor resolution.
- Project-scoped APIs enforce permission checks at the route layer.
- Derived views use cache keys scoped by project or sprint and are invalidated from write paths.
- Zustand persists only active project identity; server remains source of truth for access and data.

## 3. UI/UX Redesign Plan

### Implemented
- Login now flows into a real project selection workspace.
- Active project selection persists across refreshes and server round-trips.
- Main shell is organized around sidebar, topbar, filter bar, and content region.
- Project switcher, member actions, labels management, and profile/settings are role-aware.
- Filters now include label filtering and cleaner multi-project switching behavior.
- Sprint grouping now supports grouping by story rather than only by type.

### Remaining product-level opportunities
- Rich text editing can move from textarea to `@mdxeditor/editor` for descriptions/comments.
- Avatar storage should eventually move from local disk to object storage for SaaS deployment.
- Notifications and real-time collaboration should be added as separate background/event modules.

## 4. Data Model Notes

### Existing schema strengths retained
- Multi-project project memberships.
- Work-item hierarchy and issue relations.
- Iterations and sprint capacity records.
- Labels via many-to-many join table.
- Activity log / audit history.

### Runtime behavior improved
- Assignees, labels, parent issues, iterations, and areas are now validated as project-scoped references.
- Reporter/comment author spoofing was removed from API writes; authenticated actor is now authoritative.
- Label updates are supported on work-item edit.

## 5. Implementation Summary

### Backend
- Hardened authenticated user resolution and project permission enforcement.
- Added active-project API and cookie-based project context.
- Secured project, user, label, state, dashboard, and RBAC endpoints.
- Added cache invalidation helpers and applied Redis caching to board, backlog, dashboard, sprint analytics, and sprint capacity.
- Added avatar upload API and disabled seed endpoint in production.

### Frontend
- Reworked app bootstrap to load authenticated user, accessible projects, active project, and project-scoped data in the right order.
- Persisted active project id in Zustand.
- Updated project selection flow and main app shell.
- Added label filtering in the filter bar.
- Reworked member management around canonical roles.
- Improved profile management with avatar upload support.

## 6. Files Touched

### Core server
- `src/lib/domain/auth.ts`
- `src/lib/domain/project-context.ts`
- `src/lib/domain/cache.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/active/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/users/[userId]/route.ts`
- `src/app/api/users/[userId]/avatar/route.ts`
- `src/app/api/issues/route.ts`
- `src/app/api/issues/[issueId]/route.ts`
- `src/app/api/comments/route.ts`
- `src/app/api/labels/route.ts`
- `src/app/api/labels/[labelId]/route.ts`
- `src/app/api/board/route.ts`
- `src/app/api/backlog/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/states/route.ts`
- `src/app/api/rbac/route.ts`

### Client shell and feature UI
- `src/store/app-store.ts`
- `src/app/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/profile/page.tsx`
- `src/components/project-management/app-sidebar.tsx`
- `src/components/project-management/filter-bar.tsx`
- `src/components/project-management/member-management.tsx`
- `src/components/project-management/issue-detail-dialog.tsx`
- `src/components/project-management/user-profile.tsx`
- `src/components/project-management/sprint-view.tsx`

## 7. Integration Instructions

### Required environment
- `DATABASE_URL` pointing to PostgreSQL.
- `JWT_SECRET` set to a strong value.
- Optional: `REDIS_URL` for cache activation.

### Recommended setup
1. Run Prisma client generation and database sync/migrations.
2. Ensure `public/uploads/avatars` is writable in your deployment target or replace with object storage.
3. In production, disable or remove any demo/seed workflow.
4. Add reverse-proxy or CDN cache headers only after validating Redis-backed invalidation behavior.

### Validation focus
- Login -> project selection -> active project persistence.
- Project isolation across board/backlog/list/sprint endpoints.
- Role-based restrictions for member management, sprint management, and work-item creation.
- Label create/edit/delete and label-based filtering.
- Avatar upload and password change for the authenticated user.
