-- Work item core lookup performance
CREATE INDEX IF NOT EXISTS "Issue_areaId_idx" ON "Issue"("areaId");
CREATE INDEX IF NOT EXISTS "Issue_stateId_idx" ON "Issue"("stateId");
CREATE INDEX IF NOT EXISTS "Issue_projectId_assigneeId_idx" ON "Issue"("projectId", "assigneeId");
CREATE INDEX IF NOT EXISTS "Issue_projectId_iterationId_idx" ON "Issue"("projectId", "iterationId");
CREATE INDEX IF NOT EXISTS "Issue_projectId_areaId_idx" ON "Issue"("projectId", "areaId");
CREATE INDEX IF NOT EXISTS "Issue_projectId_stateId_idx" ON "Issue"("projectId", "stateId");
CREATE INDEX IF NOT EXISTS "Issue_projectId_parentIssueId_columnOrder_idx" ON "Issue"("projectId", "parentIssueId", "columnOrder");
CREATE INDEX IF NOT EXISTS "Issue_projectId_workItemType_status_idx" ON "Issue"("projectId", "workItemType", "status");
CREATE INDEX IF NOT EXISTS "Issue_projectId_updatedAt_idx" ON "Issue"("projectId", "updatedAt");

-- Custom field value access
CREATE INDEX IF NOT EXISTS "WorkItemFieldValue_issueId_updatedAt_idx" ON "WorkItemFieldValue"("issueId", "updatedAt");

-- Link graph queries
CREATE INDEX IF NOT EXISTS "IssueRelation_sourceIssueId_relationType_idx" ON "IssueRelation"("sourceIssueId", "relationType");
CREATE INDEX IF NOT EXISTS "IssueRelation_targetIssueId_relationType_idx" ON "IssueRelation"("targetIssueId", "relationType");
CREATE INDEX IF NOT EXISTS "IssueRelation_relationType_createdAt_idx" ON "IssueRelation"("relationType", "createdAt");

-- Discussion timeline queries
CREATE INDEX IF NOT EXISTS "Comment_issueId_createdAt_idx" ON "Comment"("issueId", "createdAt");

-- Sprint/team capacity lookups
CREATE INDEX IF NOT EXISTS "SprintCapacity_userId_idx" ON "SprintCapacity"("userId");
