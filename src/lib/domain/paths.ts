const PATH_SEPARATOR = ' / '

export function splitHierarchyPath(path?: string | null) {
  if (!path) {
    return []
  }

  return path
    .split(/\\|\//g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
}

export function buildHierarchyPath(name: string, parentPath?: string | null) {
  const segments = [...splitHierarchyPath(parentPath), name.trim()].filter(Boolean)
  return segments.join(PATH_SEPARATOR)
}

export function buildHierarchySegments(name: string, parentPath?: string | null) {
  return [...splitHierarchyPath(parentPath), name.trim()].filter(Boolean)
}
