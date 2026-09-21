export type BlockingRelation = {
  sourceIssueId: string
  targetIssueId: string
  relationType: string
}

export type DirectedDependency = {
  blockerId: string
  blockedId: string
}

export function toDirectedDependency(relation: BlockingRelation): DirectedDependency | null {
  if (relation.relationType === 'blocks') {
    return { blockerId: relation.sourceIssueId, blockedId: relation.targetIssueId }
  }
  if (relation.relationType === 'blocked_by') {
    return { blockerId: relation.targetIssueId, blockedId: relation.sourceIssueId }
  }
  return null
}

export function findCycleCreatedByEdge(
  relations: BlockingRelation[],
  blockerId: string,
  blockedId: string
) {
  if (blockerId === blockedId) return [blockerId, blockedId]
  const adjacency = new Map<string, string[]>()
  for (const relation of relations) {
    const edge = toDirectedDependency(relation)
    if (!edge) continue
    adjacency.set(edge.blockerId, [...(adjacency.get(edge.blockerId) ?? []), edge.blockedId])
  }

  const queue: Array<{ id: string; path: string[] }> = [{ id: blockedId, path: [blockedId] }]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.id === blockerId) return [blockerId, ...current.path]
    if (visited.has(current.id)) continue
    visited.add(current.id)
    for (const next of adjacency.get(current.id) ?? []) {
      queue.push({ id: next, path: [...current.path, next] })
    }
  }
  return null
}

export function findCyclicNodeIds(relations: BlockingRelation[]) {
  const nodes = new Set<string>()
  const edges = relations.map(toDirectedDependency).filter((edge): edge is DirectedDependency => edge !== null)
  for (const edge of edges) {
    if (findCycleCreatedByEdge(
      relations.filter((candidate) => {
        const normalized = toDirectedDependency(candidate)
        return normalized?.blockerId !== edge.blockerId || normalized.blockedId !== edge.blockedId
      }),
      edge.blockerId,
      edge.blockedId
    )) {
      nodes.add(edge.blockerId)
      nodes.add(edge.blockedId)
    }
  }
  return nodes
}
