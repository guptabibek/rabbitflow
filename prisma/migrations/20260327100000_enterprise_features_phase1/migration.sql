-- ============================================================================
-- ENTERPRISE FEATURES PHASE 1 MIGRATION
-- Adds: Notifications, Search, Saved Views, Webhooks, Bulk Import, 
--        Automation Rules, Documents/Wiki, API Tokens, Activity Feed,
--        Recurring Tasks, Approval Workflows, OKR/Goals, Retrospectives,
--        Test Cases, SLA Tracking
-- ============================================================================

-- 1. IN-APP NOTIFICATIONS
-- -------------------------------------------------------------------
CREATE TABLE "Notification" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId"       TEXT NOT NULL,
    "projectId"    TEXT,
    "issueId"      TEXT,
    "actorId"      TEXT,
    "type"         TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "body"         TEXT,
    "entityType"   TEXT,
    "entityId"     TEXT,
    "actionUrl"    TEXT,
    "metadata"     JSONB,
    "isRead"       BOOLEAN NOT NULL DEFAULT false,
    "readAt"       TIMESTAMP(3),
    "isArchived"   BOOLEAN NOT NULL DEFAULT false,
    "archivedAt"   TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt" DESC);
CREATE INDEX "Notification_userId_isArchived_createdAt_idx" ON "Notification"("userId", "isArchived", "createdAt" DESC);
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Notification preferences
CREATE TABLE "NotificationPreference" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId"       TEXT NOT NULL,
    "channel"      TEXT NOT NULL DEFAULT 'in_app',
    "category"     TEXT NOT NULL,
    "enabled"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_userId_channel_category_key" ON "NotificationPreference"("userId", "channel", "category");

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 2. FULL-TEXT SEARCH INDEX
-- -------------------------------------------------------------------
ALTER TABLE "Issue" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

CREATE INDEX "Issue_searchVector_idx" ON "Issue" USING GIN ("searchVector");

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_issue_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."key", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "issue_search_vector_update"
  BEFORE INSERT OR UPDATE OF "key", "title", "description"
  ON "Issue"
  FOR EACH ROW
  EXECUTE FUNCTION update_issue_search_vector();

