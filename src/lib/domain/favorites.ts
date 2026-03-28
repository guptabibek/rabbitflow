import { db } from '@/lib/db'

type FavoriteEntityType = 'project' | 'issue' | 'view' | 'document'

type FavoriteEntitySummary = {
  id: string
  name?: string
  title?: string
  identifier?: string
}

type FavoriteWithEntity = {
  id: string
  userId: string
  entityType: FavoriteEntityType
  entityId: string
  createdAt: Date
  entity: FavoriteEntitySummary
}

async function getAccessibleProjectIds(
  userId: string,
  isAdmin: boolean,
  projectId?: string
): Promise<string[] | null> {
  if (isAdmin) {
    return projectId ? [projectId] : null
  }

  const memberships = await db.projectMember.findMany({
    where: {
      userId,
      ...(projectId ? { projectId } : {}),
    },
    select: { projectId: true },
  })

  return memberships.map((membership) => membership.projectId)
}

export async function listFavoritesForUser(options: {
  userId: string
  isAdmin: boolean
  entityType?: FavoriteEntityType | null
  projectId?: string | null
}): Promise<FavoriteWithEntity[]> {
  const favorites = await db.favorite.findMany({
    where: {
      userId: options.userId,
      ...(options.entityType ? { entityType: options.entityType } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  if (favorites.length === 0) {
    return []
  }

  const accessibleProjectIds = await getAccessibleProjectIds(
    options.userId,
    options.isAdmin,
    options.projectId ?? undefined
  )

  if (accessibleProjectIds && accessibleProjectIds.length === 0) {
    return []
  }

  const projectIds = favorites
    .filter((favorite) => favorite.entityType === 'project')
    .map((favorite) => favorite.entityId)
  const issueIds = favorites
    .filter((favorite) => favorite.entityType === 'issue')
    .map((favorite) => favorite.entityId)
  const viewIds = favorites
    .filter((favorite) => favorite.entityType === 'view')
    .map((favorite) => favorite.entityId)
  const documentIds = favorites
    .filter((favorite) => favorite.entityType === 'document')
    .map((favorite) => favorite.entityId)

  const scopedProjectIds = accessibleProjectIds
    ? projectIds.filter((projectId) => accessibleProjectIds.includes(projectId))
    : projectIds

  const [projects, issues, views, documents] = await Promise.all([
    scopedProjectIds.length > 0
      ? db.project.findMany({
          where: { id: { in: scopedProjectIds } },
          select: { id: true, name: true, key: true },
        })
      : Promise.resolve([]),
    issueIds.length > 0
      ? db.issue.findMany({
          where: {
            id: { in: issueIds },
            ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
          },
          select: { id: true, key: true, title: true },
        })
      : Promise.resolve([]),
    viewIds.length > 0
      ? db.savedView.findMany({
          where: {
            id: { in: viewIds },
            ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
          },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    documentIds.length > 0
      ? db.document.findMany({
          where: {
            id: { in: documentIds },
            ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
          },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ])

  const entityLookup = new Map<string, FavoriteEntitySummary>()

  for (const project of projects) {
    entityLookup.set(`project:${project.id}`, {
      id: project.id,
      name: project.name,
      identifier: project.key,
    })
  }

  for (const issue of issues) {
    entityLookup.set(`issue:${issue.id}`, {
      id: issue.id,
      title: issue.title,
      identifier: issue.key,
    })
  }

  for (const view of views) {
    entityLookup.set(`view:${view.id}`, {
      id: view.id,
      name: view.name,
    })
  }

  for (const document of documents) {
    entityLookup.set(`document:${document.id}`, {
      id: document.id,
      title: document.title,
    })
  }

  return favorites.flatMap((favorite) => {
    const entity = entityLookup.get(`${favorite.entityType}:${favorite.entityId}`)
    if (!entity) {
      return []
    }

    return [
      {
        id: favorite.id,
        userId: favorite.userId,
        entityType: favorite.entityType as FavoriteEntityType,
        entityId: favorite.entityId,
        createdAt: favorite.createdAt,
        entity,
      },
    ]
  })
}

export async function canFavoriteEntity(options: {
  userId: string
  isAdmin: boolean
  entityType: FavoriteEntityType
  entityId: string
}): Promise<boolean> {
  const accessibleProjectIds = await getAccessibleProjectIds(options.userId, options.isAdmin)

  if (accessibleProjectIds && accessibleProjectIds.length === 0) {
    return false
  }

  switch (options.entityType) {
    case 'project': {
      if (accessibleProjectIds) {
        return accessibleProjectIds.includes(options.entityId)
      }

      const project = await db.project.findUnique({
        where: { id: options.entityId },
        select: { id: true },
      })
      return Boolean(project)
    }
    case 'issue': {
      const issue = await db.issue.findFirst({
        where: {
          id: options.entityId,
          ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
        },
        select: { id: true },
      })
      return Boolean(issue)
    }
    case 'view': {
      const view = await db.savedView.findFirst({
        where: {
          id: options.entityId,
          ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
        },
        select: { id: true },
      })
      return Boolean(view)
    }
    case 'document': {
      const document = await db.document.findFirst({
        where: {
          id: options.entityId,
          ...(accessibleProjectIds ? { projectId: { in: accessibleProjectIds } } : {}),
        },
        select: { id: true },
      })
      return Boolean(document)
    }
  }
}