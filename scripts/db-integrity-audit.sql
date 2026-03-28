-- Database integrity audit
-- Run this before and after applying the integrity-hardening migration.

-- Orphaned references
SELECT 'Notification.issueId' AS check_name, count(*) AS broken_rows
FROM "Notification" n
LEFT JOIN "Issue" i ON i."id" = n."issueId"
WHERE n."issueId" IS NOT NULL AND i."id" IS NULL;

SELECT 'OnboardingAnalytics.userId' AS check_name, count(*) AS broken_rows
FROM "OnboardingAnalytics" oa
LEFT JOIN "User" u ON u."id" = oa."userId"
WHERE u."id" IS NULL;

SELECT 'AutomationLog.projectId' AS check_name, count(*) AS broken_rows
FROM "AutomationLog" al
LEFT JOIN "Project" p ON p."id" = al."projectId"
WHERE p."id" IS NULL;

SELECT 'AutomationLog.triggeredBy' AS check_name, count(*) AS broken_rows
FROM "AutomationLog" al
LEFT JOIN "User" u ON u."id" = al."triggeredBy"
WHERE al."triggeredBy" IS NOT NULL AND u."id" IS NULL;

SELECT 'AutomationLog.issueId' AS check_name, count(*) AS broken_rows
FROM "AutomationLog" al
LEFT JOIN "Issue" i ON i."id" = al."issueId"
WHERE al."issueId" IS NOT NULL AND i."id" IS NULL;

SELECT 'DocumentRevision.editorId' AS check_name, count(*) AS broken_rows
FROM "DocumentRevision" dr
LEFT JOIN "User" u ON u."id" = dr."editorId"
WHERE dr."editorId" IS NOT NULL AND u."id" IS NULL;

SELECT 'RecurringTask.templateIterationId' AS check_name, count(*) AS broken_rows
FROM "RecurringTask" rt
LEFT JOIN "Iteration" i ON i."id" = rt."templateIterationId"
WHERE rt."templateIterationId" IS NOT NULL AND i."id" IS NULL;

SELECT 'RecurringTask.templateAreaId' AS check_name, count(*) AS broken_rows
FROM "RecurringTask" rt
LEFT JOIN "Area" a ON a."id" = rt."templateAreaId"
WHERE rt."templateAreaId" IS NOT NULL AND a."id" IS NULL;

SELECT 'KeyResult.issueId' AS check_name, count(*) AS broken_rows
FROM "KeyResult" kr
LEFT JOIN "Issue" i ON i."id" = kr."issueId"
WHERE kr."issueId" IS NOT NULL AND i."id" IS NULL;

SELECT 'RetroItem.actionItemIssueId' AS check_name, count(*) AS broken_rows
FROM "RetroItem" ri
LEFT JOIN "Issue" i ON i."id" = ri."actionItemIssueId"
WHERE ri."actionItemIssueId" IS NOT NULL AND i."id" IS NULL;

SELECT 'ApprovalRequest.fromStateId' AS check_name, count(*) AS broken_rows
FROM "ApprovalRequest" ar
LEFT JOIN "State" s ON s."id" = ar."fromStateId"
WHERE ar."fromStateId" IS NOT NULL AND s."id" IS NULL;

SELECT 'ApprovalRequest.toStateId' AS check_name, count(*) AS broken_rows
FROM "ApprovalRequest" ar
LEFT JOIN "State" s ON s."id" = ar."toStateId"
WHERE ar."toStateId" IS NOT NULL AND s."id" IS NULL;

SELECT 'TestPlan.createdById' AS check_name, count(*) AS broken_rows
FROM "TestPlan" tp
LEFT JOIN "User" u ON u."id" = tp."createdById"
WHERE tp."createdById" IS NOT NULL AND u."id" IS NULL;

SELECT 'TestCase.linkedIssueId' AS check_name, count(*) AS broken_rows
FROM "TestCase" tc
LEFT JOIN "Issue" i ON i."id" = tc."linkedIssueId"
WHERE tc."linkedIssueId" IS NOT NULL AND i."id" IS NULL;

SELECT 'TestRun.testPlanId' AS check_name, count(*) AS broken_rows
FROM "TestRun" tr
LEFT JOIN "TestPlan" tp ON tp."id" = tr."testPlanId"
WHERE tr."testPlanId" IS NOT NULL AND tp."id" IS NULL;

-- Cross-project mismatches
SELECT 'Notification issue/project mismatch' AS check_name, count(*) AS broken_rows
FROM "Notification" n
JOIN "Issue" i ON i."id" = n."issueId"
WHERE n."projectId" IS DISTINCT FROM i."projectId";

SELECT 'AutomationLog rule/project mismatch' AS check_name, count(*) AS broken_rows
FROM "AutomationLog" al
JOIN "AutomationRule" ar ON ar."id" = al."ruleId"
WHERE al."projectId" IS DISTINCT FROM ar."projectId";

