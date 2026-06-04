import { useLayoutEffect } from "react";
import { create } from "zustand";
import type { ContextPanelViewModel } from "./types";

const noop = () => {};

const emptyContextPanelState: ContextPanelViewModel = {
  selectableFileCount: 0,
  isFilesLoading: false,
  fileTree: [],
  expandedFileTreePaths: new Set(),
  activeFile: null,
  versionStatus: null,
  versions: [],
  versionDiff: null,
  versionFiles: [],
  historyVersionDiff: null,
  selectedVersionFilePath: "",
  selectedHistoryVersionId: "",
  selectedVersionHistoryBranchName: "",
  selectedVersionSnapshotFilePath: "",
  versionMessage: "",
  versionError: "",
  isVersionControlLoading: false,
  isVersionControlInitializing: false,
  isVersionDiffLoading: false,
  isVersionFilesLoading: false,
  isVersionFileContentLoading: false,
  isCreatingVersion: false,
  isVersionHistoryLoading: false,
  restoringVersionFilePath: "",
  discardingVersionFilePath: "",
  chatMode: "agent",
  collaborationPhase: "idle",
  selectedAgent: null,
  reviewerAgent: null,
  chatTrace: [],
  onRefreshFiles: noop,
  onRefreshVersionControl: noop,
  onSelectVersionFile: noop,
  onSelectHistoryVersion: noop,
  onSelectVersionHistoryBranch: noop,
  onSelectHistoryVersionFile: noop,
  onVersionMessageChange: noop,
  onCreateVersion: noop,
  onDiscardVersionFileChanges: noop,
  onRestoreHistoryVersionFile: noop,
  onPrepareNewFile: noop,
  onOpenFile: noop,
  onToggleDirectory: noop,
  onClearChatTrace: noop,
};

type ContextPanelStore = ContextPanelViewModel & {
  setContextPanelState: (state: ContextPanelViewModel) => void;
  resetContextPanelState: () => void;
};

export const useContextPanelStore = create<ContextPanelStore>((set) => ({
  ...emptyContextPanelState,
  setContextPanelState: (state) => set(state),
  resetContextPanelState: () => set(emptyContextPanelState),
}));

export const useContextPanelStoreBridge = (state: ContextPanelViewModel) => {
  const setContextPanelState = useContextPanelStore((store) => store.setContextPanelState);

  useLayoutEffect(() => {
    setContextPanelState(state);
  });
};
