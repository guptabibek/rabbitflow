-- Track which revision of system-record provisioning a project has had applied.
--
-- Provisioning previously ran as a lazy self-heal on thirteen read paths: every
-- project, every process, every five minutes, a user's GET paid for ten parallel
-- COUNT queries, and a cache miss could run a sixty-second repair transaction
-- inside the request. The dedupe cache was a module-level Map, so the cost
-- multiplied by replica count and replicas could contend on the same repair.
--
-- A single indexed column read now answers the question, and replicas agree.

BEGIN;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "systemRecordsVersion" INTEGER NOT NULL DEFAULT 0;

-- Existing projects are marked as provisioned at version 1 when they already
-- carry the records that version produces. Anything incomplete keeps version 0
-- and is repaired by the read-path safety net, or by:
--   node --experimental-strip-types scripts/backfill-system-records.mts
UPDATE "Project" p
SET "systemRecordsVersion" = 1
WHERE EXISTS (SELECT 1 FROM "State" s WHERE s."projectId" = p."id")
  AND EXISTS (SELECT 1 FROM "Area" a WHERE a."projectId" = p."id")
  AND EXISTS (SELECT 1 FROM "Team" t WHERE t."projectId" = p."id")
  AND EXISTS (
    SELECT 1 FROM "WorkItemTypeDefinition" w WHERE w."projectId" = p."id"
  )
  AND EXISTS (
    SELECT 1 FROM "WorkItemTypeStateMapping" m WHERE m."projectId" = p."id"
  )
  AND EXISTS (
    SELECT 1 FROM "WorkItemTypeFieldMapping" f WHERE f."projectId" = p."id"
  );

COMMIT;
