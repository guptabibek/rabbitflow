'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getApiErrorMessage } from '@/lib/utils'

type GraphNode = {
  id: string
  key: string
  title: string
  status: string
  priority: string
  workItemType: string
  assignee: { id: string; name: string; avatar: string | null } | null
}

type GraphEdge = {
  id: string
  relationType: string
  sourceIssueId: string
  targetIssueId: string
}

export function DependencyGraphView() {
  const currentProject = useAppStore((state) => state.currentProject)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentProject) return

    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (cancelled) return
      setLoading(true)

      fetch(`/api/dependency-graph?projectId=${currentProject.id}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await getApiErrorMessage(response, 'Failed to load dependency graph'))
          }
          return response.json()
        })
        .then((payload) => {
          if (!cancelled) {
            setNodes(payload.nodes ?? [])
            setEdges(payload.edges ?? [])
            setError(null)
          }
        })
        .catch((loadError) => {
          if (!cancelled) {
            setNodes([])
            setEdges([])
            setError(loadError instanceof Error ? loadError.message : 'Failed to load dependency graph')
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [currentProject])

  const layers = useMemo(() => {
    const incoming = new Map<string, number>()
    const outgoing = new Map<string, string[]>()

    nodes.forEach((node) => {
      incoming.set(node.id, 0)
      outgoing.set(node.id, [])
    })

    edges.forEach((edge) => {
      outgoing.set(edge.sourceIssueId, [...(outgoing.get(edge.sourceIssueId) ?? []), edge.targetIssueId])
      incoming.set(edge.targetIssueId, (incoming.get(edge.targetIssueId) ?? 0) + 1)
    })

    const depth = new Map<string, number>()
    const queue = nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0)

    queue.forEach((node) => depth.set(node.id, 0))

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) continue
      const currentDepth = depth.get(current.id) ?? 0

      for (const nextId of outgoing.get(current.id) ?? []) {
        const nextDepth = Math.max(depth.get(nextId) ?? 0, currentDepth + 1)
        depth.set(nextId, nextDepth)
        incoming.set(nextId, (incoming.get(nextId) ?? 1) - 1)
        if ((incoming.get(nextId) ?? 0) <= 0) {
          const nextNode = nodes.find((node) => node.id === nextId)
          if (nextNode) queue.push(nextNode)
        }
      }
    }

    return nodes.reduce<Record<number, GraphNode[]>>((accumulator, node) => {
      const nodeDepth = depth.get(node.id) ?? 0
      if (!accumulator[nodeDepth]) accumulator[nodeDepth] = []
      accumulator[nodeDepth].push(node)
      return accumulator
    }, {})
  }, [edges, nodes])

  if (!currentProject) return null

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Dependency Graph</CardTitle>
          <p className="text-sm text-muted-foreground">
            Visual dependency layers built from blocking and test-link relationships.
          </p>
        </CardHeader>
      </Card>

      {loading ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading dependency graph…</CardContent></Card>
      ) : nodes.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">{error || 'No dependency links found for this project.'}</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[960px] gap-4">
            {Object.entries(layers).map(([depth, layerNodes]) => (
              <Card key={depth} className="min-w-[280px] flex-1">
                <CardHeader><CardTitle className="text-sm">Layer {Number(depth) + 1}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {layerNodes.map((node) => {
                    const outgoingKeys = edges
                      .filter((edge) => edge.sourceIssueId === node.id)
                      .map((edge) => nodes.find((candidate) => candidate.id === edge.targetIssueId)?.key)
                      .filter(Boolean)

                    return (
                      <div key={node.id} className="rounded-2xl border border-border/70 bg-card/70 p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{node.key}</Badge>
                          <span className="font-medium">{node.title}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{node.workItemType}</span>
                          <span>{node.status.replace(/_/g, ' ')}</span>
                          <span>{node.assignee ? node.assignee.name : 'Unassigned'}</span>
                        </div>
                        {outgoingKeys.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {outgoingKeys.map((key) => (
                              <Badge key={key} variant="secondary">→ {key}</Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}