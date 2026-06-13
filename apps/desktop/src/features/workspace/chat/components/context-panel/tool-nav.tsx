import { Activity, Folder, GitBranch, History } from "lucide-react";
import type { ContextPanelTool } from "./types";

type ToolNavProps = {
  activeTool: ContextPanelTool;
  onChangeTool: (tool: ContextPanelTool) => void;
};

const toolButtonClass =
  "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

export const ToolNav = ({
  activeTool,
  onChangeTool,
}: ToolNavProps) => (
  <nav
    className="flex w-12 shrink-0 flex-col items-center gap-2 border-l border-border/60 bg-muted/35 px-1.5 py-3"
    aria-label="右侧工具"
  >
    <button
      type="button"
      className={toolButtonClass}
      title="文件"
      aria-label="显示文件"
      aria-pressed={activeTool === "files"}
      data-active={activeTool === "files"}
      onClick={() => onChangeTool("files")}
    >
      <Folder className="size-5" />
    </button>
    <button
      type="button"
      className={toolButtonClass}
      title="版本控制"
      aria-label="显示版本控制"
      aria-pressed={activeTool === "git"}
      data-active={activeTool === "git"}
      onClick={() => onChangeTool("git")}
    >
      <GitBranch className="size-5" />
    </button>
    <button
      type="button"
      className={toolButtonClass}
      title="提交历史"
      aria-label="显示提交历史"
      aria-pressed={activeTool === "history"}
      data-active={activeTool === "history"}
      onClick={() => onChangeTool("history")}
    >
      <History className="size-5" />
    </button>
    <button
      type="button"
      className={toolButtonClass}
      title="链路日志"
      aria-label="显示链路日志"
      aria-pressed={activeTool === "trace"}
      data-active={activeTool === "trace"}
      onClick={() => onChangeTool("trace")}
    >
      <Activity className="size-5" />
    </button>
  </nav>
);
