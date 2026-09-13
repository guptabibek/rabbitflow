-- SLA attachment is delivered at least once by BullMQ. Retain the earliest
-- timer from any duplicate group created by retries before enforcing the
-- idempotency key at the database boundary.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "issueId", "policyId", "timerType"
      ORDER BY "startedAt" ASC, "id" ASC
    ) AS row_number
  FROM "SlaTimer"
)
DELETE FROM "SlaTimer"
WHERE "id" IN (
  SELECT "id"
  FROM ranked
  WHERE row_number > 1
);

-- Older application versions used status='breached' as a fourth lifecycle
-- state. Breach is now represented by breachedAt while status remains the
-- independent running/paused/completed lifecycle.
UPDATE "SlaTimer"
SET "status" = 'running'
WHERE "status" = 'breached';

CREATE UNIQUE INDEX "SlaTimer_issueId_policyId_timerType_key"
ON "SlaTimer"("issueId", "policyId", "timerType");
