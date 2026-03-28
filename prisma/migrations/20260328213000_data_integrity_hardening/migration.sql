BEGIN;

-- Normalize project branding domains before enforcing uniqueness.
UPDATE "ProjectBranding"
SET "customDomain" = NULL
WHERE "customDomain" IS NOT NULL
  AND btrim("customDomain") = '';

UPDATE "ProjectBranding"
SET "customDomain" = lower(btrim("customDomain"))
WHERE "customDomain" IS NOT NULL;

WITH ranked_domains AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "customDomain"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "ProjectBranding"
  WHERE "customDomain" IS NOT NULL
)
UPDATE "ProjectBranding" AS pb
SET "customDomain" = NULL
FROM ranked_domains AS rd
WHERE pb."id" = rd."id"
  AND rd.rn > 1;

DO $$
BEGIN
  ALTER TABLE "ProjectBranding"
    ADD CONSTRAINT "ProjectBranding_customDomain_lowercase_chk"
    CHECK ("customDomain" IS NULL OR "customDomain" = lower("customDomain"));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectBranding"
    ADD CONSTRAINT "ProjectBranding_customDomain_key" UNIQUE ("customDomain");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Eliminate invalid and duplicate relationship rows before tightening constraints.
DELETE FROM "IssueRelation"
WHERE "sourceIssueId" = "targetIssueId";

WITH ranked_relations AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY
        LEAST("sourceIssueId", "targetIssueId"),
        GREATEST("sourceIssueId", "targetIssueId"),
        CASE
          WHEN "relationType" IN ('blocks', 'blocked_by') THEN 'blocks'
          WHEN "relationType" IN ('tests', 'tested_by') THEN 'tests'
          ELSE "relationType"
        END
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "IssueRelation"
)
DELETE FROM "IssueRelation" AS ir
USING ranked_relations AS rr
WHERE ir."id" = rr."id"
  AND rr.rn > 1;

DO $$
BEGIN
  ALTER TABLE "IssueRelation"
    ADD CONSTRAINT "IssueRelation_no_self_link_chk"
    CHECK ("sourceIssueId" <> "targetIssueId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "IssueRelation_canonical_relation_key"
ON "IssueRelation" (
  LEAST("sourceIssueId", "targetIssueId"),
  GREATEST("sourceIssueId", "targetIssueId"),
  (
    CASE
      WHEN "relationType" IN ('blocks', 'blocked_by') THEN 'blocks'
      WHEN "relationType" IN ('tests', 'tested_by') THEN 'tests'
      ELSE "relationType"
    END
  )
);

-- Repair notification references and state semantics.
UPDATE "Notification" AS n
SET "projectId" = i."projectId"
FROM "Issue" AS i
WHERE n."issueId" = i."id"
  AND (n."projectId" IS NULL OR n."projectId" <> i."projectId");

UPDATE "Notification"
SET "issueId" = NULL
WHERE "issueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "Issue"."id" = "Notification"."issueId"
  );

UPDATE "Notification"
SET "readAt" = NULL
WHERE "isRead" = false;

UPDATE "Notification"
SET "readAt" = COALESCE("readAt", "createdAt")
WHERE "isRead" = true;

UPDATE "Notification"
SET "archivedAt" = NULL
WHERE "isArchived" = false;

UPDATE "Notification"
SET "archivedAt" = COALESCE("archivedAt", "createdAt")
WHERE "isArchived" = true;

CREATE INDEX IF NOT EXISTS "Notification_issueId_idx" ON "Notification"("issueId");

