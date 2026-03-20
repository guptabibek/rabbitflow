import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/domain/auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUser(request)
  if (!auth.ok) return auth.response
  return NextResponse.json(auth.user)
}
