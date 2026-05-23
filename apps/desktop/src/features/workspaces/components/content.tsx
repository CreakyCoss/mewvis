import { EmptyState } from "./empty-state";
import { Groups } from "./groups";
import type { Workspace, WorkspaceSection, WorkspaceOverview } from "../types";

type ContentProps = {
  overview: WorkspaceOverview | null;
  sections: WorkspaceSection[];
  isLoading: boolean;
  onCreateWorkspace: () => void;
  onOpenWorkspace: (workspace: Workspace) => void;
};

export const Content = ({
  overview,
  sections,
  isLoading,
  onCreateWorkspace,
  onOpenWorkspace,
}: ContentProps) => {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        正在读取工作区
      </div>
    );
  }

  if (overview?.workspaces.length === 0) {
    return <EmptyState onCreateWorkspace={onCreateWorkspace} />;
  }

  return <Groups sections={sections} onOpenWorkspace={onOpenWorkspace} />;
};