SELECT 'RecurringTask iteration/project mismatch' AS check_name, count(*) AS broken_rows
FROM "RecurringTask" rt
JOIN "Iteration" i ON i."id" = rt."templateIterationId"
WHERE i."projectId" <> rt."projectId";

SELECT 'RecurringTask area/project mismatch' AS check_name, count(*) AS broken_rows
FROM "RecurringTask" rt
JOIN "Area" a ON a."id" = rt."templateAreaId"
WHERE a."projectId" <> rt."projectId";

SELECT 'KeyResult issue/objective project mismatch' AS check_name, count(*) AS broken_rows
FROM "KeyResult" kr
JOIN "Objective" o ON o."id" = kr."objectiveId"
JOIN "Issue" i ON i."id" = kr."issueId"
WHERE kr."issueId" IS NOT NULL AND i."projectId" <> o."projectId";

SELECT 'RetroItem issue/retro project mismatch' AS check_name, count(*) AS broken_rows
FROM "RetroItem" ri
JOIN "Retrospective" r ON r."id" = ri."retrospectiveId"
JOIN "Issue" i ON i."id" = ri."actionItemIssueId"
WHERE ri."actionItemIssueId" IS NOT NULL AND i."projectId" <> r."projectId";

SELECT 'ApprovalRequest state/project mismatch' AS check_name, count(*) AS broken_rows
FROM "ApprovalRequest" ar
JOIN "Issue" i ON i."id" = ar."issueId"
JOIN "State" s ON s."id" = ar."fromStateId"
WHERE ar."fromStateId" IS NOT NULL AND s."projectId" <> i."projectId"
UNION ALL
SELECT 'ApprovalRequest state/project mismatch' AS check_name, count(*) AS broken_rows
FROM "ApprovalRequest" ar
JOIN "Issue" i ON i."id" = ar."issueId"
JOIN "State" s ON s."id" = ar."toStateId"
WHERE ar."toStateId" IS NOT NULL AND s."projectId" <> i."projectId";

SELECT 'TestCase linked issue/project mismatch' AS check_name, count(*) AS broken_rows
FROM "TestCase" tc
JOIN "Issue" i ON i."id" = tc."linkedIssueId"
WHERE tc."linkedIssueId" IS NOT NULL AND i."projectId" <> tc."projectId";

-- Duplicate records or duplicate semantics
SELECT lower("customDomain") AS custom_domain, count(*) AS duplicate_count
FROM "ProjectBranding"
WHERE "customDomain" IS NOT NULL
GROUP BY lower("customDomain")
HAVING count(*) > 1;

SELECT
  LEAST("sourceIssueId", "targetIssueId") AS issue_a,
  GREATEST("sourceIssueId", "targetIssueId") AS issue_b,
  CASE
    WHEN "relationType" IN ('blocks', 'blocked_by') THEN 'blocks'
    WHEN "relationType" IN ('tests', 'tested_by') THEN 'tests'
    ELSE "relationType"
  END AS canonical_relation,
  count(*) AS duplicate_count
FROM "IssueRelation"
GROUP BY 1, 2, 3
HAVING count(*) > 1;

-- Invalid states
SELECT 'Notification read/archive mismatch' AS check_name, count(*) AS broken_rows
FROM "Notification"
WHERE ("isRead" = false AND "readAt" IS NOT NULL)
   OR ("isRead" = true AND "readAt" IS NULL)
   OR ("isArchived" = false AND "archivedAt" IS NOT NULL)
   OR ("isArchived" = true AND "archivedAt" IS NULL);

SELECT 'User active/deactivated mismatch' AS check_name, count(*) AS broken_rows
FROM "User"
WHERE ("isActive" = true AND "deactivatedAt" IS NOT NULL)
   OR ("isActive" = false AND "deactivatedAt" IS NULL);

SELECT 'Issue self-link rows' AS check_name, count(*) AS broken_rows
FROM "IssueRelation"
WHERE "sourceIssueId" = "targetIssueId";

SELECT 'ApprovalRequest requiredApprovals < 1' AS check_name, count(*) AS broken_rows
FROM "ApprovalRequest"
WHERE "requiredApprovals" < 1;

SELECT 'StateTransition minApprovals < 1' AS check_name, count(*) AS broken_rows
FROM "StateTransition"
WHERE "minApprovals" < 1;

SELECT 'ImportJob counter mismatch' AS check_name, count(*) AS broken_rows
FROM "ImportJob"
WHERE "totalRows" < 0
   OR "processedRows" < 0
   OR "successRows" < 0
   OR "failedRows" < 0
   OR "successRows" + "failedRows" > "processedRows"
   OR "processedRows" > "totalRows";
