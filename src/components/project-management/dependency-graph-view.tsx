'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getApiErrorMessage } from '@/lib/utils'
import { InlineAlert } from '@/components/ui/states'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Link2, Trash2 } from 'lucide-react'
import { ConfirmDestructiveDialog, useDestructiveConfirm } from '@/components/project-management/confirm-destructive-dialog'

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
  const permissions = useAppStore((state) => state.currentProjectPermissions)
  const openWorkItem = useAppStore((state) => state.openWorkItem)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [cyclicNodeIds, setCyclicNodeIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceIssueId, setSourceIssueId] = useState('')
  const [targetIssueId, setTargetIssueId] = useState('')
  const [saving, setSaving] = useState(false)
  const [nodeLimit, setNodeLimit] = useState(150)
  const deleteConfirm = useDestructiveConfirm<GraphEdge>()
  const canLink = permissions.includes('workitem:link')

  const fetchGraph = useCallback(async () => {
    if (!currentProject) return
    setLoading(true)
    try {
      const response = await fetch(`/api/dependency-graph?projectId=${currentProject.id}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Failed to load dependency graph'))
      const payload = await response.json()
      setNodes(payload.nodes ?? [])
      setEdges(payload.edges ?? [])
      setCyclicNodeIds(payload.cyclicNodeIds ?? [])
      setNodeLimit(150)
      setError(null)
    } catch (loadError) {
      setNodes([])
      setEdges([])
      setCyclicNodeIds([])
      setError(loadError instanceof Error ? loadError.message : 'Failed to load dependency graph')
    } finally {
      setLoading(false)
    }
  }, [currentProject])

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchGraph(), 0)
    return () => window.clearTimeout(timeout)
  }, [fetchGraph])

  const createDependency = async () => {
    if (!canLink || !sourceIssueId || !targetIssueId || sourceIssueId === targetIssueId) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIssueId, targetIssueId, relationType: 'blocks' }),
      })
      if (!response.ok) throw new Error(await getApiErrorMessage(response, 'Dependency was not created'))
      setSourceIssueId('')
      setTargetIssueId('')
      await fetchGraph()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Dependency was not created')
    } finally {
      setSaving(false)
    }
  }

  const deleteDependency = async () => {
    if (!deleteConfirm.target) return false
    const response = await fetch(`/api/relations?id=${deleteConfirm.target.id}`, { method: 'DELETE' })
    if (!response.ok) return await getApiErrorMessage(response, 'Dependency was not removed')
    setEdges((current) => current.filter((edge) => edge.id !== deleteConfirm.target?.id))
    await fetchGraph()
    return true
  }

  const displayedNodes = useMemo(() => nodes.slice(0, nodeLimit), [nodeLimit, nodes])
  const displayedNodeIds = useMemo(() => new Set(displayedNodes.map((node) => node.id)), [displayedNodes])
  const displayedEdges = useMemo(
    () => edges.filter((edge) => displayedNodeIds.has(edge.sourceIssueId) && displayedNodeIds.has(edge.targetIssueId)),
    [displayedNodeIds, edges]
  )

  const layers = useMemo(() => {
    const incoming = new Map<string, number>()
    const outgoing = new Map<string, string[]>()

    displayedNodes.forEach((node) => {
      incoming.set(node.id, 0)
      outgoing.set(node.id, [])
    })

    displayedEdges.forEach((edge) => {
      outgoing.set(edge.sourceIssueId, [...(outgoing.get(edge.sourceIssueId) ?? []), edge.targetIssueId])
      incoming.set(edge.targetIssueId, (incoming.get(edge.targetIssueId) ?? 0) + 1)
    })

    const depth = new Map<string, number>()
    const queue = displayedNodes.filter((node) => (incoming.get(node.id) ?? 0) === 0)

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
          const nextNode = displayedNodes.find((node) => node.id === nextId)
          if (nextNode) queue.push(nextNode)
        }
      }
    }

    return displayedNodes.reduce<Record<number, GraphNode[]>>((accumulator, node) => {
      const nodeDepth = depth.get(node.id) ?? 0
      if (!accumulator[nodeDepth]) accumulator[nodeDepth] = []
      accumulator[nodeDepth].push(node)
      return accumulator
    }, {})
  }, [displayedEdges, displayedNodes])

  if (!currentProject) return null

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Dependency Graph</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create and inspect blocking relationships. Cycles are rejected before save.
          </p>
        </CardHeader>
        {canLink ? (
          <CardContent className="flex flex-col gap-2 border-t border-border pt-4 lg:flex-row lg:items-center">
            <Select value={sourceIssueId} onValueChange={setSourceIssueId}>
              <SelectTrigger aria-label="Select blocking work item" className="min-w-[220px]"><SelectValue placeholder="Blocking work item" /></SelectTrigger>
              <SelectContent>{nodes.map((node) => <SelectItem key={node.id} value={node.id}>{node.key} · {node.title}</SelectItem>)}</SelectContent>
            </Select>
            <span className="shrink-0 text-sm text-muted-foreground">blocks</span>
            <Select value={targetIssueId} onValueChange={setTargetIssueId}>
              <SelectTrigger aria-label="Select blocked work item" className="min-w-[220px]"><SelectValue placeholder="Blocked work item" /></SelectTrigger>
              <SelectContent>{nodes.filter((node) => node.id !== sourceIssueId).map((node) => <SelectItem key={node.id} value={node.id}>{node.key} · {node.title}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" onClick={createDependency} disabled={!sourceIssueId || !targetIssueId || sourceIssueId === targetIssueId || saving}>
              <Link2 className="h-4 w-4" /> {saving ? 'Creating…' : 'Create dependency'}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      {error ? <InlineAlert tone="danger" title="Dependency action not completed." action={<Button type="button" variant="outline" size="sm" onClick={() => void fetchGraph()}>Retry</Button>}>{error}</InlineAlert> : null}

      {cyclicNodeIds.length > 0 ? (
        <InlineAlert tone="warning" title="Existing dependency cycle detected.">
          {cyclicNodeIds.length} work item{cyclicNodeIds.length === 1 ? '' : 's'} participate in a cycle. Remove one of the highlighted links before relying on delivery order.
        </InlineAlert>
      ) : null}

      {nodes.length > displayedNodes.length ? (
        <InlineAlert tone="info" title={`Showing ${displayedNodes.length} of ${nodes.length} work items.`} action={<Button type="button" variant="outline" size="sm" onClick={() => setNodeLimit((value) => value + 150)}>Load 150 more</Button>}>
          The graph renders in batches to keep large projects responsive. Dependency creation still searches every work item.
        </InlineAlert>
      ) : null}

      {loading ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading dependency graph…</CardContent></Card>
      ) : nodes.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">No work items are available for this project.</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[960px] gap-4">
            {Object.entries(layers).map(([depth, layerNodes]) => (
              <Card key={depth} className="min-w-[280px] flex-1">
                <CardHeader><CardTitle className="text-sm">Layer {Number(depth) + 1}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {layerNodes.map((node) => {
                    const outgoingKeys = displayedEdges
                      .filter((edge) => edge.sourceIssueId === node.id)
                      .map((edge) => nodes.find((candidate) => candidate.id === edge.targetIssueId)?.key)
                      .filter(Boolean)

                    return (
                      <div key={node.id} className={`rounded-2xl border bg-card/70 p-4 ${cyclicNodeIds.includes(node.id) ? 'border-warning' : 'border-border/70'}`}>
                        <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => openWorkItem(node.id)}>
                          <Badge variant="outline">{node.key}</Badge>
                          <span className="font-medium">{node.title}</span>
                          {cyclicNodeIds.includes(node.id) ? <Badge variant="outline" className="ml-auto gap-1 border-warning text-warning"><AlertTriangle className="h-3 w-3" />Cycle</Badge> : null}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{node.workItemType}</span>
                          <span>{node.status.replace(/_/g, ' ')}</span>
                          <span>{node.assignee ? node.assignee.name : 'Unassigned'}</span>
                        </div>
                        {outgoingKeys.length > 0 ? (
                          <div className="mt-3 space-y-1.5">
                            {displayedEdges.filter((edge) => edge.sourceIssueId === node.id).map((edge) => {
                              const target = nodes.find((candidate) => candidate.id === edge.targetIssueId)
                              return (
                                <div key={edge.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1">
                                  <Badge variant="secondary">→ {target?.key ?? 'Unknown'}</Badge>
                                  {canLink ? <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label={`Remove dependency from ${node.key} to ${target?.key ?? 'unknown item'}`} onClick={() => deleteConfirm.request(edge)}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
                                </div>
                              )
                            })}
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

      <ConfirmDestructiveDialog
        open={deleteConfirm.isOpen}
        onOpenChange={deleteConfirm.onOpenChange}
        title="Remove dependency"
        description="The blocking relationship will be removed. The work items and their schedule remain unchanged."
        confirmLabel="Remove link"
        onConfirm={deleteDependency}
      />
    </div>
  )
}
