ALTER TABLE "ProjectMember"
ADD COLUMN "extraPermissions" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "ApprovalRequest"
ADD COLUMN "approverUserIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "reason" TEXT;