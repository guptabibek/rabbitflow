# UX & UI Audit

> Conducted in a real browser (Chromium 1440×900, 768×1024, 390×844) against a seeded
> instance. Findings marked **[SEEN]** were observed in screenshots, not inferred.

## Verdict

The product has genuine depth — 27 views, a configurable work-item schema, 9 report
tabs, a command palette, area ACLs — and the **work-item detail screen is legitimately
good**. But the shell around it has three structural problems that a user hits in the
first ten minutes: **no URLs**, **a board that hides its own columns**, and **validation
that tells you a field is missing without telling you where it is**.

It currently feels like a capable engine inside an unfinished chassis.

---

## UX-001 · No URL for anything · **P1** **[SEEN]**

**Location** `src/app/page.tsx:203` (`useState<ViewType>('dashboard')`)

Every view in the product — board, backlog, list, sprints, reports, roadmap, portfolio,
documents, retros, approvals, settings — is a `useState` value on one client component.
The address bar reads `http://localhost:3100/` on all of them, including the work-item
detail screen.

Consequences, all confirmed in the browser:

- You cannot send a colleague a link to the board, a filtered backlog, or a report.
- Browser **back** exits the application instead of returning to the previous view.
- Refreshing drops you back on Dashboard.
- Bookmarks and browser history are useless.
- Opening a work item in a new tab is impossible.

A `/work-items/[issueId]` route **does** exist and `workItemUrl()` is used correctly by
email notifications and by a "copy link" action in the detail dialog — so canonical URLs
exist but in-app navigation never produces them. `canonicalWorkItemRoute()` in
`work-item-view.ts` has unit tests and **zero callers**.

For a tool whose core loop is "look at this ticket", this is the single highest-value fix
in the document.

**Fix.** Convert `currentView` into App Router segments. This one change also gives you
per-route code splitting, `loading.tsx` skeletons and `error.tsx` boundaries for free.

---

## UX-002 · Board columns are cut off with no scroll affordance · **P1** **[SEEN]**

At 1440×900 — an ordinary laptop — the Kanban board shows Backlog, To Do, In Progress,
In Review, and then **"Don…"** sliced by the viewport edge. Done and Cancelled are
unreachable-looking: there is no visible horizontal scrollbar, no fade or shadow at the
edge, no column collapse, no "scroll for more" affordance.

The board is the app's flagship view and its most-visited screen. A user cannot see their
completed work without discovering an invisible scroll.

**Fix.** Persistent horizontal scroll affordance (edge fade + always-visible scrollbar),
collapsible columns, remembered column widths, and a "hide done" toggle. Add WIP limits
and swimlanes while you are there — both are table stakes against Azure Boards.

---

## UX-003 · Required fields are hidden behind tabs; errors don't say where · **P1** **[SEEN]**

**Location** `src/components/project-management/create-issue-dialog.tsx`

The seeded schema makes `scope` required on **all ten** work-item types and `objective`
required on Epics. Both live on the **Fields** tab. The Create form opens on **Basic**.

Reproduced flow:
1. Open "New Work Item" → form opens as *Create Epic* (the least common type — poor default).
2. Fill Title. The Create button enables.
3. Click Create → `HTTP 400`.
4. Feedback: a toast in the **bottom-right corner**, 900 px from the form, reading
   **"Objective is required"**.

There is no inline field error, no focus move, no tab badge, no error summary, and only
**one** missing field is reported per attempt — so the user must fail twice (Objective,
then Scope). The toast auto-dismisses, leaving a form that looks complete.

**Fix.** Mirror the required-field rules client-side from the type schema the form already
loads; mark tabs containing errors; scroll to and focus the first invalid field; return
*all* validation errors from the API at once; render errors inline, not as toasts.

---

## UX-004 · No pagination anywhere; data silently truncates at 200 items · **P1**

**Location** `src/app/page.tsx:227,321` (`pageSize=200`), `list-view.tsx:150-217`,
`kanban-board.tsx:96-136`

