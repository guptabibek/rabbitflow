-- AlterTable: Make transition fields optional and add requiredApprovals
ALTER TABLE "ApprovalRequest" ALTER COLUMN "transitionId" DROP NOT NULL;
ALTER TABLE "ApprovalRequest" ALTER COLUMN "fromStateId" DROP NOT NULL;
ALTER TABLE "ApprovalRequest" ALTER COLUMN "toStateId" DROP NOT NULL;
ALTER TABLE "ApprovalRequest" ADD COLUMN "requiredApprovals" INTEGER NOT NULL DEFAULT 1;
