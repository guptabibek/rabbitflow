-- Move short-lived authentication challenges (MFA enrolment/verification and
-- password-reset OTPs) out of Redis and into PostgreSQL.
--
-- Rationale: these were stored via cacheSet/cacheGet, which silently discard
-- writes when Redis is unavailable. The effect was that a Redis outage issued
-- challenge tokens that could never be verified, locking every non-admin user
-- out of the product with no recovery path. Authentication state must be durable.

BEGIN;

CREATE TABLE IF NOT EXISTS "AuthChallenge" (
    "id"         TEXT NOT NULL,
    "token"      TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "secret"     TEXT,
    "codeHash"   TEXT,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  CREATE UNIQUE INDEX "AuthChallenge_token_key" ON "AuthChallenge"("token");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE INDEX "AuthChallenge_userId_kind_consumedAt_idx"
    ON "AuthChallenge"("userId", "kind", "consumedAt");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- Supports the periodic purge of expired rows.
DO $$
BEGIN
  CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AuthChallenge"
    ADD CONSTRAINT "AuthChallenge_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
