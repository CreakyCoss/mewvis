import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type WorkspaceEmptyStateProps = {
  onCreateWorkspace: () => void;
};

export function WorkspaceEmptyState({
  onCreateWorkspace,
}: WorkspaceEmptyStateProps) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-muted/30 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-md bg-background ring-1 ring-border">
        <FolderOpen className="size-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-medium">还没有工作区</h2>
        <p className="text-sm text-muted-foreground">
          创建第一个工作区后，会在所选目录中初始化 workspace.db。
        </p>
      </div>
      <Button type="button" onClick={onCreateWorkspace}>
        <Plus className="size-4" />
        <span>新增工作区</span>
      </Button>
    </div>
  );
}
