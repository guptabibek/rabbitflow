# Frontend Architecture Audit

**Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Zustand**

## The central problem

```text
src/app/page.tsx  —  899 lines, 'use client'

  const [currentView, setCurrentView] = useState<ViewType>('dashboard')

  type ViewType =
    | 'dashboard' | 'backlog' | 'board' | 'sprints' | 'list' | 'reports'
    | 'roadmap'   | 'portfolio' | 'calendar' | 'dependency-graph'
    | 'activity'  | 'teams' | 'settings' | 'documents' | 'objectives'
    | 'retrospectives' | 'approvals' | 'webhooks' | 'automations'
    | 'imports' | 'recurring-tasks' | 'test-plans' | 'sla' | 'api-tokens'
    | 'branding' | 'acl' | 'onboarding-config'
```

Twenty-seven views, all statically imported at the top of one client component. The App
Router is used for four auth/shell pages and then abandoned.

Everything else in this document follows from that one decision.

---

## FE-001 · No routing → no deep links, no code splitting, no error isolation · **P1**

**Consequences measured in the running app:**

| Symptom | Evidence |
|---|---|
| URL never changes | Board, List, Reports, and the work-item detail all render at `/` |
| Browser back exits the app | No history entries are pushed |
| No per-route code splitting | One **1.17 MB** JS chunk; **2.6 MB** total client JS |
| No route-level loading UI | Zero `loading.tsx` files exist |
| No route-level error isolation | Zero `error.tsx` / `global-error.tsx` / `not-found.tsx` |

A parallel implementation of the work-item screen already exists at
`/work-items/[issueId]`, and `workItemUrl()` is used correctly by email notifications and
a "copy link" action — so canonical URLs exist, but in-app navigation never produces them.
`canonicalWorkItemRoute()` is unit-tested and has **zero callers**.

**Fix.** Convert `currentView` to App Router segments (`/p/[projectKey]/board`, `/backlog`,
`/work-items/[id]`, …). This single refactor resolves deep linking, back/forward, code
splitting, per-route skeletons and per-route error boundaries together.

---

## FE-002 · No error boundaries anywhere · **P1**

`grep -rl "ErrorBoundary\|componentDidCatch" src` → **no matches.**
`find src -name "error.tsx" -o -name "global-error.tsx"` → **no matches.**

Because the whole product is one component tree, a render-time exception in *any* view —
a malformed date, an unexpected `null` in a chart, a bad `Array.prototype.at()` — unmounts
the entire application. In production the user sees a blank page with no recovery path.

**Fix.** `global-error.tsx` at the root; `error.tsx` per route segment once FE-001 lands;
a `<ChartErrorBoundary>` around Recharts surfaces, which are the most likely to throw on
unexpected data.

---

## FE-003 · Client-side filtering, sorting and search over a truncated array · **P1**

```ts
// src/app/page.tsx:227
fetchWithRetry(`/api/issues?projectId=${projectId}&pageSize=200`, …)
```

All 200 items land in `useAppStore().issues`. Every view derives from that array:

```ts
// list-view.tsx:150   kanban-board.tsx:96   (same pattern in backlog, sprint, calendar)
const filteredIssues = useMemo(() => issues.filter(issue => { … }), [filters, issues])
```

So: a project with 201+ items renders an incomplete board with no warning; "Search
issues…" only searches the loaded window even though the API supports server-side search;
sorting sorts the page rather than the project. The API returns `x-total-count`; the UI
never reads it. `components/ui/pagination.tsx` exists and is never imported.

**Fix.** Server-side query params for filter/sort/search/page; read `x-total-count`;
virtualise long lists; lazy-load board columns.

---

## FE-004 · Dependency bloat — 12 unused packages · **P2**

Verified by grepping `src/` for each import:

| Package | References in `src/` |
|---|---|
| `@tanstack/react-query` | **0** |
| `next-auth` | **0** |
| `next-intl` | **0** |
| `framer-motion` | **0** |
| `@tanstack/react-table` | **0** |
| `@mdxeditor/editor` | **0** |
| `react-syntax-highlighter` | **0** |
| `@reactuses/core` | **0** |
| `@hookform/resolvers` | **0** |
| `uuid` | **0** |
| `sharp` | **0** |
| `z-ai-web-dev-sdk` | **0** |

`react-hook-form` is referenced only by `components/ui/form.tsx`, which nothing imports —
so **no form in the product uses a form library**. All forms are hand-rolled `useState`.

Two of these matter beyond bundle size:
- **`z-ai-web-dev-sdk`** is an unvetted third-party SDK in the dependency tree of a system
  handling customer project data. It should be removed on supply-chain grounds alone.