DO $$
BEGIN
  ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_read_state_chk"
    CHECK (
      ("isRead" = false AND "readAt" IS NULL)
      OR ("isRead" = true AND "readAt" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_archive_state_chk"
    CHECK (
      ("isArchived" = false AND "archivedAt" IS NULL)
      OR ("isArchived" = true AND "archivedAt" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Keep user activation state coherent.
UPDATE "User"
SET "deactivatedAt" = NULL
WHERE "isActive" = true;

UPDATE "User"
SET "deactivatedAt" = COALESCE("deactivatedAt", "updatedAt", "createdAt")
WHERE "isActive" = false;

DO $$
BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_active_state_chk"
    CHECK (
      ("isActive" = true AND "deactivatedAt" IS NULL)
      OR ("isActive" = false AND "deactivatedAt" IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add missing foreign keys for analytics and logs.
DELETE FROM "OnboardingAnalytics"
WHERE NOT EXISTS (
  SELECT 1
  FROM "User"
  WHERE "User"."id" = "OnboardingAnalytics"."userId"
);

CREATE INDEX IF NOT EXISTS "OnboardingAnalytics_userId_idx" ON "OnboardingAnalytics"("userId");

DO $$
BEGIN
  ALTER TABLE "OnboardingAnalytics"
    ADD CONSTRAINT "OnboardingAnalytics_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "AutomationLog" AS al
SET "projectId" = ar."projectId"
FROM "AutomationRule" AS ar
WHERE al."ruleId" = ar."id"
  AND al."projectId" IS DISTINCT FROM ar."projectId";

UPDATE "AutomationLog"
SET "triggeredBy" = NULL
WHERE "triggeredBy" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = "AutomationLog"."triggeredBy"
  );

UPDATE "AutomationLog" AS al
SET "issueId" = NULL
FROM "Issue" AS i
WHERE al."issueId" = i."id"
  AND i."projectId" <> al."projectId";

UPDATE "AutomationLog"
SET "issueId" = NULL
WHERE "issueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "Issue"."id" = "AutomationLog"."issueId"
  );

CREATE INDEX IF NOT EXISTS "AutomationLog_triggeredBy_idx" ON "AutomationLog"("triggeredBy");
CREATE INDEX IF NOT EXISTS "AutomationLog_issueId_idx" ON "AutomationLog"("issueId");

DO $$
BEGIN
  ALTER TABLE "AutomationLog"
    ADD CONSTRAINT "AutomationLog_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AutomationLog"
    ADD CONSTRAINT "AutomationLog_triggeredBy_fkey"
    FOREIGN KEY ("triggeredBy") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AutomationLog"
    ADD CONSTRAINT "AutomationLog_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add missing foreign keys for document revisions.
UPDATE "DocumentRevision"
SET "editorId" = NULL
WHERE "editorId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = "DocumentRevision"."editorId"
  );

CREATE INDEX IF NOT EXISTS "DocumentRevision_editorId_idx" ON "DocumentRevision"("editorId");

DO $$
BEGIN
  ALTER TABLE "DocumentRevision"
    ADD CONSTRAINT "DocumentRevision_editorId_fkey"
    FOREIGN KEY ("editorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Recurring task references must point to live records in the same project.
UPDATE "RecurringTask"
SET "templateAssigneeId" = NULL
WHERE "templateAssigneeId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = "RecurringTask"."templateAssigneeId"
  );

UPDATE "RecurringTask" AS rt
SET "templateIterationId" = NULL
FROM "Iteration" AS i
WHERE rt."templateIterationId" = i."id"
  AND i."projectId" <> rt."projectId";

UPDATE "RecurringTask"
SET "templateIterationId" = NULL
WHERE "templateIterationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Iteration"
    WHERE "Iteration"."id" = "RecurringTask"."templateIterationId"
  );

UPDATE "RecurringTask" AS rt
SET "templateAreaId" = NULL
FROM "Area" AS a
WHERE rt."templateAreaId" = a."id"
  AND a."projectId" <> rt."projectId";

UPDATE "RecurringTask"
SET "templateAreaId" = NULL
WHERE "templateAreaId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Area"
    WHERE "Area"."id" = "RecurringTask"."templateAreaId"
  );

CREATE INDEX IF NOT EXISTS "RecurringTask_templateAssigneeId_idx" ON "RecurringTask"("templateAssigneeId");
CREATE INDEX IF NOT EXISTS "RecurringTask_templateIterationId_idx" ON "RecurringTask"("templateIterationId");
CREATE INDEX IF NOT EXISTS "RecurringTask_templateAreaId_idx" ON "RecurringTask"("templateAreaId");

DO $$
BEGIN
  ALTER TABLE "RecurringTask"
    ADD CONSTRAINT "RecurringTask_templateAssigneeId_fkey"
    FOREIGN KEY ("templateAssigneeId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RecurringTask"
    ADD CONSTRAINT "RecurringTask_templateIterationId_fkey"
    FOREIGN KEY ("templateIterationId") REFERENCES "Iteration"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "RecurringTask"
    ADD CONSTRAINT "RecurringTask_templateAreaId_fkey"
    FOREIGN KEY ("templateAreaId") REFERENCES "Area"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Key result issue references should not outlive or cross projects.
UPDATE "KeyResult" AS kr
SET "issueId" = NULL
FROM "Objective" AS o, "Issue" AS i
WHERE kr."objectiveId" = o."id"
  AND kr."issueId" = i."id"
  AND i."projectId" <> o."projectId";

UPDATE "KeyResult"
SET "issueId" = NULL
WHERE "issueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "Issue"."id" = "KeyResult"."issueId"
  );

CREATE INDEX IF NOT EXISTS "KeyResult_issueId_idx" ON "KeyResult"("issueId");

DO $$
BEGIN
  ALTER TABLE "KeyResult"
    ADD CONSTRAINT "KeyResult_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "Issue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Retrospective action items should not point across projects.
UPDATE "RetroItem" AS ri
SET "actionItemIssueId" = NULL
FROM "Retrospective" AS r, "Issue" AS i
WHERE ri."retrospectiveId" = r."id"
  AND ri."actionItemIssueId" = i."id"
  AND i."projectId" <> r."projectId";

UPDATE "RetroItem"
SET "actionItemIssueId" = NULL
WHERE "actionItemIssueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "Issue"."id" = "RetroItem"."actionItemIssueId"
  );

