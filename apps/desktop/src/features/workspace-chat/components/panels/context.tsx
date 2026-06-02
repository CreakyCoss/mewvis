import { useMemo, useState } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  History,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentProfile } from "@/features/agent-settings/types";
import { cn } from "@/lib/utils";
import type { ChatMode, CollaborationPhase, FileTreeNode } from "../../page-types";
import type {
  WorkspaceFile,
  WorkspaceVersion,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
  WorkspaceVersionFileStatus,
  WorkspaceVersionControlStatus,
} from "../../types";
import { CollaborationStatusPanel } from "../collaboration-status-panel";
import { VersionControlPanel } from "./version-control";

const VERSION_RULE_FILE_PATH = ".gitignore";

type ContextPanelTool = "files" | "git" | "history";

const fileStatusLabels: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  typechange: "类型",
  conflicted: "冲突",
  untracked: "新增",
};

const fileStatusTitles: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增文件",
  modified: "已修改",
  deleted: "已删除",
  renamed: "已重命名",
  typechange: "类型变更",
  conflicted: "存在冲突",
  untracked: "新增文件",
};

const fileStatusBadgeClasses: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  modified: "bg-amber-100 text-amber-700 ring-amber-200",
  deleted: "bg-destructive/10 text-destructive ring-destructive/20",
  renamed: "bg-sky-100 text-sky-700 ring-sky-200",
  typechange: "bg-violet-100 text-violet-700 ring-violet-200",
  conflicted: "bg-destructive/10 text-destructive ring-destructive/20",
  untracked: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

type ContextPanelProps = {
  selectableFileCount: number;
  isFilesLoading: boolean;
  fileTree: FileTreeNode[];
  expandedFileTreePaths: Set<string>;
  activeFile: WorkspaceFile | null;
  versionStatus: WorkspaceVersionControlStatus | null;
  versions: WorkspaceVersion[];
  versionDiff: WorkspaceVersionFileDiff | null;
  versionFiles: WorkspaceVersionFileEntry[];
  historyVersionDiff: WorkspaceVersionFileDiff | null;
  selectedVersionFilePath: string;
  selectedHistoryVersionId: string;
  selectedVersionHistoryBranchName: string;
  selectedVersionSnapshotFilePath: string;
  versionMessage: string;
  versionError: string;
  isVersionControlLoading: boolean;
  isVersionControlInitializing: boolean;
  isVersionDiffLoading: boolean;
  isVersionFilesLoading: boolean;
  isVersionFileContentLoading: boolean;
  isCreatingVersion: boolean;
  isVersionHistoryLoading: boolean;
  restoringVersionFilePath: string;
  discardingVersionFilePath: string;
  chatMode: ChatMode;
  collaborationPhase: CollaborationPhase;
  selectedAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  onRefreshFiles: () => void;
  onRefreshVersionControl: () => void;
  onSelectVersionFile: (path: string) => void;
  onSelectHistoryVersion: (version: WorkspaceVersion) => void;
  onSelectVersionHistoryBranch: (branchName: string) => void;
  onSelectHistoryVersionFile: (versionId: string, path: string) => void;
  onVersionMessageChange: (message: string) => void;
  onCreateVersion: (relativePaths: string[]) => void;
  onDiscardVersionFileChanges: (
    path: string,
    options?: { skipConfirmation?: boolean },
  ) => void;
  onRestoreHistoryVersionFile: (file: WorkspaceVersionFileEntry) => void;
  onPrepareNewFile: () => void;
  onOpenFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
};