- **`sharp`** is *absent* from the code but is exactly what SEC-001 needs for image
  validation — keep it, and start using it.

**Fix.** Remove the other ten. Adopt `react-hook-form` + `zod` resolvers properly for the
forms (see UX-003), or delete `form.tsx` and the two form packages.

---

## FE-005 · ESLint is configured to find nothing · **P2**

`eslint.config.mjs` disables, among others:

```
@typescript-eslint/no-explicit-any        @typescript-eslint/no-unused-vars
react-hooks/exhaustive-deps               no-unreachable
no-fallthrough                            no-undef
prefer-const                              no-empty
```

Running `npm run lint` on 62,700 lines produces **2 errors** — both
`react-hooks/set-state-in-effect`, both real. Lint currently provides close to zero signal.

`tsconfig.json` sets `"strict": true` but then `"noImplicitAny": false`, weakening the
strongest guarantee it buys.

**Credit where due:** despite the neutered config, the codebase contains **zero `any`,
zero `@ts-ignore`, zero `console.log`**, and `npx tsc --noEmit` is clean across all
application source (the only 2 type errors are in `tests/e2e/project-onboarding.spec.ts`).
The discipline is there; the tooling just isn't enforcing it.

**Fix.** Re-enable the rules incrementally, starting with `exhaustive-deps`,
`no-unused-vars` and `no-explicit-any` as warnings, then errors. Set `noImplicitAny: true`.

---

## FE-006 · Component size and duplication · **P2**

| File | Lines |
|---|---|
| `work-item-type-management.tsx` | 2,023 |
| `admin-config-panel.tsx` | 1,782 |
| `sprint-view.tsx` | 1,722 |
| `reports-view.tsx` | 1,578 |
| `issue-detail-dialog.tsx` | 1,548 |
| `create-issue-dialog.tsx` | 1,335 |

Six components over 1,300 lines each, all client components, all eagerly bundled. Filter
logic is duplicated near-identically across `list-view`, `kanban-board`, `backlog-view`
and `sprint-view` (the same ~20-line `issues.filter(...)` predicate in each).

There are also two parallel implementations of the work-item screen —
`issue-detail-dialog.tsx` (inline, used everywhere) and `work-item-page.tsx` (routed,
used almost nowhere).

**Fix.** Extract the shared filter predicate to `src/lib/domain/issue-filters.ts` (it is
pure and testable). Split the 2,000-line config panels by tab. Consolidate the two
work-item implementations onto the routed one as part of FE-001.

---

## FE-007 · No optimistic updates, no rollback · **P2**

Mutations follow: `fetch` → `await` → `toast` → refetch or `setIssues`. Drag-and-drop on
the board waits for a server round-trip before the card settles. There is no optimistic
apply, and therefore no rollback path — which also means the 409 optimistic-lock conflict
the API correctly returns has **no UI reconciliation flow**; the user just sees an error
toast.

**Fix.** Optimistic apply for board drag, status change and assignment, with rollback on
failure. On 409, offer a diff-and-merge prompt rather than "refresh and try again".

---

## FE-008 · Accessibility · **P2**

- **38 ARIA attributes** total across ~50 feature components.
- **18 icon-only buttons** with no `aria-label` and no `sr-only` text.
- No focus management on view change.
- Errors are toast-only, not associated with fields via `aria-describedby` / `role="alert"`.
- One keyboard shortcut in the entire product (⌘K command palette).

Correctly done: the skip-to-content link in `layout.tsx`, `role="complementary"` +
`aria-label` on the sidebar, and `aria-label` on the sidebar collapse toggle.

---

## What is good

- **Type safety is genuinely strong** — clean `tsc --noEmit`, no `any`, no suppressions.
- **The design-token system is well built** (`globals.css` + `ui-tokens.ts`) — semantic
  light/dark tokens for status, type, priority and role. It is under-used, not badly made.
- **`fetchWithRetry` / `parseJsonResponse` / `getApiErrorMessage`** in `lib/utils.ts` give
  consistent timeout, retry and error-extraction behaviour at call sites.
- **Graceful degradation on bootstrap**: `fetchProjectData` falls back from the single
  bootstrap call to nine segmented calls with `Promise.allSettled`, and surfaces a partial
  "some data is delayed" state rather than failing wholesale. This is thoughtful.
- **Zustand persistence is correctly scoped** — `partialize` stores only `activeProjectId`
  and two view-preference maps; no PII in `localStorage`.
- **Skeleton loading states** exist in the shell and render correctly.