CREATE INDEX IF NOT EXISTS "RetroItem_actionItemIssueId_idx" ON "RetroItem"("actionItemIssueId");

DO $$
BEGIN
  ALTER TABLE "RetroItem"
    ADD CONSTRAINT "RetroItem_actionItemIssueId_fkey"
    FOREIGN KEY ("actionItemIssueId") REFERENCES "Issue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Approval records must keep valid state references and approval counts.
UPDATE "ApprovalRequest"
SET "requiredApprovals" = 1
WHERE "requiredApprovals" < 1;

UPDATE "StateTransition"
SET "minApprovals" = 1
WHERE "minApprovals" < 1;

UPDATE "ApprovalRequest"
SET "fromStateId" = NULL
WHERE "fromStateId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "State"
    WHERE "State"."id" = "ApprovalRequest"."fromStateId"
  );

UPDATE "ApprovalRequest"
SET "toStateId" = NULL
WHERE "toStateId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "State"
    WHERE "State"."id" = "ApprovalRequest"."toStateId"
  );

UPDATE "ApprovalRequest" AS ar
SET "fromStateId" = NULL
FROM "Issue" AS i, "State" AS s
WHERE ar."issueId" = i."id"
  AND ar."fromStateId" = s."id"
  AND s."projectId" <> i."projectId";

UPDATE "ApprovalRequest" AS ar
SET "toStateId" = NULL
FROM "Issue" AS i, "State" AS s
WHERE ar."issueId" = i."id"
  AND ar."toStateId" = s."id"
  AND s."projectId" <> i."projectId";

CREATE INDEX IF NOT EXISTS "ApprovalRequest_fromStateId_idx" ON "ApprovalRequest"("fromStateId");
CREATE INDEX IF NOT EXISTS "ApprovalRequest_toStateId_idx" ON "ApprovalRequest"("toStateId");

