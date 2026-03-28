import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireProjectPermission } from '@/lib/domain/auth'

const createSlaPolicySchema = z.object({
  projectId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  priorityFilter: z.array(z.string()).nullable().optional(),
  typeFilter: z.array(z.string()).nullable().optional(),
  responseTimeMinutes: z.number().int().min(1),
  resolutionTimeMinutes: z.number().int().min(1),
  businessHoursOnly: z.boolean().optional(),
})

// GET /api/sla-policies?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const auth = await requireProjectPermission(request, projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const policies = await db.slaPolicy.findMany({
      where: { projectId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(policies)
  } catch (error) {
    console.error('Error fetching SLA policies:', error)
    return NextResponse.json({ error: 'Failed to fetch SLA policies' }, { status: 500 })
  }
}

// POST /api/sla-policies
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createSlaPolicySchema.parse(body)

    const auth = await requireProjectPermission(request, data.projectId, 'operations:manage')
    if (!auth.ok) return auth.response

    const policy = await db.slaPolicy.create({
      data: {
        projectId: data.projectId,
        name: data.name,
        description: data.description ?? null,
        priorityFilter: data.priorityFilter ?? undefined,
        typeFilter: data.typeFilter ?? undefined,
        responseTimeMinutes: data.responseTimeMinutes,
        resolutionTimeMinutes: data.resolutionTimeMinutes,
        businessHoursOnly: data.businessHoursOnly ?? false,
      },
    })

    return NextResponse.json(policy, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }
    console.error('Error creating SLA policy:', error)
    return NextResponse.json({ error: 'Failed to create SLA policy' }, { status: 500 })
  }
}
