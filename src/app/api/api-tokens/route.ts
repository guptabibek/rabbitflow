import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuthenticatedUser } from '@/lib/domain/auth'
import { API_TOKEN_SCOPES, generateApiToken } from '@/lib/domain/api-token'

const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Scopes were previously `z.array(z.string())` — arbitrary strings, validated
  // against nothing and enforced nowhere. They now map to real capabilities:
  // `read` permits safe methods, `write` permits mutations.
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
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

    // Generation and hashing live in the domain module so the format stays in
    // lockstep with the verification path in authenticateApiToken().
    const { token: fullToken, prefix, tokenHash: hashedToken } = generateApiToken()

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
