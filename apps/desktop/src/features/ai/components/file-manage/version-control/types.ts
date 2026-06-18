import type {
  WorkspaceVersion,
  WorkspaceVersionControlStatus,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
} from "@/features/workspace/chat/types";

export type VersionFileTreeNode = {
  path: string;
  name: string;
  isDirectory: boolean;
  children: VersionFileTreeNode[];
  file?: WorkspaceVersionFileEntry;
  fileCount: number;
};

export type SideBySideDiffRow =
  | {
      kind: "hunk" | "meta";
      text: string;
    }
  | {
      kind: "context" | "changed" | "removed" | "added";
      oldLine: number | null;
      newLine: number | null;
      oldText: string;
      newText: string;
    };

export type VersionControlViewProps = {
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
};
