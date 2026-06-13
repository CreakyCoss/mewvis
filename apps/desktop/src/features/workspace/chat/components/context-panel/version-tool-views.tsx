import { ScrollArea } from "@/components/ui/scroll-area";
import { VersionControlPanel } from "../version-control";
import type { ContextPanelViewModel } from "./types";

type VersionToolViewProps = Pick<
  ContextPanelViewModel,
  | "versionStatus"
  | "versions"
  | "versionDiff"
  | "versionFiles"
  | "historyVersionDiff"
  | "selectedVersionFilePath"
  | "selectedHistoryVersionId"
  | "selectedVersionHistoryBranchName"
  | "selectedVersionSnapshotFilePath"
  | "versionMessage"
  | "versionError"
  | "isVersionControlLoading"
  | "isVersionControlInitializing"
  | "isVersionDiffLoading"
  | "isVersionFilesLoading"
  | "isVersionFileContentLoading"
  | "isCreatingVersion"
  | "isVersionHistoryLoading"
  | "restoringVersionFilePath"
  | "discardingVersionFilePath"
  | "onRefreshVersionControl"
  | "onSelectVersionFile"
  | "onSelectHistoryVersion"
  | "onSelectVersionHistoryBranch"
  | "onSelectHistoryVersionFile"
  | "onVersionMessageChange"
  | "onCreateVersion"
  | "onDiscardVersionFileChanges"
  | "onRestoreHistoryVersionFile"
>;

export const VersionWorktreeToolView = (props: VersionToolViewProps) => (
  <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-3">
    <VersionControlPanel panelMode="worktree" {...props} />
  </div>
);

export const VersionHistoryToolView = (props: VersionToolViewProps) => (
  <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
    <div className="min-w-0 overflow-hidden p-3">
      <VersionControlPanel panelMode="history" {...props} />
    </div>
  </ScrollArea>
);