The app loads a hard-capped 200 work items into one Zustand array. Every view then
filters, searches and sorts **that array client-side**:

- A project with 201+ items shows an incomplete board and backlog **with no warning**.
- "Search issues…" only searches the 200 loaded items, even though `/api/issues` supports
  proper server-side search.
- Sorting sorts the loaded page, not the project.
- Sprint metrics computed from the array are wrong beyond the cap.

The API already returns `x-total-count`; the UI never reads it. `components/ui/pagination.tsx`
exists and is **never imported**.

**Fix.** Server-side pagination, filtering and sorting for list/backlog; windowed or
lazy-loaded columns for the board; surface the total count; show an explicit "showing X of
Y" indicator.

---

## UX-005 · Eight of twelve delete actions have no confirmation · **P1**

Only `api-token-management`, `documents-view`, `objectives-view` and
`work-item-type-management` use `AlertDialog`. These delete on a single click:

`acl-management` · `automation-rule-builder` · `git-links-panel` · `labels-management` ·
`recurring-task-manager` · `sla-dashboard` · `test-plan-manager` · `webhook-management`

Deleting a label detaches it from every work item; deleting an ACL rule silently changes
who can see what. Neither is undoable.

**Fix.** One shared `<ConfirmDestructiveDialog>` naming the object and its blast radius,
used everywhere. Add undo toasts for reversible cases.

---

## UX-006 · Persistent layout collision in the sidebar · **P2** **[SEEN]**

The "Setup progress 30%" card overlaps and clips the **"New Work Item"** button at the
bottom of the sidebar. Visible at 1440×900, 768×1024 **and** 390×844 — every view, every
viewport. The primary create action in the product is half-hidden behind a progress
widget.

Two further stray elements: an orphan **"×"** floating mid-card on the Dashboard with no
visible owner, and the **"Labels"** button sitting outside the header container in the
top-right corner, misaligned with the header row.

---

## UX-007 · Onboarding checklist dominates the workspace · **P2** **[SEEN]**

The "Getting Started" card occupies roughly **65% of the dashboard viewport** — ten
always-expanded items above the actual KPIs and charts. A returning user's first
impression of their own workspace is a to-do list about the product.

**Fix.** Collapsed by default after the first session; move to a dismissible side panel or
a progress chip in the header.

---

## UX-008 · Login error appears 900px from the form · **P2** **[SEEN]**

Invalid credentials produce a toast in the bottom-right corner. No inline message, no
field highlighting, no `aria-live` association with the inputs. On a wide screen the
user's gaze is on the form; the error is easy to miss and auto-dismisses.

Also on this screen: two competing accent colours (green branding bar + blue primary
button), a password field whose **placeholder** is `********` (reads as pre-filled), no
link to `/register` despite registration being open, and a `logo.svg` that **404s** on
every page load.

---

## UX-009 · Issue keys sort lexicographically · **P2** **[SEEN]**

List View default sort by KEY yields:

```
RABBIT-1, RABBIT-10, RABBIT-11, RABBIT-12, RABBIT-2, RABBIT-3, RABBIT-4 …
```

String comparison on `issue.key` (`list-view.tsx:182-215`). At 100+ items the key column
becomes unusable. Fix: parse and compare the numeric suffix.

---

## UX-010 · Status Distribution chart renders empty · **P2** **[SEEN]**

On Reports → Overview, the "Status Distribution" bar renders as an empty grey track with
**no coloured segments**, while its own legend below reports `backlog 3 · done 2 ·
in progress 3 · in review 1 · todo 3` (= all 12 items). The data is present; the
visualisation is broken. The card also reserves ~250 px for a chart that draws ~20 px.

---

## UX-011 · Mobile drawer stays open after navigating · **P2** **[SEEN]**

Mobile navigation **does work** — the panel toggle opens a drawer and every view is
reachable. But selecting a view does not close the drawer: the board loads *behind* it
while the drawer covers 54% of a 390 px screen. The user must tap the scrim to proceed.

