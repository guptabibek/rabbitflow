import { cacheInvalidate } from '@/lib/redis'

export async function invalidateProjectCaches(projectId: string) {
  await cacheInvalidate(
    `board:${projectId}:*`,
    `backlog:${projectId}:*`,
    `dashboard:${projectId}:*`,
    `labels:${projectId}:*`,
    `iterations:${projectId}:*`,
    `project:${projectId}:*`,
    `teams:${projectId}:*`,
    `areas:${projectId}:*`,
    `work-item-types:${projectId}:*`,
    `work-item-detail:${projectId}:*`
  )
}

export async function invalidateWorkItemCaches(projectId: string) {
  await cacheInvalidate(
    `board:${projectId}:*`,
    `backlog:${projectId}:*`,
    `dashboard:${projectId}:*`,
    `work-item-detail:${projectId}:*`
  )
}

export async function invalidateSprintCaches(projectId: string, sprintId?: string | null) {
  await invalidateWorkItemCaches(projectId)

  if (sprintId) {
    await cacheInvalidate(
      `sprint:${sprintId}:*`,
      `sprint-analytics:${sprintId}`,
      `sprint-capacity:${sprintId}`
    )
  }
}
