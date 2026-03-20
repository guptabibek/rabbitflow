import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 })
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json({ error: 'Avatar must be 5MB or smaller' }, { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
    await mkdir(uploadDir, { recursive: true })

    const safeExtension = path.extname(file.name) || '.png'
    const fileName = `${id}-${Date.now()}${safeExtension}`
    const destination = path.join(uploadDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())

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