DO $$
BEGIN
  ALTER TABLE "ApprovalRequest"
    ADD CONSTRAINT "ApprovalRequest_fromStateId_fkey"
    FOREIGN KEY ("fromStateId") REFERENCES "State"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ApprovalRequest"
    ADD CONSTRAINT "ApprovalRequest_toStateId_fkey"
    FOREIGN KEY ("toStateId") REFERENCES "State"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ApprovalRequest"
    ADD CONSTRAINT "ApprovalRequest_requiredApprovals_chk"
    CHECK ("requiredApprovals" >= 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "StateTransition"
    ADD CONSTRAINT "StateTransition_minApprovals_chk"
    CHECK ("minApprovals" >= 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Backfill and constrain test planning references.
UPDATE "TestPlan"
SET "createdById" = NULL
WHERE "createdById" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = "TestPlan"."createdById"
  );

CREATE INDEX IF NOT EXISTS "TestPlan_createdById_idx" ON "TestPlan"("createdById");

DO $$
BEGIN
  ALTER TABLE "TestPlan"
    ADD CONSTRAINT "TestPlan_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "TestCase" AS tc
SET "linkedIssueId" = NULL
FROM "Issue" AS i
WHERE tc."linkedIssueId" = i."id"
  AND i."projectId" <> tc."projectId";

UPDATE "TestCase"
SET "linkedIssueId" = NULL
WHERE "linkedIssueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "Issue"."id" = "TestCase"."linkedIssueId"
  );

UPDATE "TestCase"
SET "createdById" = NULL
WHERE "createdById" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = "TestCase"."createdById"
  );

CREATE INDEX IF NOT EXISTS "TestCase_linkedIssueId_idx" ON "TestCase"("linkedIssueId");
CREATE INDEX IF NOT EXISTS "TestCase_createdById_idx" ON "TestCase"("createdById");

DO $$
BEGIN
  ALTER TABLE "TestCase"
    ADD CONSTRAINT "TestCase_linkedIssueId_fkey"
    FOREIGN KEY ("linkedIssueId") REFERENCES "Issue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TestCase"
    ADD CONSTRAINT "TestCase_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "TestRun" AS tr
SET "testPlanId" = tc."testPlanId"
FROM "TestCase" AS tc
WHERE tr."testCaseId" = tc."id"
  AND tr."testPlanId" IS NULL
  AND tc."testPlanId" IS NOT NULL;

UPDATE "TestRun"
SET "testPlanId" = NULL
WHERE "testPlanId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "TestPlan"
    WHERE "TestPlan"."id" = "TestRun"."testPlanId"
  );

UPDATE "TestRun"
SET "executedById" = NULL
WHERE "executedById" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "User"
    WHERE "User"."id" = "TestRun"."executedById"
  );

UPDATE "TestRun"
SET "linkedIssueId" = NULL
WHERE "linkedIssueId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "Issue"."id" = "TestRun"."linkedIssueId"
  );

CREATE INDEX IF NOT EXISTS "TestRun_executedById_idx" ON "TestRun"("executedById");
CREATE INDEX IF NOT EXISTS "TestRun_linkedIssueId_idx" ON "TestRun"("linkedIssueId");

DO $$
BEGIN
  ALTER TABLE "TestRun"
    ADD CONSTRAINT "TestRun_testPlanId_fkey"
    FOREIGN KEY ("testPlanId") REFERENCES "TestPlan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TestRun"
    ADD CONSTRAINT "TestRun_executedById_fkey"
    FOREIGN KEY ("executedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "TestRun"
    ADD CONSTRAINT "TestRun_linkedIssueId_fkey"
    FOREIGN KEY ("linkedIssueId") REFERENCES "Issue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Normalize import counters before constraining them.
UPDATE "ImportJob"
SET
  "totalRows" = GREATEST("totalRows", 0),
  "processedRows" = GREATEST("processedRows", 0),
  "successRows" = GREATEST("successRows", 0),
  "failedRows" = GREATEST("failedRows", 0);

UPDATE "ImportJob"
SET "processedRows" = GREATEST("processedRows", "successRows" + "failedRows");

UPDATE "ImportJob"
SET "totalRows" = GREATEST("totalRows", "processedRows");

DO $$
BEGIN
  ALTER TABLE "ImportJob"
    ADD CONSTRAINT "ImportJob_non_negative_counts_chk"
    CHECK (
      "totalRows" >= 0
      AND "processedRows" >= 0
      AND "successRows" >= 0
      AND "failedRows" >= 0
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ImportJob"
    ADD CONSTRAINT "ImportJob_processed_counts_chk"
    CHECK (
      "successRows" + "failedRows" <= "processedRows"
      AND "processedRows" <= "totalRows"
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
