import type { ReactNode } from 'react'
import { ProjectWorkspaceLayout } from '@/components/project-workspace-layout'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return <ProjectWorkspaceLayout projectId={projectId}>{children}</ProjectWorkspaceLayout>
}
