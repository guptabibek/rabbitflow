export type WorkItemHierarchyInput = {
  id: string
  parentIssueId?: string | null
}

export type WorkItemHierarchyNode<T extends WorkItemHierarchyInput> = T & {
  children: Array<WorkItemHierarchyNode<T>>
}

export type FlattenedWorkItemRow<T extends WorkItemHierarchyInput> = {
  item: WorkItemHierarchyNode<T>
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}

export function buildWorkItemHierarchy<T extends WorkItemHierarchyInput>(
  items: T[]
): Array<WorkItemHierarchyNode<T>> {
  const byId = new Map<string, WorkItemHierarchyNode<T>>()
  const roots: Array<WorkItemHierarchyNode<T>> = []

  for (const item of items) {
    byId.set(item.id, {
      ...item,
      children: [],
    })
  }

  for (const item of items) {
    const node = byId.get(item.id)
    if (!node) {
      continue
    }

    if (item.parentIssueId && byId.has(item.parentIssueId)) {
      byId.get(item.parentIssueId)?.children.push(node)
      continue
    }

    roots.push(node)
  }

  return roots
}

export function flattenWorkItemHierarchy<T extends WorkItemHierarchyInput>(
  nodes: Array<WorkItemHierarchyNode<T>>,
  expandedIds: ReadonlySet<string>,
  depth = 0
): Array<FlattenedWorkItemRow<T>> {
  return nodes.flatMap((node) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.id)

    return [
      {
        item: node,
        depth,
        hasChildren,
        isExpanded,
      },
      ...(hasChildren && isExpanded
        ? flattenWorkItemHierarchy(node.children, expandedIds, depth + 1)
        : []),
    ]
  })
}
