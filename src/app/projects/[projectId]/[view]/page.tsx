import { redirect } from 'next/navigation'
import {
  canonicalWorkspaceRoute,
  workspaceViewFromSlug,
} from '@/lib/domain/workspace-route'

export default async function ProjectViewPage({
  params,
}: {
  params: Promise<{ projectId: string; view: string }>
}) {
  const { projectId, view: viewSlug } = await params
  const view = workspaceViewFromSlug(viewSlug)

  if (!view) {
    redirect(canonicalWorkspaceRoute(projectId, 'dashboard'))
  }

  // `/dashboard` remains accepted for old links, but Overview is the one
  // canonical name exposed to users and copied from the address bar.
  if (viewSlug !== (view === 'dashboard' ? 'overview' : view)) {
    redirect(canonicalWorkspaceRoute(projectId, view))
  }

  // The persistent [projectId] layout owns WorkspaceApp. Keeping the leaf page
  // validation-only lets view navigation update the centre content without
  // unmounting the project header, sidebar, drawers, or client-side data.
  return null
}
