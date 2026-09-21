-- Stop user deletion from destroying business history.
--
-- Issue.reporterId, Attachment.uploadedBy and Comment.authorId all cascaded from
-- User. Deleting one user therefore deleted every work item they had ever
-- reported — and with it those items' comments, attachments, activity, relations,
-- custom field values and SLA timers. Offboarding a single employee could erase
-- years of project history with no confirmation and no audit trail.
--
-- These become RESTRICT so an accidental delete fails loudly instead of silently
-- destroying data. Users are deactivated (User.isActive = false), never deleted;
-- the admin security API already implements that flow.

BEGIN;

ALTER TABLE "Issue" DROP CONSTRAINT IF EXISTS "Issue_reporterId_fkey";
ALTER TABLE "Issue"
  ADD CONSTRAINT "Issue_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "Attachment_uploadedBy_fkey";
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_uploadedBy_fkey"
  FOREIGN KEY ("uploadedBy") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Comment" DROP CONSTRAINT IF EXISTS "Comment_authorId_fkey";
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
