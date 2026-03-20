ALTER TABLE "State"
ADD COLUMN IF NOT EXISTS "isFinal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Area"
ADD COLUMN IF NOT EXISTS "pathSegments" JSONB;

ALTER TABLE "Iteration"
ADD COLUMN IF NOT EXISTS "pathSegments" JSONB;

UPDATE "State"
SET "category" = CASE
  WHEN "category" IN ('Proposed', 'New') THEN 'New'
  WHEN "category" IN ('InProgress', 'In Progress') THEN 'In Progress'
  WHEN "category" IN ('Resolved', 'Completed', 'Done') THEN 'Done'
  ELSE 'New'
END;

UPDATE "State"
SET "isFinal" = CASE
  WHEN "category" = 'Done' THEN true
  ELSE false
END;

UPDATE "Iteration"
SET "status" = CASE
  WHEN "status" IN ('planning', 'Planned') THEN 'Planned'
  WHEN "status" IN ('active', 'Active') THEN 'Active'
  WHEN "status" IN ('completed', 'closed', 'Closed') THEN 'Closed'
  ELSE 'Planned'
END;

ALTER TABLE "Iteration"
ALTER COLUMN "status" SET DEFAULT 'Planned';

CREATE TABLE IF NOT EXISTS "WorkItemTypeStateMapping" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workItemTypeId" TEXT NOT NULL,
  "stateId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isInitial" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkItemTypeStateMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkItemTypeStateMapping_workItemTypeId_fkey"
    FOREIGN KEY ("workItemTypeId") REFERENCES "WorkItemTypeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkItemTypeStateMapping_stateId_fkey"
    FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkItemTypeStateMapping_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StateTransition" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workItemTypeId" TEXT NOT NULL,
  "fromStateId" TEXT NOT NULL,
  "toStateId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StateTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StateTransition_workItemTypeId_fkey"
    FOREIGN KEY ("workItemTypeId") REFERENCES "WorkItemTypeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StateTransition_fromStateId_fkey"
    FOREIGN KEY ("fromStateId") REFERENCES "State"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StateTransition_toStateId_fkey"
    FOREIGN KEY ("toStateId") REFERENCES "State"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StateTransition_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WorkItemTypeFieldMapping" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "workItemTypeId" TEXT NOT NULL,
  "fieldDefinitionId" TEXT NOT NULL,
  "sectionId" TEXT,
  "groupKey" TEXT NOT NULL DEFAULT 'details',
  "order" INTEGER NOT NULL DEFAULT 0,
  "requiredOverride" BOOLEAN,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkItemTypeFieldMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkItemTypeFieldMapping_workItemTypeId_fkey"
    FOREIGN KEY ("workItemTypeId") REFERENCES "WorkItemTypeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkItemTypeFieldMapping_fieldDefinitionId_fkey"
    FOREIGN KEY ("fieldDefinitionId") REFERENCES "WorkItemFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkItemTypeFieldMapping_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "WorkItemSectionDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkItemTypeFieldMapping_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkItemTypeStateMapping_workItemTypeId_stateId_key"
  ON "WorkItemTypeStateMapping"("workItemTypeId", "stateId");
CREATE INDEX IF NOT EXISTS "WorkItemTypeStateMapping_projectId_workItemTypeId_order_idx"
  ON "WorkItemTypeStateMapping"("projectId", "workItemTypeId", "order");
CREATE INDEX IF NOT EXISTS "WorkItemTypeStateMapping_stateId_idx"
  ON "WorkItemTypeStateMapping"("stateId");

CREATE UNIQUE INDEX IF NOT EXISTS "StateTransition_workItemTypeId_fromStateId_toStateId_key"
  ON "StateTransition"("workItemTypeId", "fromStateId", "toStateId");
CREATE INDEX IF NOT EXISTS "StateTransition_projectId_workItemTypeId_fromStateId_order_idx"
  ON "StateTransition"("projectId", "workItemTypeId", "fromStateId", "order");
CREATE INDEX IF NOT EXISTS "StateTransition_toStateId_idx"
  ON "StateTransition"("toStateId");

CREATE UNIQUE INDEX IF NOT EXISTS "WorkItemTypeFieldMapping_workItemTypeId_fieldDefinitionId_key"
  ON "WorkItemTypeFieldMapping"("workItemTypeId", "fieldDefinitionId");
CREATE INDEX IF NOT EXISTS "WorkItemTypeFieldMapping_projectId_workItemTypeId_groupKey_order_idx"
  ON "WorkItemTypeFieldMapping"("projectId", "workItemTypeId", "groupKey", "order");
CREATE INDEX IF NOT EXISTS "WorkItemTypeFieldMapping_fieldDefinitionId_idx"
  ON "WorkItemTypeFieldMapping"("fieldDefinitionId");

CREATE INDEX IF NOT EXISTS "State_projectId_order_idx"
  ON "State"("projectId", "order");
CREATE INDEX IF NOT EXISTS "Area_projectId_parentId_idx"
  ON "Area"("projectId", "parentId");
CREATE INDEX IF NOT EXISTS "Iteration_projectId_status_idx"
  ON "Iteration"("projectId", "status");

UPDATE "Area"
SET "pathSegments" = to_jsonb(
  array_remove(
    string_to_array(
      regexp_replace(replace("path", E'\\\\', '/'), E'\\s*/\\s*', '/', 'g'),
      '/'
    ),
    ''
  )
)
WHERE "pathSegments" IS NULL
  AND COALESCE(TRIM("path"), '') <> '';

