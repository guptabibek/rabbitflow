import { redirect } from 'next/navigation'
import { canonicalWorkspaceRoute } from '@/lib/domain/workspace-route'

export default async function ProjectRoutePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  redirect(canonicalWorkspaceRoute(projectId, 'dashboard'))
}
