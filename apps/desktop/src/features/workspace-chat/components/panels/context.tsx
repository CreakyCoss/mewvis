import {
  Database,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  PanelRightClose,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentProfile } from "@/features/agent-settings/types";
import type { ChatMode, CollaborationPhase, FileTreeNode } from "../../page-types";
import type { AgentSessionStatus, WorkspaceFile } from "../../types";
import { CollaborationStatusPanel } from "../collaboration-status-panel";
import { MarkdownContent } from "../markdown-content";

type ContextPanelProps = {
  selectableFileCount: number;
  isFilesLoading: boolean;
  fileTree: FileTreeNode[];
  expandedFileTreePaths: Set<string>;
  activeFile: WorkspaceFile | null;
  fileContent: string;
  isMarkdownFile: boolean;
  chatMode: ChatMode;
  collaborationPhase: CollaborationPhase;
  selectedAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  currentSessionId: string | null;
  agentSessionStatus: AgentSessionStatus | null;
  agentSessionError: string;
  isAgentSessionLoading: boolean;
  latestAgentExecutionSummary: string;
  onRefreshFiles: () => void;
  onRefreshAgentSession: () => void;
  onCleanupAgentSessions: () => void;
  onPrepareNewFile: () => void;
  onClose: () => void;
  onOpenFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
  onEditFile: () => void;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes.toLocaleString()} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};

