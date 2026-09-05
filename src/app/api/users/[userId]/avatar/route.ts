import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { validateUploadBuffer } from '@/lib/domain/file-upload'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: id } = await params
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    if (auth.user.id !== id && auth.user.globalRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 })
    }

    // Check the declared size before buffering so an oversized body is rejected
    // without reading it all into memory.
    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json({ error: 'Avatar must be 5MB or smaller' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Validate by content, not by the client-supplied MIME type or filename. The
    // previous implementation trusted `file.type` and took the extension from
    // `file.name`, which let an HTML payload be stored as `<id>-<ts>.html` and
    // served as active content from this application's own origin.
    const validation = validateUploadBuffer(buffer, file.name, {
      allow: 'image',
      maxBytes: MAX_AVATAR_SIZE,
      namePrefix: id,
    })

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
    await mkdir(uploadDir, { recursive: true })

    const fileName = validation.storedFileName
    const destination = path.join(uploadDir, fileName)

    await writeFile(destination, buffer)

    const avatarPath = `/uploads/avatars/${fileName}`

    const user = await db.user.update({
      where: { id },
      data: { avatar: avatarPath },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        globalRole: true,
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error('Error uploading avatar:', error)
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 })
  }
}
