import { Bot, Database, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_DISPLAY_NAME } from "@/product-config";

type PageHeaderProps = {
  configDbPath?: string;
  onCreateWorkspace: () => void;
  onOpenAgents: () => void;
  onOpenSettings: () => void;
};

export const PageHeader = ({
  configDbPath,
  onCreateWorkspace,
  onOpenAgents,
  onOpenSettings,
}: PageHeaderProps) => {
  return (
    <header className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-xs">
          <Database className="size-3.5 text-primary" />
          <span className="shrink-0 font-medium text-foreground">配置数据库</span>
          <span className="min-w-0 truncate">
            {configDbPath ?? "正在初始化"}
          </span>
        </div>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-normal">
            {APP_DISPLAY_NAME} 工作区
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            组织项目、配置模型，并进入工作区继续创作与编辑。
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={onOpenAgents}
          title="Agent 设置"
        >
          <Bot className="size-4" />
          <span>Agent 设置</span>
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={onOpenSettings}
          title="LLM 设置"
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
