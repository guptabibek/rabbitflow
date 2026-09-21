import path from 'node:path'
import { mkdir, stat } from 'node:fs/promises'

/**
 * Where uploaded files live on disk.
 *
 * Deliberately **outside** `public/`. Files under `public/` are served directly
 * by the static handler, which means every stored file was readable by any
 * authenticated user who learned its URL — a project A member could fetch a
 * project B attachment. Serving through a route handler lets us check that the
 * caller may read the parent work item first.
 *
 * `UPLOAD_DIR` should point at a mounted volume in production so files survive
 * a container rebuild.
 */

const DEFAULT_UPLOAD_DIR = path.join(process.cwd(), 'var', 'uploads')

export function getUploadRoot(): string {
  const configured = process.env.UPLOAD_DIR?.trim()
  return configured ? path.resolve(configured) : DEFAULT_UPLOAD_DIR
}

export type UploadBucket = 'attachments' | 'avatars'

export function getBucketDir(bucket: UploadBucket): string {
  return path.join(getUploadRoot(), bucket)
}

export async function ensureBucketDir(bucket: UploadBucket): Promise<string> {
  const dir = getBucketDir(bucket)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Resolve a stored filename to an absolute path, refusing anything that escapes
 * its bucket.
 *
 * Filenames are server-generated (see `file-upload.ts`), so traversal should be
 * impossible by construction — this is the second line of defence, and it also
 * protects the legacy rows written before filenames were generated server-side.
 */
export function resolveStoredFilePath(bucket: UploadBucket, storedName: string): string | null {
  // A stored name must be a bare filename. Reject anything with a separator or
  // a parent-directory segment before touching the filesystem.
  if (!storedName || storedName.includes('/') || storedName.includes('\\')) return null
  if (storedName === '.' || storedName === '..') return null

  const bucketDir = getBucketDir(bucket)
  const resolved = path.resolve(bucketDir, storedName)

  // Confirm the resolved path really sits inside the bucket.
  const relative = path.relative(bucketDir, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  return resolved
}

/**
 * Extract the stored filename from a persisted `filePath` value.
 *
 * Historic rows hold a web path such as `/uploads/attachments/<name>`; newer
 * rows hold the bare name. Both resolve to the same file on disk.
 */
export function storedNameFromFilePath(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

/**
 * Avatars use a deterministic filename per user: `<userId><ext>`.
 *
 * Two reasons. First, the serving route can locate the file from the user id
 * alone, so no client-supplied filename is ever used to read from disk. Second,
 * a new upload overwrites the previous one instead of accumulating — avatars
 * were previously written with a timestamped name and the old files were never
 * removed, leaking disk on every change.
 */
export const AVATAR_EXTENSIONS = ['.png', '.jpg', '.gif', '.webp'] as const

export function avatarFileName(userId: string, extension: string): string {
  return `${userId}${extension}`
}

/** Locate a user's stored avatar, whichever format it was saved in. */
export async function findAvatarFile(userId: string): Promise<string | null> {
  for (const extension of AVATAR_EXTENSIONS) {
    const candidate = resolveStoredFilePath('avatars', avatarFileName(userId, extension))
    if (candidate && (await fileExists(candidate))) return candidate
  }

  // Fall back to the legacy `<userId>-<timestamp>[-<uuid>].<ext>` naming so
  // avatars uploaded before the move keep working without a file-rename step.
  // The prefix is compared against the requested user id, so this cannot reach
  // another user's file.
  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(getBucketDir('avatars'))

    const legacy = entries
      .filter((entry) => entry.startsWith(`${userId}-`))
      .filter((entry) => AVATAR_EXTENSIONS.some((ext) => entry.toLowerCase().endsWith(ext)))
      // Newest first: the timestamp is the second segment.
      .sort()
      .reverse()[0]

    if (!legacy) return null

    const resolved = resolveStoredFilePath('avatars', legacy)
    return resolved && (await fileExists(resolved)) ? resolved : null
  } catch {
    // No avatars directory yet.
    return null
  }
}

/**
 * Remove any previously stored avatar for this user, in any format — including
 * legacy timestamped files, which otherwise accumulate on every change.
 */
export async function removeExistingAvatars(userId: string): Promise<void> {
  const { readdir, unlink } = await import('node:fs/promises')

  let entries: string[] = []
  try {
    entries = await readdir(getBucketDir('avatars'))
  } catch {
    return
  }

  const owned = entries.filter(
    (entry) => entry === userId || entry.startsWith(`${userId}.`) || entry.startsWith(`${userId}-`)
  )

  await Promise.all(
    owned.map(async (entry) => {
      const candidate = resolveStoredFilePath('avatars', entry)
      if (!candidate) return
      await unlink(candidate).catch(() => {
        // Already gone is fine.
      })
    })
  )
}

export async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const stats = await stat(absolutePath)
    return stats.isFile()
  } catch {
    return false
  }
}
