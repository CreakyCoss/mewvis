import { useMemo, useState } from "react";
import { ConversationLedger } from "@/features/ai/components/conversation-ledger";
import { FilesPanel } from "./files-panel";
import { useContextPanelStore } from "./store";
import { ToolNav } from "./tool-nav";
import type { FileTreeNode } from "../../page-types";
import type { ContextPanelTool, VersionFileStatusByPath } from "./types";
import { VersionHistoryToolView, VersionWorktreeToolView } from "./version-tool-views";

const countSelectableFileTreeNodes = (nodes: FileTreeNode[]): number =>
  nodes.reduce((count, node) => (
    node.isDirectory
      ? count + countSelectableFileTreeNodes(node.children)
      : count + 1
  ), 0);

export const ContextPanel = () => {
  const {
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
    workspacePath,
    chatId,
    ledgerRuntimeModel,
    ledgerAgentId,
    conversationLedgerBind,
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
  } = useContextPanelStore();
  const [activeTool, setActiveTool] = useState<ContextPanelTool>("files");
  const selectableFileCount = useMemo(
    () => countSelectableFileTreeNodes(fileTree),
    [fileTree],
  );
  const versionFileStatusByPath = useMemo(() => {
    const statusByPath: VersionFileStatusByPath = new Map();
    versionStatus?.files.forEach((fileStatus) => {
      statusByPath.set(fileStatus.path, fileStatus);
    });
    return statusByPath;
  }, [versionStatus?.files]);
  const versionPanelProps = {
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
    onRefreshVersionControl,
    onSelectVersionFile,
    onSelectHistoryVersion,
    onSelectVersionHistoryBranch,
    onSelectHistoryVersionFile,
    onVersionMessageChange,
    onCreateVersion,
    onDiscardVersionFileChanges,
    onRestoreHistoryVersionFile,
  };

  return (
    <div className="relative flex min-w-0 shrink-0 overflow-visible">
      <aside className="flex min-w-0 w-[clamp(280px,28vw,420px)] shrink-0 overflow-hidden bg-background/90 text-foreground shadow-[-8px_0_28px_-30px_rgb(15_23_42_/_0.38)] backdrop-blur">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {activeTool === "files" ? (
            <FilesPanel
              selectableFileCount={selectableFileCount}
              isFilesLoading={isFilesLoading}
              fileTree={fileTree}
              expandedFileTreePaths={expandedFileTreePaths}
              activeFile={activeFile}
              versionFileStatusByPath={versionFileStatusByPath}
              onRefreshFiles={onRefreshFiles}
              onPrepareNewFile={onPrepareNewFile}
              onOpenFile={onOpenFile}
              onToggleDirectory={onToggleDirectory}
            />
          ) : activeTool === "git" ? (
            <VersionWorktreeToolView {...versionPanelProps} />
          ) : activeTool === "history" ? (
            <VersionHistoryToolView {...versionPanelProps} />
          ) : (
            <ConversationLedger
              bind={conversationLedgerBind ?? undefined}
              workspacePath={workspacePath}
              chatId={chatId}
              runtimeModel={ledgerRuntimeModel}
              agentId={ledgerAgentId}
            />
          )}

        </div>

        <ToolNav activeTool={activeTool} onChangeTool={setActiveTool} />
      </aside>
    </div>
  );
};