const formatCompactNumber = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export const ContextPanel = ({
  selectableFileCount,
  isFilesLoading,
  fileTree,
  expandedFileTreePaths,
  activeFile,
  fileContent,
  isMarkdownFile,
  chatMode,
  collaborationPhase,
  selectedAgent,
  reviewerAgent,
  currentSessionId,
  agentSessionStatus,
  agentSessionError,
  isAgentSessionLoading,
  latestAgentExecutionSummary,
  onRefreshFiles,
  onRefreshAgentSession,
  onCleanupAgentSessions,
  onPrepareNewFile,
  onClose,
  onOpenFile,
  onToggleDirectory,
  onEditFile,
}: ContextPanelProps) => {
  const renderFileTreeNode = (node: FileTreeNode, depth: number) => {
    const isExpanded = expandedFileTreePaths.has(node.path);
    const paddingLeft = `${0.5 + depth * 0.85}rem`;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-1.5 rounded-md border border-transparent pr-2 text-left text-sm transition-colors hover:border-sidebar-border hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none"
            style={{ paddingLeft }}
            onClick={() => onToggleDirectory(node.path)}
          >
            <ChevronRight
              className={[
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                isExpanded ? "rotate-90" : "",
              ].join(" ")}
            />
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-sidebar-primary" />
            ) : (
              <Folder className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            {node.children.length > 0 && (
              <span className="rounded-sm bg-sidebar-accent px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {node.children.length}
              </span>
            )}
          </button>
          {isExpanded && node.children.length > 0 && (
            <div className="space-y-0.5">
              {node.children.map((child) => renderFileTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        className="flex h-8 w-full items-center gap-2 rounded-md border border-transparent pr-2 text-left text-sm transition-colors hover:border-sidebar-border hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 focus-visible:outline-none data-[active=true]:border-primary/25 data-[active=true]:bg-card"
        style={{ paddingLeft: `${1.55 + depth * 0.85}rem` }}
        data-active={node.path === activeFile?.path}
        onClick={() => onOpenFile(node.path)}
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
    );
  };

  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-l border-border/80 bg-sidebar text-sidebar-foreground xl:flex">
      <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Folder className="size-4" />
          <span>上下文</span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="刷新文件"
            onClick={onRefreshFiles}
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="新建文件"
            onClick={onPrepareNewFile}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="收起右侧上下文"
            onClick={onClose}
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
              <span>Agent 记忆</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title="刷新 Agent 记忆状态"
                  disabled={isAgentSessionLoading}
                  onClick={onRefreshAgentSession}
                >
                  <RefreshCw
                    className={[
                      "size-3.5",
                      isAgentSessionLoading ? "animate-spin" : "",
                    ].join(" ")}
                  />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title="清理孤儿 Agent 上下文"
                  disabled={isAgentSessionLoading}
                  onClick={onCleanupAgentSessions}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-sidebar-border bg-card text-card-foreground">
              <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2 text-xs">
                <Database className="size-3.5 shrink-0 text-sidebar-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {currentSessionId
                      ? agentSessionStatus?.exists
                        ? "已建立长期上下文"
                        : "暂无长期上下文"
                      : "工作区 Agent 上下文"}
                  </div>
                  <div className="mt-0.5 truncate text-muted-foreground">
                    {currentSessionId ?? "当前未绑定聊天，显示工作区总量"}
                  </div>
                </div>
              </div>

              <div className="space-y-2 px-3 py-2 text-xs text-muted-foreground">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span>Session 文件</span>
                  <span className="truncate text-right text-card-foreground">
                    {formatCompactNumber(agentSessionStatus?.sessionFileCount ?? 0)}
                  </span>
                  <span>活跃消息</span>
                  <span className="truncate text-right text-card-foreground">
                    {formatCompactNumber(agentSessionStatus?.activeMessageCount ?? 0)}
                    <span className="text-muted-foreground">
                      {" / "}
                      {formatCompactNumber(agentSessionStatus?.messageCount ?? 0)}
                    </span>
                  </span>
                  <span>活跃工具</span>
                  <span className="truncate text-right text-card-foreground">
                    {formatCompactNumber(agentSessionStatus?.activeToolCallCount ?? 0)}
                    <span className="text-muted-foreground">
                      {" / "}
                      {formatCompactNumber(agentSessionStatus?.toolCallCount ?? 0)}
                    </span>
                  </span>
                  <span>压缩次数</span>
                  <span className="truncate text-right text-card-foreground">
                    {formatCompactNumber(agentSessionStatus?.compactionCount ?? 0)}
                  </span>
                  <span>活跃上下文粗估</span>
                  <span className="truncate text-right text-card-foreground">
                    {formatCompactNumber(agentSessionStatus?.estimatedContextTokens ?? 0)} tokens
                  </span>
                  <span>占用空间</span>
                  <span className="truncate text-right text-card-foreground">
                    {formatBytes(agentSessionStatus?.totalBytes ?? 0)}
                  </span>
                </div>

                {agentSessionStatus?.sessionDir && (
                  <div className="truncate border-t border-border/70 pt-2">
                    {agentSessionStatus.sessionDir}
                  </div>
                )}

                {agentSessionStatus?.latestCompaction && (
                  <div className="space-y-1 border-t border-border/70 pt-2">
                    <div className="font-medium text-card-foreground">最近压缩</div>
                    <div>
                      {agentSessionStatus.latestCompaction.tokensBefore
                        ? `${formatCompactNumber(agentSessionStatus.latestCompaction.tokensBefore)} tokens`
                        : "已压缩"}
                      {agentSessionStatus.latestCompaction.timestamp
                        ? ` · ${agentSessionStatus.latestCompaction.timestamp}`
                        : ""}
                    </div>
                    {agentSessionStatus.latestCompaction.summary && (
                      <div className="line-clamp-3 whitespace-pre-wrap">
                        {agentSessionStatus.latestCompaction.summary}
                      </div>
                    )}
                  </div>
                )}

                {latestAgentExecutionSummary && (
                  <div className="space-y-1 border-t border-border/70 pt-2">
                    <div className="font-medium text-card-foreground">最近执行摘要</div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-5">
                      {latestAgentExecutionSummary}
                    </pre>
                  </div>
                )}

                {agentSessionError && (
                  <div className="border-t border-border/70 pt-2 text-sidebar-primary">
                    {agentSessionError}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
              <span>文件</span>
              <span>{selectableFileCount} 个</span>
            </div>
            <div className="space-y-0.5">
              {isFilesLoading ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  正在读取文件
                </div>
              ) : selectableFileCount ? (
                fileTree.map((node) => renderFileTreeNode(node, 0))
              ) : (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  暂无可编辑文件
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <div className="px-1 text-xs font-medium text-muted-foreground">
              文件预览
            </div>
            <div className="overflow-hidden rounded-md border border-sidebar-border bg-card text-card-foreground">
              <div className="border-b border-border/70 px-3 py-2 text-xs">
                <div className="truncate font-medium">
                  {activeFile?.path ?? "未选择文件"}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {activeFile
                    ? `${fileContent.length.toLocaleString()} 字符`
                    : "从文件树选择文件后在这里预览。"}
                </div>
              </div>
              <ScrollArea className="h-72">
                <div className="p-3">
                  {activeFile ? (
                    isMarkdownFile ? (
                      fileContent.trim() ? (
                        <div className="text-sm leading-6">
                          <MarkdownContent content={fileContent} />
                        </div>
                      ) : (
                        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                          暂无可预览内容
                        </div>
                      )
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-muted-foreground">
                        {fileContent || "暂无内容"}
                      </pre>
                    )
                  ) : (
                    <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
                      选择左侧文件树中的文件进行预览。
                    </div>
                  )}
                </div>
              </ScrollArea>
              {activeFile && (
                <div className="flex justify-end border-t border-border/70 px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onEditFile}
                  >
                    <FileText className="size-3.5" />
                    <span>编辑</span>
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>

      {chatMode === "collab" && (
        <CollaborationStatusPanel
          writerAgent={selectedAgent}
          reviewerAgent={reviewerAgent}
          phase={collaborationPhase}
        />
      )}
    </aside>
  );
};
