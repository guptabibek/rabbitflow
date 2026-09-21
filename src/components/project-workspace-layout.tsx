'use client'

import type { ReactNode } from 'react'
import { useSelectedLayoutSegment } from 'next/navigation'
import { WorkspaceApp } from '@/components/workspace-app'
import { workspaceViewFromSlug } from '@/lib/domain/workspace-route'

/**
 * Keeps the authenticated project chrome mounted while the leaf view segment
 * changes. The previous route pages each owned a WorkspaceApp instance, so a
 * sidebar click destroyed the header/sidebar, repeated bootstrap requests, and
 * displayed the full-page loading shell even though only the centre view had
 * changed.
 */
export function ProjectWorkspaceLayout({
  projectId,
  children,
}: {
  projectId: string
  children: ReactNode
}) {
  const segment = useSelectedLayoutSegment()
  const routeView = workspaceViewFromSlug(segment ?? '') ?? 'dashboard'

  return (
    <>
      {children}
      <WorkspaceApp routeProjectId={projectId} routeView={routeView} />
    </>
  )
}
