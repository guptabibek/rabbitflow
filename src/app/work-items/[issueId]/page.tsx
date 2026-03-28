import { WorkItemPage } from '@/components/project-management/work-item-page'

export default async function WorkItemRoutePage({
  params,
}: {
  params: Promise<{ issueId: string }>
}) {
  const { issueId: id } = await params

  return <WorkItemPage issueId={id} />
}
