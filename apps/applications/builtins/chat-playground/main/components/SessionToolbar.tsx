import type { ReactNode } from "react";
import type { ChatPhase } from "@mewvis/app-sdk/chat";
import { Code2, History, Plus } from "lucide-react";

export interface SessionToolbarProps {
  title: string;
  workspace: string;
  busy: boolean;
  creating: boolean;
  canCreate: boolean;
  onSessions(): void;
  onCreate(): void;
  onCode(): void;
}

const phases: Record<ChatPhase, string> = {
  initializing: "初始化",
  idle: "就绪",
  preparing: "准备中",
  submitting: "提交中",
  running: "生成中",
  waiting: "等待回答",
  stopping: "停止中",
  pausing: "暂停中",
  paused: "已暂停",
  closing: "关闭中",
  closed: "已关闭",
};

export function SessionToolbar({
  title,
  workspace,
  busy,
  creating,
  canCreate,
  onSessions,
  onCreate,
  onCode,
  phase,
  children,
}: SessionToolbarProps & { phase?: ChatPhase; children?: ReactNode }) {
  return (
    <header className="lab-toolbar" aria-label="会话工具栏">
      <div className="lab-session-heading">
        <div className="lab-title">
          <h1 title={title}>{title}</h1>
          <span className="lab-workspace-name" title={workspace}>
            {workspace}
          </span>
        </div>
        {phase && (
          <span className="lab-status" data-phase={phase} role="status">
            <i aria-hidden="true" />
            {phases[phase]}
          </span>
        )}
      </div>
      <div className="lab-toolbar-actions">
        {children && <div className="lab-toolbar-tools">{children}</div>}
        <div className="lab-session-actions">
          <button
            type="button"
            className="lab-button"
            aria-label="会话与工作区"
            title="会话与工作区"
            aria-haspopup="dialog"
            onClick={onSessions}
          >
            <History aria-hidden="true" />
            <span>会话</span>
          </button>
          <button
            type="button"
            className="lab-button lab-primary"
            disabled={busy || !canCreate}
            aria-label={creating ? "创建中…" : "新对话"}
            title={creating ? "创建中…" : "新对话"}
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
            <span>{creating ? "创建中…" : "新对话"}</span>
          </button>
          <button
            type="button"
            className="lab-icon-button"
            aria-label="查看接入代码"
            title="查看接入代码"
            aria-haspopup="dialog"
            onClick={onCode}
          >
            <Code2 aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}
