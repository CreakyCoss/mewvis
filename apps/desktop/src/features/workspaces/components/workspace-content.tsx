import { WorkspaceEmptyState } from "./workspace-empty-state";
import { WorkspaceGroups } from "./workspace-groups";
import type { WorkspaceGroupWithItems, WorkspaceOverview } from "../types";

type WorkspaceContentProps = {
  overview: WorkspaceOverview | null;
  groupsWithWorkspaces: WorkspaceGroupWithItems[];
  isLoading: boolean;
  onCreateWorkspace: () => void;
};

export function WorkspaceContent({
  overview,
  groupsWithWorkspaces,
  isLoading,
  onCreateWorkspace,
}: WorkspaceContentProps) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        正在读取工作区
      </div>
    );
  }

  if (overview?.workspaces.length === 0) {
    return <WorkspaceEmptyState onCreateWorkspace={onCreateWorkspace} />;
  }

  return <WorkspaceGroups groupsWithWorkspaces={groupsWithWorkspaces} />;
}
