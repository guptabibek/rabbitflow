CREATE INDEX IF NOT EXISTS "Issue_projectId_status_columnOrder_idx"
  ON "Issue"("projectId", "status", "columnOrder");

CREATE INDEX IF NOT EXISTS "Issue_projectId_status_parentIssueId_columnOrder_idx"
  ON "Issue"("projectId", "status", "parentIssueId", "columnOrder");

CREATE INDEX IF NOT EXISTS "IssueRelation_sourceIssueId_id_idx"
  ON "IssueRelation"("sourceIssueId", "id");

CREATE INDEX IF NOT EXISTS "IssueRelation_targetIssueId_id_idx"
  ON "IssueRelation"("targetIssueId", "id");

CREATE INDEX IF NOT EXISTS "Comment_issueId_id_idx"
  ON "Comment"("issueId", "id");

CREATE INDEX IF NOT EXISTS "Activity_issueId_id_idx"
  ON "Activity"("issueId", "id");