export const ContextPanel = ({
  selectableFileCount,
  isFilesLoading,
  fileTree,
  expandedFileTreePaths,
  activeFile,
  versionStatus,
  versions,
  versionDiff,
  versionFiles,
  historyVersionDiff,
  selectedVersionFilePath,
  selectedHistoryVersionId,
  selectedVersionHistoryBranchName,
  selectedVersionSnapshotFilePath,
  versionMessage,
  versionError,
  isVersionControlLoading,
  isVersionControlInitializing,
  isVersionDiffLoading,
  isVersionFilesLoading,
  isVersionFileContentLoading,
  isCreatingVersion,
  isVersionHistoryLoading,
  restoringVersionFilePath,
  discardingVersionFilePath,
  chatMode,
  collaborationPhase,
  selectedAgent,
  reviewerAgent,
  onRefreshFiles,
  onRefreshVersionControl,
  onSelectVersionFile,
  onSelectHistoryVersion,
  onSelectVersionHistoryBranch,
  onSelectHistoryVersionFile,
  onVersionMessageChange,
  onCreateVersion,
  onDiscardVersionFileChanges,
  onRestoreHistoryVersionFile,
  onPrepareNewFile,
  onOpenFile,
  onToggleDirectory,
}: ContextPanelProps) => {
  const [activeTool, setActiveTool] = useState<ContextPanelTool>("files");
  const versionFileStatusByPath = useMemo(() => {
    const statusByPath = new Map<string, WorkspaceVersionFileStatus>();
    versionStatus?.files.forEach((fileStatus) => {
      statusByPath.set(fileStatus.path, fileStatus);
    });
    return statusByPath;
  }, [versionStatus?.files]);

  const renderFileTreeNode = (node: FileTreeNode, depth: number) => {
    const isExpanded = expandedFileTreePaths.has(node.path);
    const paddingLeft = `${0.5 + depth * 0.85}rem`;

    if (node.isDirectory) {
      return (
        <div key={node.path} className="min-w-0 overflow-hidden">
          <button
            type="button"
            className="flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
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
              <span className="rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {node.children.length}
              </span>
            )}
          </button>
          {isExpanded && node.children.length > 0 && (
            <div className="min-w-0 space-y-0.5 overflow-hidden">
              {node.children.map((child) => renderFileTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const isVersionRuleFile = node.path === VERSION_RULE_FILE_PATH;
    const fileStatus = versionFileStatusByPath.get(node.path);
    const fileStatusTitle = fileStatus?.previousPath
      ? `${fileStatusTitles[fileStatus.status]}：${fileStatus.previousPath} -> ${fileStatus.path}`
      : fileStatus
      ? fileStatusTitles[fileStatus.status]
      : "";

    return (
      <div
        key={node.path}
        className="flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-muted/70"
        style={{ paddingLeft: `${1.55 + depth * 0.85}rem` }}
        data-active={node.path === activeFile?.path}
      >
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => onOpenFile(node.path)}
        >
          {isVersionRuleFile ? (
            <GitBranch className="size-4 shrink-0 text-sky-700" />
          ) : (
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              isVersionRuleFile && "font-medium",
            )}
          >
            {node.name}
          </span>
        </button>
        {isVersionRuleFile && (
          <span className="shrink-0 rounded-sm bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
            版本规则
          </span>
        )}
        {fileStatus && (
          <span
            className={cn(
              "shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium ring-1",
              fileStatusBadgeClasses[fileStatus.status],
            )}
            title={fileStatusTitle}
          >
            {fileStatusLabels[fileStatus.status]}
          </span>
        )}
      </div>
    );
  };

  const toolButtonClass =
    "flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground";

  const filePanel = (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2 bg-transparent px-3 py-3 xl:px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Folder className="size-4" />
          <span className="shrink-0">文件</span>
          <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {selectableFileCount}
          </span>
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
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 overflow-hidden p-3 pt-0">
          <section className="min-w-0 space-y-2 overflow-hidden">
            <div className="min-w-0 space-y-0.5 overflow-hidden">
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
        </div>
      </ScrollArea>
    </>
  );

  const gitPanel = (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-3">
      <VersionControlPanel
        panelMode="worktree"
        versionStatus={versionStatus}
        versions={versions}
        versionDiff={versionDiff}
        versionFiles={versionFiles}
        historyVersionDiff={historyVersionDiff}
        selectedVersionFilePath={selectedVersionFilePath}
        selectedHistoryVersionId={selectedHistoryVersionId}
        selectedVersionHistoryBranchName={selectedVersionHistoryBranchName}
        selectedVersionSnapshotFilePath={selectedVersionSnapshotFilePath}
        versionMessage={versionMessage}
        versionError={versionError}
        isVersionControlLoading={isVersionControlLoading}
        isVersionControlInitializing={isVersionControlInitializing}
        isVersionDiffLoading={isVersionDiffLoading}
        isVersionFilesLoading={isVersionFilesLoading}
        isVersionFileContentLoading={isVersionFileContentLoading}
        isCreatingVersion={isCreatingVersion}
        isVersionHistoryLoading={isVersionHistoryLoading}
        restoringVersionFilePath={restoringVersionFilePath}
        discardingVersionFilePath={discardingVersionFilePath}
        onRefreshVersionControl={onRefreshVersionControl}
        onSelectVersionFile={onSelectVersionFile}
        onSelectHistoryVersion={onSelectHistoryVersion}
        onSelectVersionHistoryBranch={onSelectVersionHistoryBranch}
        onSelectHistoryVersionFile={onSelectHistoryVersionFile}
        onVersionMessageChange={onVersionMessageChange}
        onCreateVersion={onCreateVersion}
        onDiscardVersionFileChanges={onDiscardVersionFileChanges}
        onRestoreHistoryVersionFile={onRestoreHistoryVersionFile}
      />
    </div>
  );

  const historyPanel = (
    <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="min-w-0 overflow-hidden p-3">
        <VersionControlPanel
          panelMode="history"
          versionStatus={versionStatus}
          versions={versions}
          versionDiff={versionDiff}
          versionFiles={versionFiles}
          historyVersionDiff={historyVersionDiff}
          selectedVersionFilePath={selectedVersionFilePath}
          selectedHistoryVersionId={selectedHistoryVersionId}
          selectedVersionHistoryBranchName={selectedVersionHistoryBranchName}
          selectedVersionSnapshotFilePath={selectedVersionSnapshotFilePath}
          versionMessage={versionMessage}
          versionError={versionError}
          isVersionControlLoading={isVersionControlLoading}
          isVersionControlInitializing={isVersionControlInitializing}
          isVersionDiffLoading={isVersionDiffLoading}
          isVersionFilesLoading={isVersionFilesLoading}
          isVersionFileContentLoading={isVersionFileContentLoading}
          isCreatingVersion={isCreatingVersion}
          isVersionHistoryLoading={isVersionHistoryLoading}
          restoringVersionFilePath={restoringVersionFilePath}
          discardingVersionFilePath={discardingVersionFilePath}
          onRefreshVersionControl={onRefreshVersionControl}
          onSelectVersionFile={onSelectVersionFile}
          onSelectHistoryVersion={onSelectHistoryVersion}
          onSelectVersionHistoryBranch={onSelectVersionHistoryBranch}
          onSelectHistoryVersionFile={onSelectHistoryVersionFile}
          onVersionMessageChange={onVersionMessageChange}
          onCreateVersion={onCreateVersion}
          onDiscardVersionFileChanges={onDiscardVersionFileChanges}
          onRestoreHistoryVersionFile={onRestoreHistoryVersionFile}
        />
      </div>
    </ScrollArea>
  );

  return (
    <aside className="flex min-w-0 w-[clamp(280px,28vw,420px)] shrink-0 overflow-hidden bg-background/90 text-foreground shadow-[-8px_0_28px_-30px_rgb(15_23_42_/_0.38)] backdrop-blur">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeTool === "files"
          ? filePanel
          : activeTool === "git"
          ? gitPanel
          : historyPanel}

        {chatMode === "collab" && (
          <CollaborationStatusPanel
            writerAgent={selectedAgent}
            reviewerAgent={reviewerAgent}
            phase={collaborationPhase}
          />
        )}
      </div>

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
          onClick={() => setActiveTool("files")}
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
          onClick={() => setActiveTool("git")}
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
          onClick={() => setActiveTool("history")}
        >
          <History className="size-5" />
        </button>
      </nav>
    </aside>
  );
};
