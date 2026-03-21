-- AlterTable
ALTER TABLE "Issue"
  ADD COLUMN "estimatedHours" DOUBLE PRECISION,
  ADD COLUMN "remainingHours" DOUBLE PRECISION,
  ADD COLUMN "completedHours" DOUBLE PRECISION;