UPDATE "Area"
SET "pathSegments" = to_jsonb(ARRAY["name"])
WHERE "pathSegments" IS NULL;

UPDATE "Iteration"
SET "pathSegments" = to_jsonb(
  array_remove(
    string_to_array(
      regexp_replace(replace("path", E'\\\\', '/'), E'\\s*/\\s*', '/', 'g'),
      '/'
    ),
    ''
  )
)
WHERE "pathSegments" IS NULL
  AND COALESCE(TRIM("path"), '') <> '';

UPDATE "Iteration"
SET "pathSegments" = to_jsonb(ARRAY["name"])
WHERE "pathSegments" IS NULL;

WITH ranked_states AS (
  SELECT
    wit."projectId",
    wit."id" AS "workItemTypeId",
    st."id" AS "stateId",
    ROW_NUMBER() OVER (
      PARTITION BY wit."id"
      ORDER BY st."order" ASC, st."name" ASC
    ) AS rn
  FROM "WorkItemTypeDefinition" wit
  JOIN "State" st
    ON st."projectId" = wit."projectId"
)
INSERT INTO "WorkItemTypeStateMapping" (
  "id",
  "projectId",
  "workItemTypeId",
  "stateId",
  "order",
  "isInitial",
  "createdAt",
  "updatedAt"
)
SELECT
  md5("workItemTypeId" || ':' || "stateId" || ':mapping'),
  "projectId",
  "workItemTypeId",
  "stateId",
  rn * 10,
  rn = 1,
  NOW(),
  NOW()
FROM ranked_states
ON CONFLICT ("workItemTypeId", "stateId") DO UPDATE
SET
  "order" = EXCLUDED."order",
  "updatedAt" = NOW();

WITH types_without_initial AS (
  SELECT "workItemTypeId"
  FROM "WorkItemTypeStateMapping"
  GROUP BY "workItemTypeId"
  HAVING bool_or("isInitial") = false
),
first_mappings AS (
  SELECT DISTINCT ON (m."workItemTypeId")
    m."id"
  FROM "WorkItemTypeStateMapping" m
  JOIN types_without_initial t
    ON t."workItemTypeId" = m."workItemTypeId"
  ORDER BY m."workItemTypeId", m."order" ASC, m."id" ASC
)
UPDATE "WorkItemTypeStateMapping"
SET "isInitial" = true,
    "updatedAt" = NOW()
WHERE "id" IN (SELECT "id" FROM first_mappings);

WITH types_without_transitions AS (
  SELECT wit."projectId", wit."id" AS "workItemTypeId"
  FROM "WorkItemTypeDefinition" wit
  LEFT JOIN "StateTransition" tr
    ON tr."workItemTypeId" = wit."id"
  GROUP BY wit."projectId", wit."id"
  HAVING COUNT(tr."id") = 0
),
ranked_mappings AS (
  SELECT
    t."projectId",
    m."workItemTypeId",
    m."stateId",
    ROW_NUMBER() OVER (
      PARTITION BY m."workItemTypeId"
      ORDER BY m."order" ASC, m."id" ASC
    ) AS rn
  FROM "WorkItemTypeStateMapping" m
  JOIN types_without_transitions t
    ON t."workItemTypeId" = m."workItemTypeId"
)
INSERT INTO "StateTransition" (
  "id",
  "projectId",
  "workItemTypeId",
  "fromStateId",
  "toStateId",
  "order",
  "isEnabled",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(r1."workItemTypeId" || ':' || r1."stateId" || ':' || r2."stateId" || ':transition'),
  r1."projectId",
  r1."workItemTypeId",
  r1."stateId",
  r2."stateId",
  r2.rn * 10,
  true,
  NOW(),
  NOW()
FROM ranked_mappings r1
JOIN ranked_mappings r2
  ON r1."workItemTypeId" = r2."workItemTypeId"
  AND ABS(r2.rn - r1.rn) <= 1
ON CONFLICT ("workItemTypeId", "fromStateId", "toStateId") DO NOTHING;

INSERT INTO "WorkItemTypeFieldMapping" (
  "id",
  "projectId",
  "workItemTypeId",
  "fieldDefinitionId",
  "sectionId",
  "groupKey",
  "order",
  "requiredOverride",
  "isVisible",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(fd."workItemTypeId" || ':' || fd."id" || ':fieldmapping'),
  fd."projectId",
  fd."workItemTypeId",
  fd."id",
  fd."sectionId",
  CASE
    WHEN LOWER(fd."key") IN ('story_points', 'scope', 'desirability', 'defect_of_origin') THEN 'planning'
    ELSE COALESCE(sec."key", 'details')
  END,
  fd."order",
  fd."required",
  true,
  NOW(),
  NOW()
FROM "WorkItemFieldDefinition" fd
LEFT JOIN "WorkItemSectionDefinition" sec
  ON sec."id" = fd."sectionId"
ON CONFLICT ("workItemTypeId", "fieldDefinitionId") DO UPDATE
SET
  "sectionId" = EXCLUDED."sectionId",
  "groupKey" = EXCLUDED."groupKey",
  "order" = EXCLUDED."order",
  "updatedAt" = NOW();
