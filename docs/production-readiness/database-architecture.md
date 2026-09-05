# Database Audit

**PostgreSQL 16 · Prisma 6.19 · 59 models · 18 migrations · 138 indexes**

## Overall

The schema is the most mature part of the system. Indexing is thorough and clearly
driven by real query shapes; migrations are idempotent, transactional and normalise data
before tightening constraints. Two things need attention: **cascade rules that can destroy
history**, and **index creation strategy at deploy time**.

---

## DB-001 · Cascades that delete business history · **P1**

```prisma
// prisma/schema.prisma
reporter    User @relation("ReportedIssues", fields: [reporterId], references: [id], onDelete: Cascade)
user        User @relation(fields: [uploadedBy],  references: [id], onDelete: Cascade)  // Attachment
```

Deleting a `User` row deletes **every work item they reported**, and transitively every
comment, attachment, activity record, relation, custom field value and SLA timer on those
items. `DELETE /api/users/[userId]` (`users/[userId]/route.ts:120-139`) calls
`db.user.delete()` directly with no soft-delete and no guard.

The schema already has the right primitives — `isActive`, `deactivatedAt`,
`mustResetPassword` — and the admin security API uses them. The raw delete endpoint
should not exist.

**Fix.** `Issue.reporter` → `onDelete: Restrict` (or `SetNull` with a nullable
`reporterId` and an "Unknown user" placeholder); `Attachment.user` and `Comment.author` →
`SetNull`. Replace the delete endpoint with deactivation + anonymisation.

**Migration risk:** changing `reporterId` to nullable requires a data migration and touches
a hot table. Do it in a low-traffic window with `CONCURRENTLY`-created supporting indexes.

---

## DB-002 · Every index is built with a table-level lock · **P1**

138 `CREATE INDEX` statements across 18 migrations. **Zero** use `CREATE INDEX
CONCURRENTLY** (verified: `grep -c CONCURRENTLY` → 0).

`CREATE INDEX` takes a `SHARE` lock, blocking all writes to the table for the duration.
On an empty database that is instant. On a production `Issue` table with millions of rows
it is minutes of write downtime — and migrations run in **`docker/entrypoint.sh` at
container start**, so a routine deploy becomes an outage.

Compounding this: with more than one app replica, every replica runs `prisma migrate
deploy` simultaneously. Prisma's advisory lock serialises them, but the extra replicas
block on startup and can trip their `start_period` healthcheck window.

**Fix.**
1. Move `prisma migrate deploy` out of the app entrypoint into a dedicated one-shot
   migration job that runs before the app rolls.
2. Use `CONCURRENTLY` for index creation on populated tables (requires
   `Prisma.migrate` raw SQL outside a transaction block).
3. Adopt expand/contract for column changes so app and schema versions overlap safely.

---

## DB-003 · No `DELETE`-side integrity for orphaned upload files · **P2**

`Attachment` rows cascade-delete with their `Issue`, but the **files on disk do not**.
`DELETE /api/attachments` unlinks the file only on the explicit single-attachment path.
Deleting an issue (or a project, or a user) leaves the blobs in `public/uploads/attachments`
forever. Old avatars are likewise never removed when replaced.

**Fix.** Move to object storage with lifecycle rules, or add a reconciliation job that
deletes blobs with no corresponding row.

---

## DB-004 · `status` and `stateId` encode the same fact twice · **P2**

`Issue` carries both a denormalised `status` string (`backlog|todo|in_progress|in_review|
done|cancelled`) and a `stateId` FK to the configurable `State` table.
`statusFromStateCategory()` derives one from the other, and both are written on create and
update. Indexes exist on each independently and on several combinations.

This is a deliberate performance denormalisation and it is applied consistently — but
there is **no database-level constraint** keeping them in agreement. Any write path that
misses the derivation (a future migration, a bulk update, a manual fix) silently produces
rows where the board and the state machine disagree.

**Fix.** Either add a trigger/generated column enforcing the derivation, or add a
data-integrity check to the existing `scripts/db-integrity-audit.sql` and run it in CI.

---

## DB-005 · No archival or retention strategy · **P2**

`Activity`, `Notification`, `WebhookDelivery`, `AutomationLog`, `SecurityAuditEvent` and
`AuthSession` grow without bound. `WebhookDelivery` stores up to 4 KB of response body per
delivery attempt; a chatty project with retries will dominate the database within months.
There is no partitioning, no TTL job, no archival table.

**Fix.** Retention policy per table (e.g. deliveries 30 days, notifications 90 days,
activity archived after 1 year), enforced by the existing cron endpoint. Consider monthly
partitioning for `Activity` and `WebhookDelivery`.

---

## DB-006 · Full-text index exists but is partly unused · **P2**

`Issue.searchVector` (tsvector, trigger-maintained, created in
`20260327100000_enterprise_features_phase1`) is used correctly by `search-service.ts` and
ignored by `/api/issues?search=` — see BE-006. Half the query paths benefit from the
index; the other half sequential-scan.

---

## What is good

- **Indexing is genuinely well done.** `Issue` alone carries 19 indexes, including the
  exact composites the board and backlog queries need
  (`[projectId, status, columnOrder]`, `[projectId, status, parentIssueId, columnOrder]`,
  `[projectId, workItemType, status]`).
- **Migrations are idempotent and safe to re-run** — `DO $$ … EXCEPTION WHEN
  duplicate_object THEN NULL; END $$` around constraint additions, wrapped in `BEGIN/COMMIT`.
- **Data is normalised before constraints are tightened.** The
  `20260328213000_data_integrity_hardening` migration lower-cases and de-duplicates
  `ProjectBranding.customDomain`, and removes self-referential and duplicate
  `IssueRelation` rows, *before* adding the unique constraints — exactly the right order.
- **Audit fields are consistently present** (`createdAt`, `updatedAt` on essentially every
  model).
- **Composite natural keys are used where correct** — `@@unique([projectId, key])` on
  `Issue`, `@@id([issueId, fieldDefinitionId])` on `WorkItemFieldValue`,
  `@@unique([projectId, userId])` on `ProjectMember`.
- **`onDelete: SetNull` is used correctly** for optional references (assignee, iteration,
  area, state, parent issue) — the cascade problem is confined to the three relations in
  DB-001.
- **A standing integrity script exists**: `scripts/db-integrity-audit.sql`.
