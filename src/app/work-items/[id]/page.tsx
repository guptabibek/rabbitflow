import { WorkItemPage } from '@/components/project-management/work-item-page'

export default async function WorkItemRoutePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <WorkItemPage issueId={id} />
}
