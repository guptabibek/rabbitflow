import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { findAvatarFile } from '@/lib/domain/upload-storage'

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

/**
 * Serve a user's avatar.
 *
 * Avatars are far less sensitive than attachments — every member of a shared
 * project already sees the image in the UI — so this requires only a valid
 * session rather than project membership. It exists so avatars can live outside
 * `public/`, alongside attachments, rather than in the statically served root.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const { userId } = await params

    // Located from the user id alone. No client-supplied filename ever reaches
    // the filesystem on this path.
    const absolutePath = await findAvatarFile(userId)

    if (!absolutePath) {
      return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
    }

    const extension = absolutePath.slice(absolutePath.lastIndexOf('.')).toLowerCase()
    const contentType = EXTENSION_CONTENT_TYPES[extension]

    if (!contentType) {
      return NextResponse.json({ error: 'Unsupported avatar format' }, { status: 415 })
    }

    const data = await readFile(absolutePath)

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        // Avatars change rarely and the filename carries a timestamp and uuid,
        // so a new upload produces a new URL. Safe to cache per-user.
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Error serving avatar:', error)
    return NextResponse.json({ error: 'Failed to serve avatar' }, { status: 500 })
  }
}
