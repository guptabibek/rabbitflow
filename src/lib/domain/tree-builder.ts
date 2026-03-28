// Pure tree-building function extracted for testability (no @/ imports)
// Re-exported by document-service.ts

export function buildTree(
  items: Array<{ id: string; parentId: string | null; [key: string]: unknown }>,
  parentId: string | null
): Array<Record<string, unknown>> {
  return items
    .filter((i) => i.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildTree(items, item.id),
    }))
}
