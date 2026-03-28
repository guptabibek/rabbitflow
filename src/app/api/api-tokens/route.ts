import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import crypto from 'crypto'

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scopes: z.array(z.string().trim().min(1)).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

// GET /api/api-tokens - List user's API tokens (without secrets)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const tokens = await db.apiToken.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      tokens.map((token) => ({
        id: token.id,
        name: token.name,
        prefix: token.tokenPrefix,
        scopes: token.scopes,
        lastUsedAt: token.lastUsedAt,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
      }))
    )
  } catch (error) {
    console.error('Error fetching API tokens:', error)
    return NextResponse.json({ error: 'Failed to fetch API tokens' }, { status: 500 })
  }
}

// POST /api/api-tokens - Create new token
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const data = createTokenSchema.parse(body)

    // Limit tokens per user
    const count = await db.apiToken.count({ where: { userId: auth.user.id } })
    if (count >= 20) {
      return NextResponse.json({ error: 'Maximum 20 API tokens per user' }, { status: 400 })
    }

    // Generate token: prefix_randomBytes
    const prefix = `rf_${crypto.randomBytes(4).toString('hex')}`
    const secret = crypto.randomBytes(32).toString('hex')
    const fullToken = `${prefix}_${secret}`

    // Hash the secret for storage
    const hashedToken = crypto.createHash('sha256').update(fullToken).digest('hex')

    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const token = await db.apiToken.create({
      data: {
        userId: auth.user.id,
        name: data.name,
        tokenPrefix: prefix,
        tokenHash: hashedToken,
        scopes: data.scopes,
        expiresAt,
      },
    })

    // Return full token ONLY during creation
    return NextResponse.json(
      {
        id: token.id,
        name: token.name,
        token: fullToken,
        prefix: token.tokenPrefix,
        scopes: token.scopes,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating API token:', error)
    return NextResponse.json({ error: 'Failed to create API token' }, { status: 500 })
  }
}
