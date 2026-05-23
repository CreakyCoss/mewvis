import { Card } from "./card";
import type { Workspace, WorkspaceSection } from "../types";

type GroupsProps = {
  sections: WorkspaceSection[];
  onOpenWorkspace: (workspace: Workspace) => void;
};

export const Groups = ({
  sections,
  onOpenWorkspace,
}: GroupsProps) => {
  return (
    <div className="space-y-8">
      {sections.map(({ group, workspaces }) => (
        <section key={group.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {group.name}
            </h2>
            <span className="text-xs text-muted-foreground">
              {workspaces.length} 个工作区
            </span>
          </div>

          {workspaces.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              当前分组暂无工作区
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((workspace) => (
                <Card
                  key={workspace.id}
                  workspace={workspace}
                  onOpen={onOpenWorkspace}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
};
