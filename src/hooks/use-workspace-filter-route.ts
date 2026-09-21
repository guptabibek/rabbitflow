'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  parseWorkspaceFilterRoute,
  workspaceFilterRouteSignature,
  writeWorkspaceFilterRoute,
} from '@/lib/domain/workspace-filter-route'

/**
 * Keeps the shared work-item filters in the browser URL. Native history is
 * used deliberately: typing in search must not trigger an App Router request,
 * while Back/Forward still restores query state through `popstate`.
 */
export function useWorkspaceFilterRoute() {
  const setFilters = useAppStore((state) => state.setFilters)
  const setWorkItemTypeFilter = useAppStore((state) => state.setWorkItemTypeFilter)

  useEffect(() => {
    let isApplyingUrl = false
    let lastSyncedSignature: string | null = null

    const syncUrl = () => {
      if (isApplyingUrl) return

      const state = useAppStore.getState()
      const signature = workspaceFilterRouteSignature({
        search: state.filters.search,
        workItemType: state.workItemTypeFilter,
        assigneeId: state.filters.assigneeId,
        priority: state.filters.priority,
        iterationId: state.filters.iterationId,
        areaId: state.filters.areaId,
        labelIds: state.filters.labelIds,
      })
      if (signature === lastSyncedSignature) return
      lastSyncedSignature = signature

      const params = writeWorkspaceFilterRoute(
        window.location.search,
        state.filters,
        state.workItemTypeFilter
      )
      const query = params.toString()
      const nextPath = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

      if (nextPath !== currentPath) {
        window.history.replaceState(window.history.state, '', nextPath)
      }
    }

    const applyUrl = () => {
      const routeState = parseWorkspaceFilterRoute(window.location.search)
      isApplyingUrl = true
      setFilters({
        search: routeState.search,
        assigneeId: routeState.assigneeId,
        priority: routeState.priority,
        type: null,
        sprintId: null,
        iterationId: routeState.iterationId,
        areaId: routeState.areaId,
        labelIds: routeState.labelIds,
      })
      setWorkItemTypeFilter(routeState.workItemType)
      isApplyingUrl = false
      lastSyncedSignature = null
      // Canonicalize malformed or duplicate values after applying their safe
      // representation to the store.
      syncUrl()
    }

    applyUrl()
    const unsubscribe = useAppStore.subscribe(syncUrl)
    window.addEventListener('popstate', applyUrl)
    return () => {
      unsubscribe()
      window.removeEventListener('popstate', applyUrl)
    }
  }, [setFilters, setWorkItemTypeFilter])
}