Separately, the Kanban board at 390 px renders ~90 px-wide columns with single-character
title fragments. There is no mobile-specific board layout (single column + status
switcher) — the desktop layout is simply shrunk.

---

## UX-012 · Terminology and metric collisions · **P2** **[SEEN]**

- **"Dashboard" means two different things**: the `/dashboard` project picker, and a
  `currentView='dashboard'` inside a project.
- **"PROJECTS: 1"** is displayed as a KPI *inside a single project's* dashboard and again
  inside that project's Reports Overview. Meaningless in context.
- **"At Risk"** health badge on a brand-new project at 17% progress, with no tooltip, no
  threshold, no definition.
- The third filter in the filter bar is labelled just **"All"** — of what?
- The project-picker search input is **too narrow for its own placeholder** ("Search proj").
- Work-item cards show a bare number in a grey circle (story points) with no label or
  tooltip, and an empty grey circle for "unassigned" that reads as a rendering fault.
- Form tabs are named "Metadata" and "Fields" — developer vocabulary, not user vocabulary.

---

## UX-013 · Built primitives that nothing uses · **P2**

Present in the codebase, imported **zero** times:

| Primitive | Backend support | Status |
|---|---|---|
| **Saved Views** | full CRUD at `/api/views`, `SavedView` model | no UI at all |
| `components/ui/pagination.tsx` | `x-total-count` returned | never imported |
| `components/ui/breadcrumb.tsx` | — | never imported |
| `components/ui/context-menu.tsx` | — | never imported |
| `canonicalWorkItemRoute()` | tested | zero callers |

Saved Views is the notable one: the entire backend exists, and the feature is invisible.

---

## UX-014 · Accessibility gaps · **P2**

- **Only 38 ARIA attributes** across ~50 feature components (some 2,000 lines each).
- **18 icon-only buttons with no accessible name** — including the ACL rule delete button,
  which is both unnamed *and* unconfirmed.
- No focus management on view changes; no skip-to-content beyond the one in `layout.tsx`
  (which is present and correct).
- Errors surface only via toast, without `role="alert"` tied to the offending field.
- Only one keyboard shortcut exists (⌘K / Ctrl-K command palette — which works well).
- No visible focus-ring audit; contrast not verified for the muted-on-dark text used for
  "Unassigned" and helper copy.

---

## UX-015 · Design-system drift · **P2**

There **is** a real design system — `globals.css` defines semantic light/dark tokens for
status, work-item type, priority and role, and `src/lib/ui-tokens.ts` maps them to
Tailwind utilities. It is well built.

It is then bypassed **218 times** by raw palette classes (`bg-slate-950`, `text-green-500`,
`bg-blue-600`…), **74 of which have no `dark:` variant**, concentrated in the newer
feature views:

`auth-shell` · `api-token-management` · `approval-workflow` · `automation-rule-builder` ·
`import-wizard` · `labels-management` · `objectives-view` · `onboarding-checklist` ·
`onboarding-config-view` · `recurring-task-manager` · `reports-view` · `retrospectives-view`

Result: the core views are theme-correct and coherent; the newer views drift and are
theme-fragile.

---

## What is good

State this honestly, because it is real:

- **The work-item detail screen is genuinely strong.** Azure-DevOps-style field strip,
  type-driven form sections (a Bug renders Reproduction Steps / Expected / Observed from
  the configurable schema), right-rail tabs, and **edit mode correctly populates every
  existing value** — Scope, Priority, Story Points all loaded correctly (§32's key test).
- **Sidebar IA is well-grouped**: PLANNING / TRACKING / COLLABORATE / CONFIGURE.
- **Dark theme in core views is polished** and token-driven.
- **Reports breadth is real** — 9 tabs, all backed by working API routes, with team and
  date-range filters and CSV export.
- **Command palette (⌘K)** works.
- **Skeleton loading states** are implemented in the shell and render correctly.
- **Empty states exist** ("No velocity data" with icon) — though they lack next actions.
- **No horizontal page overflow** at 390 px or 768 px (measured: `scrollWidth === innerWidth`).
