import { db } from '@/lib/db'
import { ephemeralScan, ephemeralSet } from '@/lib/redis'

export type CollaborationPresence = {
  userId: string
  name: string
  avatar: string | null
  projectId: string
  view: string | null
  issueId: string | null
  updatedAt: string
}

function buildPresenceKey(projectId: string, userId: string) {
  return `presence:project:${projectId}:${userId}`
}

export async function touchProjectPresence(payload: CollaborationPresence) {
  await ephemeralSet(buildPresenceKey(payload.projectId, payload.userId), payload, 45)
}

export async function listProjectPresence(projectId: string) {
  const entries = await ephemeralScan<CollaborationPresence>(`presence:project:${projectId}:*`)

  return entries
    .map((entry) => entry.value)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function getRecentProjectActivity(projectId: string, since?: Date) {
  return db.activity.findMany({
    where: {
      projectId,
      ...(since ? { createdAt: { gt: since } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      issue: { select: { id: true, key: true, title: true, areaId: true } },
    },
  })
}