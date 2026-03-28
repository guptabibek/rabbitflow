import { db } from '@/lib/db'
import { buildTree } from '@/lib/domain/tree-builder'

export { buildTree }

// ============================================================================
// DOCUMENT / WIKI SERVICE
// ============================================================================

export async function getDocumentTree(projectId: string) {
  const documents = await db.document.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      title: true,
      parentId: true,
      sortOrder: true,
      isPublished: true,
      updatedAt: true,
      lastEditedBy: { select: { id: true, name: true } },
    },
  })

  return buildTree(documents, null)
}

export async function getDocument(id: string) {
  return db.document.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      lastEditedBy: { select: { id: true, name: true, email: true } },
    },
  })
}

export async function createDocument(data: {
  projectId: string
  title: string
  content?: string
  parentId?: string | null
  userId: string
}) {
  const maxOrder = await db.document.aggregate({
    where: { projectId: data.projectId, parentId: data.parentId ?? null },
    _max: { sortOrder: true },
  })

  return db.document.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      content: data.content ?? '',
      parentId: data.parentId ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      createdById: data.userId,
      lastEditedById: data.userId,
    },
  })
}

export async function updateDocument(
  id: string,
  userId: string,
  data: { title?: string; content?: string; parentId?: string | null; sortOrder?: number; isPublished?: boolean }
) {
  return db.$transaction(async (tx) => {
    const current = await tx.document.findUnique({
      where: { id },
      select: { content: true, title: true },
    })

    if (current && data.content !== undefined && data.content !== current.content) {
      await tx.documentRevision.create({
        data: {
          documentId: id,
          content: current.content,
          title: current.title,
          editorId: userId,
        },
      })
    }

    return tx.document.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        lastEditedById: userId,
      },
    })
  })
}

export async function getDocumentRevisions(documentId: string, limit = 20) {
  return db.documentRevision.findMany({
    where: { documentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function deleteDocument(id: string) {
  const pendingIds = [id]
  const orderedIds: string[] = []
  const seenIds = new Set<string>()

  while (pendingIds.length > 0) {
    const currentBatch = pendingIds.splice(0, 50)
    const childDocuments = await db.document.findMany({
      where: { parentId: { in: currentBatch } },
      select: { id: true },
    })

    for (const documentId of currentBatch) {
      if (seenIds.has(documentId)) {
        continue
      }
      seenIds.add(documentId)
      orderedIds.push(documentId)
    }

    for (const child of childDocuments) {
      if (!seenIds.has(child.id)) {
        pendingIds.push(child.id)
      }
    }
  }

  await db.$transaction(async (tx) => {
    await tx.documentRevision.deleteMany({ where: { documentId: { in: orderedIds } } })

    for (const documentId of orderedIds.reverse()) {
      await tx.document.delete({ where: { id: documentId } })
    }
  })
}
