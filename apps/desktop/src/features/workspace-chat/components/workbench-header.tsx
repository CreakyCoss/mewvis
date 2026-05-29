import {
  Columns3,
  FileText,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { AgentRuntimeAgentDefinition } from "@/agent-runtime/contracts";
import { Button } from "@/components/ui/button";
import type { AgentProfile } from "@/features/agent-settings/types";
import type { LlmProvider, ProviderModel } from "@/features/llm-settings/types";
import type { ModelSource, WorkspaceView } from "../page-types";
import { DEFAULT_SESSION_TITLE } from "../utils/sessions";

type WorkbenchHeaderProps = {
  workspaceView: WorkspaceView;
  currentSessionTitle: string;
  modelSource: ModelSource;
  selectedAgent: AgentProfile | null;
  selectedRuntimeAgent: AgentRuntimeAgentDefinition | null;
  runtimeAgentRequiresModel: boolean;
  effectiveProvider: LlmProvider | null;
  effectiveModel: ProviderModel | null;
  isContextPanelOpen: boolean;
  activeAgentTaskId: string;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
  onToggleContextPanel: () => void;
  onAbortTask: () => void;
};

export const WorkbenchHeader = ({
  workspaceView,
  currentSessionTitle,
  modelSource,
  selectedAgent,
  selectedRuntimeAgent,
  runtimeAgentRequiresModel,
  effectiveProvider,
  effectiveModel,
  isContextPanelOpen,
  activeAgentTaskId,
  onWorkspaceViewChange,
  onToggleContextPanel,
  onAbortTask,
}: WorkbenchHeaderProps) => (
  <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-card/80 px-4 py-3 backdrop-blur lg:px-5">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-md border border-primary/15 bg-accent text-primary">
        {workspaceView === "file" ? (
          <FileText className="size-4" />
        ) : workspaceView === "split" ? (
          <Columns3 className="size-4" />
        ) : (
          <MessageSquare className="size-4" />
        )}
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">
          {workspaceView === "file"
            ? "文件工作台"
            : workspaceView === "split"
              ? "拆分工作台"
              : "AI 工作台"}
        </h2>
        <p className="truncate text-xs text-muted-foreground">
          {currentSessionTitle !== DEFAULT_SESSION_TITLE
            ? `${currentSessionTitle} · `
            : ""}
          {modelSource === "agent" && selectedAgent
            ? `当前 Agent：${selectedAgent.name} / ${selectedRuntimeAgent?.label ?? "运行时"} / ${effectiveProvider?.name ?? "未选择"} / ${effectiveModel?.modelName ?? "未选择"}`
            : runtimeAgentRequiresModel
              ? `当前模型：${selectedRuntimeAgent?.label ?? "运行时"} / ${effectiveProvider?.name ?? "未选择"} / ${effectiveModel?.modelName ?? "未选择"}`
              : `当前运行时：${selectedRuntimeAgent?.label ?? "运行时"}`}
        </p>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="flex h-9 rounded-md border border-input bg-muted/60 p-0.5 shadow-xs">
        <Button
          type="button"
          size="sm"
          variant={workspaceView === "chat" ? "secondary" : "ghost"}
          className="h-7 px-2"
          onClick={() => onWorkspaceViewChange("chat")}
        >
          <MessageSquare className="size-3.5" />
          <span>聊天</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={workspaceView === "file" ? "secondary" : "ghost"}
          className="h-7 px-2"
          onClick={() => onWorkspaceViewChange("file")}
        >
          <FileText className="size-3.5" />
          <span>文件</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={workspaceView === "split" ? "secondary" : "ghost"}
          className="h-7 px-2"
          onClick={() => onWorkspaceViewChange("split")}
        >
          <Columns3 className="size-3.5" />
          <span>拆分</span>
        </Button>
      </div>

      <Button
        type="button"
        size="icon"
        variant={isContextPanelOpen ? "secondary" : "ghost"}
        title={isContextPanelOpen ? "收起右侧上下文" : "展开右侧上下文"}
        onClick={onToggleContextPanel}
      >
        {isContextPanelOpen ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </Button>

      {workspaceView !== "file" && activeAgentTaskId && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onAbortTask}
        >
          停止
        </Button>
      )}
    </div>
  </header>
);