-- Backfill existing rows
UPDATE "Issue" SET "searchVector" =
  setweight(to_tsvector('english', coalesce("key", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B');

-- Comment search
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;
CREATE INDEX "Comment_searchVector_idx" ON "Comment" USING GIN ("searchVector");

CREATE OR REPLACE FUNCTION update_comment_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    to_tsvector('english', coalesce(NEW."content", ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "comment_search_vector_update"
  BEFORE INSERT OR UPDATE OF "content"
  ON "Comment"
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_search_vector();

UPDATE "Comment" SET "searchVector" =
  to_tsvector('english', coalesce("content", ''));


-- 3. SAVED VIEWS / CUSTOM FILTERS
-- -------------------------------------------------------------------
CREATE TABLE "SavedView" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "viewType"     TEXT NOT NULL DEFAULT 'list',
    "filters"      JSONB NOT NULL DEFAULT '{}',
    "columns"      JSONB,
    "sorting"      JSONB,
    "groupBy"      TEXT,
    "isDefault"    BOOLEAN NOT NULL DEFAULT false,
    "isShared"     BOOLEAN NOT NULL DEFAULT false,
    "color"        TEXT,
    "icon"         TEXT,
    "order"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SavedView_projectId_userId_idx" ON "SavedView"("projectId", "userId");
CREATE INDEX "SavedView_projectId_isShared_idx" ON "SavedView"("projectId", "isShared");

ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 4. WEBHOOKS
-- -------------------------------------------------------------------
CREATE TABLE "Webhook" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "url"          TEXT NOT NULL,
    "secret"       TEXT,
    "events"       JSONB NOT NULL DEFAULT '[]',
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "headers"      JSONB,
    "createdById"  TEXT,
    "lastTriggeredAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Webhook_projectId_isActive_idx" ON "Webhook"("projectId", "isActive");

ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "webhookId"    TEXT NOT NULL,
    "event"        TEXT NOT NULL,
    "payload"      JSONB NOT NULL,
    "statusCode"   INTEGER,
    "responseBody" TEXT,
    "duration"     INTEGER,
    "success"      BOOLEAN NOT NULL DEFAULT false,
    "attempt"      INTEGER NOT NULL DEFAULT 1,
    "error"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt" DESC);

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 5. IMPORT JOBS
-- -------------------------------------------------------------------
CREATE TABLE "ImportJob" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"     TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "fileName"      TEXT NOT NULL,
    "fileSize"      INTEGER NOT NULL DEFAULT 0,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "totalRows"     INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "successRows"   INTEGER NOT NULL DEFAULT 0,
    "failedRows"    INTEGER NOT NULL DEFAULT 0,
    "fieldMapping"  JSONB NOT NULL DEFAULT '{}',
    "errors"        JSONB,
    "config"        JSONB,
    "startedAt"     TIMESTAMP(3),
    "completedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_projectId_status_idx" ON "ImportJob"("projectId", "status");
CREATE INDEX "ImportJob_userId_idx" ON "ImportJob"("userId");

ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 6. AUTOMATION RULES
-- -------------------------------------------------------------------
CREATE TABLE "AutomationRule" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "description"  TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "trigger"      JSONB NOT NULL,
    "conditions"   JSONB NOT NULL DEFAULT '[]',
    "actions"      JSONB NOT NULL DEFAULT '[]',
    "runCount"     INTEGER NOT NULL DEFAULT 0,
    "lastRunAt"    TIMESTAMP(3),
    "lastError"    TEXT,
    "createdById"  TEXT,
    "order"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRule_projectId_isActive_idx" ON "AutomationRule"("projectId", "isActive");

ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AutomationLog" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "ruleId"       TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "triggeredBy"  TEXT,
    "issueId"      TEXT,
    "status"       TEXT NOT NULL DEFAULT 'success',
    "actionsRun"   JSONB,
    "error"        TEXT,
    "duration"     INTEGER,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationLog_ruleId_createdAt_idx" ON "AutomationLog"("ruleId", "createdAt" DESC);
CREATE INDEX "AutomationLog_projectId_createdAt_idx" ON "AutomationLog"("projectId", "createdAt" DESC);

ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 7. DOCUMENTS / WIKI
-- -------------------------------------------------------------------
CREATE TABLE "Document" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "parentId"     TEXT,
    "title"        TEXT NOT NULL,
    "content"      TEXT NOT NULL DEFAULT '',
    "contentFormat" TEXT NOT NULL DEFAULT 'markdown',
    "slug"         TEXT,
    "icon"         TEXT,
    "coverImage"   TEXT,
    "isPublished"  BOOLEAN NOT NULL DEFAULT false,
    "sortOrder"    INTEGER NOT NULL DEFAULT 0,
    "createdById"  TEXT,
    "lastEditedById" TEXT,
    "searchVector" tsvector,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Document_projectId_parentId_idx" ON "Document"("projectId", "parentId");
CREATE INDEX "Document_projectId_slug_idx" ON "Document"("projectId", "slug");
CREATE INDEX "Document_searchVector_idx" ON "Document" USING GIN ("searchVector");

ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION update_document_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."content", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER "document_search_vector_update"
  BEFORE INSERT OR UPDATE OF "title", "content"
  ON "Document"
  FOR EACH ROW
  EXECUTE FUNCTION update_document_search_vector();

CREATE TABLE "DocumentRevision" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "documentId"   TEXT NOT NULL,
    "editorId"     TEXT,
    "title"        TEXT NOT NULL,
    "content"      TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentRevision_documentId_createdAt_idx" ON "DocumentRevision"("documentId", "createdAt" DESC);

ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 8. API TOKENS
-- -------------------------------------------------------------------
CREATE TABLE "ApiToken" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId"       TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "tokenHash"    TEXT NOT NULL,
    "tokenPrefix"  TEXT NOT NULL,
    "scopes"       JSONB NOT NULL DEFAULT '["read"]',
    "expiresAt"    TIMESTAMP(3),
    "lastUsedAt"   TIMESTAMP(3),
    "isRevoked"    BOOLEAN NOT NULL DEFAULT false,
    "revokedAt"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");
CREATE INDEX "ApiToken_tokenHash_idx" ON "ApiToken"("tokenHash");

ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 9. RECURRING TASKS
-- -------------------------------------------------------------------
CREATE TABLE "RecurringTask" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"      TEXT NOT NULL,
    "templateTitle"  TEXT NOT NULL,
    "templateBody"   TEXT,
    "templateType"   TEXT NOT NULL DEFAULT 'task',
    "templatePriority" TEXT NOT NULL DEFAULT 'medium',
    "templateAssigneeId" TEXT,
    "templateIterationId" TEXT,
    "templateAreaId" TEXT,
    "templateLabels" JSONB DEFAULT '[]',
    "rrule"          TEXT NOT NULL,
    "timezone"       TEXT NOT NULL DEFAULT 'UTC',
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt"      TIMESTAMP(3),
    "lastRunAt"      TIMESTAMP(3),
    "runCount"       INTEGER NOT NULL DEFAULT 0,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecurringTask_projectId_isActive_idx" ON "RecurringTask"("projectId", "isActive");
CREATE INDEX "RecurringTask_nextRunAt_isActive_idx" ON "RecurringTask"("nextRunAt", "isActive");

ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecurringTask" ADD CONSTRAINT "RecurringTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 10. OKR / GOALS
-- -------------------------------------------------------------------
CREATE TABLE "Objective" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "parentId"     TEXT,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'on_track',
    "progress"     FLOAT NOT NULL DEFAULT 0,
    "startDate"    TIMESTAMP(3),
    "endDate"      TIMESTAMP(3),
    "ownerId"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Objective_projectId_idx" ON "Objective"("projectId");

ALTER TABLE "Objective" ADD CONSTRAINT "Objective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Objective"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "KeyResult" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "objectiveId"  TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "metricType"   TEXT NOT NULL DEFAULT 'percentage',
    "startValue"   FLOAT NOT NULL DEFAULT 0,
    "targetValue"  FLOAT NOT NULL DEFAULT 100,
    "currentValue" FLOAT NOT NULL DEFAULT 0,
    "unit"         TEXT,
    "ownerId"      TEXT,
    "issueId"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KeyResult_objectiveId_idx" ON "KeyResult"("objectiveId");

ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KeyResult" ADD CONSTRAINT "KeyResult_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- 11. RETROSPECTIVES
-- -------------------------------------------------------------------
CREATE TABLE "Retrospective" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "iterationId"  TEXT,
    "title"        TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'open',
    "facilitatorId" TEXT,
    "summary"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retrospective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Retrospective_projectId_idx" ON "Retrospective"("projectId");
CREATE INDEX "Retrospective_iterationId_idx" ON "Retrospective"("iterationId");

ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_iterationId_fkey" FOREIGN KEY ("iterationId") REFERENCES "Iteration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RetroItem" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
    "retrospectiveId" TEXT NOT NULL,
    "category"        TEXT NOT NULL,
    "content"         TEXT NOT NULL,
    "authorId"        TEXT,
    "votes"           INTEGER NOT NULL DEFAULT 0,
    "actionItemIssueId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetroItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RetroItem_retrospectiveId_idx" ON "RetroItem"("retrospectiveId");

ALTER TABLE "RetroItem" ADD CONSTRAINT "RetroItem_retrospectiveId_fkey" FOREIGN KEY ("retrospectiveId") REFERENCES "Retrospective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetroItem" ADD CONSTRAINT "RetroItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RetroVote" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "retroItemId"  TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetroVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetroVote_retroItemId_userId_key" ON "RetroVote"("retroItemId", "userId");

ALTER TABLE "RetroVote" ADD CONSTRAINT "RetroVote_retroItemId_fkey" FOREIGN KEY ("retroItemId") REFERENCES "RetroItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetroVote" ADD CONSTRAINT "RetroVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 12. APPROVAL WORKFLOWS
-- -------------------------------------------------------------------
ALTER TABLE "StateTransition" ADD COLUMN IF NOT EXISTS "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StateTransition" ADD COLUMN IF NOT EXISTS "approverRoles" JSONB;
ALTER TABLE "StateTransition" ADD COLUMN IF NOT EXISTS "minApprovals" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "ApprovalRequest" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid(),
    "issueId"       TEXT NOT NULL,
    "transitionId"  TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "fromStateId"   TEXT NOT NULL,
    "toStateId"     TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"    TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalRequest_issueId_status_idx" ON "ApprovalRequest"("issueId", "status");

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_transitionId_fkey" FOREIGN KEY ("transitionId") REFERENCES "StateTransition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ApprovalDecision" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "requestId"    TEXT NOT NULL,
    "approverId"   TEXT NOT NULL,
    "decision"     TEXT NOT NULL,
    "comment"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalDecision_requestId_idx" ON "ApprovalDecision"("requestId");
CREATE UNIQUE INDEX "ApprovalDecision_requestId_approverId_key" ON "ApprovalDecision"("requestId", "approverId");

ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 13. SLA TRACKING
-- -------------------------------------------------------------------
CREATE TABLE "SlaPolicy" (
    "id"                TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"         TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "description"       TEXT,
    "priorityFilter"    JSONB,
    "typeFilter"        JSONB,
    "responseTimeMinutes" INTEGER NOT NULL DEFAULT 60,
    "resolutionTimeMinutes" INTEGER NOT NULL DEFAULT 480,
    "businessHoursOnly" BOOLEAN NOT NULL DEFAULT true,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SlaPolicy_projectId_isActive_idx" ON "SlaPolicy"("projectId", "isActive");

ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SlaTimer" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid(),
    "issueId"         TEXT NOT NULL,
    "policyId"        TEXT NOT NULL,
    "timerType"       TEXT NOT NULL,
    "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt"        TIMESTAMP(3),
    "completedAt"     TIMESTAMP(3),
    "breachedAt"      TIMESTAMP(3),
    "targetAt"        TIMESTAMP(3) NOT NULL,
    "elapsedMinutes"  INTEGER NOT NULL DEFAULT 0,
    "status"          TEXT NOT NULL DEFAULT 'running',

    CONSTRAINT "SlaTimer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SlaTimer_issueId_idx" ON "SlaTimer"("issueId");
CREATE INDEX "SlaTimer_status_targetAt_idx" ON "SlaTimer"("status", "targetAt");

ALTER TABLE "SlaTimer" ADD CONSTRAINT "SlaTimer_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlaTimer" ADD CONSTRAINT "SlaTimer_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SlaPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 14. TEST CASE MANAGEMENT
-- -------------------------------------------------------------------
CREATE TABLE "TestPlan" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "status"       TEXT NOT NULL DEFAULT 'draft',
    "iterationId"  TEXT,
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestPlan_projectId_idx" ON "TestPlan"("projectId");

ALTER TABLE "TestPlan" ADD CONSTRAINT "TestPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TestCase" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "projectId"    TEXT NOT NULL,
    "testPlanId"   TEXT,
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "preconditions" TEXT,
    "steps"        JSONB NOT NULL DEFAULT '[]',
    "expectedResult" TEXT,
    "priority"     TEXT NOT NULL DEFAULT 'medium',
    "linkedIssueId" TEXT,
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestCase_projectId_idx" ON "TestCase"("projectId");
CREATE INDEX "TestCase_testPlanId_idx" ON "TestCase"("testPlanId");

ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_testPlanId_fkey" FOREIGN KEY ("testPlanId") REFERENCES "TestPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TestRun" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "testCaseId"   TEXT NOT NULL,
    "testPlanId"   TEXT,
    "executedById" TEXT,
    "status"       TEXT NOT NULL DEFAULT 'not_run',
    "result"       TEXT,
    "notes"        TEXT,
    "duration"     INTEGER,
    "environment"  TEXT,
    "linkedIssueId" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestRun_testCaseId_idx" ON "TestRun"("testCaseId");
CREATE INDEX "TestRun_testPlanId_idx" ON "TestRun"("testPlanId");

ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 15. USER FAVORITES / BOOKMARKS
-- -------------------------------------------------------------------
CREATE TABLE "Favorite" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId"       TEXT NOT NULL,
    "entityType"   TEXT NOT NULL,
    "entityId"     TEXT NOT NULL,
    "order"        INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Favorite_userId_entityType_entityId_key" ON "Favorite"("userId", "entityType", "entityId");
CREATE INDEX "Favorite_userId_order_idx" ON "Favorite"("userId", "order");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 16. GIT INTEGRATION LINKS
-- -------------------------------------------------------------------
CREATE TABLE "GitLink" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid(),
    "issueId"      TEXT NOT NULL,
    "provider"     TEXT NOT NULL,
    "linkType"     TEXT NOT NULL,
    "externalId"   TEXT,
    "externalUrl"  TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "author"       TEXT,
    "branch"       TEXT,
    "status"       TEXT,
    "metadata"     JSONB,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GitLink_issueId_idx" ON "GitLink"("issueId");
CREATE INDEX "GitLink_externalId_provider_idx" ON "GitLink"("externalId", "provider");

ALTER TABLE "GitLink" ADD CONSTRAINT "GitLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
