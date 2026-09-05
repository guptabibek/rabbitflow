-- Move stored upload references off the public web root.
--
-- Files were written to public/uploads/** and served by the static handler, so
-- any authenticated user who learned a URL could read any project's attachment.
-- Files now live outside public/ and are served by route handlers that check
-- the caller may read the parent work item.
--
-- Only the stored references change here. Moving the files themselves is a
-- deployment step:
--     mkdir -p var/uploads
--     mv public/uploads/attachments var/uploads/attachments
--     mv public/uploads/avatars     var/uploads/avatars
-- (or set UPLOAD_DIR to wherever the volume is mounted).

BEGIN;

-- Attachment.filePath: keep only the bare filename. The serving route resolves
-- it inside the attachments bucket and refuses anything that escapes.
UPDATE "Attachment"
SET "filePath" = regexp_replace("filePath", '^.*/', '')
WHERE "filePath" LIKE '%/%';

-- User.avatar: point at the authorising route. Avatars are stored under a
-- deterministic per-user name, so the route needs only the user id — and a new
-- upload now replaces the old file instead of leaking it.
--
-- The version parameter is seeded from updatedAt so existing images cache-bust
-- once and then stay cached.
UPDATE "User"
SET "avatar" = '/api/users/' || "id" || '/avatar/image?v=' ||
               EXTRACT(EPOCH FROM "updatedAt")::bigint::text
WHERE "avatar" IS NOT NULL
  AND "avatar" NOT LIKE '/api/%';

COMMIT;
