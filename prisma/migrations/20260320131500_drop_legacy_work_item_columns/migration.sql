INSERT INTO "WorkItemFieldValue" (
    "issueId",
    "fieldDefinitionId",
    "projectId",
    "stringValue",
    "numberValue",
    "booleanValue",
    "dateValue",
    "jsonValue",
    "updatedAt"
)
SELECT
    issue."id",
    field."id",
    issue."projectId",
    issue."acceptanceCriteria",
    NULL,
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP
FROM "Issue" AS issue
INNER JOIN "WorkItemTypeDefinition" AS type_def
    ON type_def."projectId" = issue."projectId"
   AND type_def."key" = issue."workItemType"
INNER JOIN "WorkItemFieldDefinition" AS field
    ON field."workItemTypeId" = type_def."id"
   AND field."key" = 'acceptance_criteria'
LEFT JOIN "WorkItemFieldValue" AS existing
    ON existing."issueId" = issue."id"
   AND existing."fieldDefinitionId" = field."id"
WHERE issue."acceptanceCriteria" IS NOT NULL
  AND issue."acceptanceCriteria" <> ''
  AND existing."issueId" IS NULL;

INSERT INTO "WorkItemFieldValue" (
    "issueId",
    "fieldDefinitionId",
    "projectId",
    "stringValue",
    "numberValue",
    "booleanValue",
    "dateValue",
    "jsonValue",
    "updatedAt"
)
SELECT
    issue."id",
    field."id",
    issue."projectId",
    issue."reproductionSteps",
    NULL,
    NULL,
    NULL,
    NULL,
    CURRENT_TIMESTAMP
FROM "Issue" AS issue
INNER JOIN "WorkItemTypeDefinition" AS type_def
    ON type_def."projectId" = issue."projectId"
   AND type_def."key" = issue."workItemType"
INNER JOIN "WorkItemFieldDefinition" AS field
    ON field."workItemTypeId" = type_def."id"
   AND field."key" = 'reproduction_steps'
LEFT JOIN "WorkItemFieldValue" AS existing
    ON existing."issueId" = issue."id"
   AND existing."fieldDefinitionId" = field."id"
WHERE issue."reproductionSteps" IS NOT NULL
  AND issue."reproductionSteps" <> ''
  AND existing."issueId" IS NULL;

ALTER TABLE "Issue"
    DROP COLUMN "acceptanceCriteria",
    DROP COLUMN "reproductionSteps";
