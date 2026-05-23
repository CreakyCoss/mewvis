import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  onCreateWorkspace: () => void;
};

export const EmptyState = ({
  onCreateWorkspace,
}: EmptyStateProps) => {
  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-md border border-dashed border-border bg-card/70 px-6 text-center shadow-xs">
      <div className="flex size-12 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
        <FolderOpen className="size-6" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">还没有工作区</h2>
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
};
