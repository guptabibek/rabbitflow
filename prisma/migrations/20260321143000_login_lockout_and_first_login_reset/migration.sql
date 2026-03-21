-- Add security controls for first-login password reset and temporary account lockouts.
ALTER TABLE "User"
ADD COLUMN "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lockoutUntil" TIMESTAMP(3);
