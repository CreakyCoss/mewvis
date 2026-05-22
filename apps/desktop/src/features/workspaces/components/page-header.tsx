import { Database, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

type PageHeaderProps = {
  configDbPath?: string;
  onCreateWorkspace: () => void;
};

export const PageHeader = ({
  configDbPath,
  onCreateWorkspace,
}: PageHeaderProps) => {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Database className="size-4" />
          <span>配置数据库</span>
          <span className="max-w-[60vw] truncate">
            {configDbPath ?? "正在初始化"}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-normal">
          Novel Claw 工作区
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          type="button"
          disabled
          title="LLM 设置将在后续阶段实现"
        >
          <Settings className="size-4" />
          <span>LLM 设置</span>
        </Button>
        <Button type="button" onClick={onCreateWorkspace}>
          <Plus className="size-4" />
          <span>新增工作区</span>
        </Button>
      </div>
    </header>
  );
};
