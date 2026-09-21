export default function ProjectWorkspaceLoading() {
  // WorkspaceApp lives in the persistent [projectId] layout and supplies its
  // own geometry-matched skeleton on first load. Rendering another full shell
  // here would cover or displace that resident shell whenever only [view]
  // changes.
  return null
}
