-- Add persistent fields for authenticator-based MFA.
ALTER TABLE "User"
ADD COLUMN "mfaSecret" TEXT,
ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mfaEnabledAt" TIMESTAMP(3);
