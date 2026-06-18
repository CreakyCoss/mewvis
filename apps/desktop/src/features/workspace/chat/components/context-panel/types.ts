import type { Ref } from "react";
import type { RuntimeModelInput } from "@/ai/runtime-protocol";
import type { ConversationLedgerHandle } from "@/features/ai/components/conversation-ledger/types";
import type { FileTreeNode } from "../../page-types";
import type {
  WorkspaceFile,
  WorkspaceVersion,
  WorkspaceVersionControlStatus,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
  WorkspaceVersionFileStatus,
} from "../../types";

export type ContextPanelTool = "files" | "git" | "history" | "trace";

export type ContextPanelViewModel = {
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
  workspacePath: string;
  chatId: string | null;
  ledgerRuntimeModel: RuntimeModelInput | null;
  ledgerAgentId: string | null;
  conversationLedgerBind: Ref<ConversationLedgerHandle> | null;
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

export type VersionFileStatusByPath = Map<string, WorkspaceVersionFileStatus>;
