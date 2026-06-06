import { useLayoutEffect } from "react";
import { create } from "zustand";
import type { ContextPanelViewModel } from "./types";

const noop = () => {};

const emptyContextPanelState: ContextPanelViewModel = {
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

const isSameContextPanelState = (
  current: ContextPanelViewModel,
  next: ContextPanelViewModel,
) => {
  const keys = Object.keys(next) as Array<keyof ContextPanelViewModel>;
  return keys.every((key) => Object.is(current[key], next[key]));
};

export const useContextPanelStore = create<ContextPanelStore>((set) => ({
  ...emptyContextPanelState,
  setContextPanelState: (state) => set((current) =>
    isSameContextPanelState(current, state) ? current : state,
  ),
  resetContextPanelState: () => set(emptyContextPanelState),
}));

export const useContextPanelStoreBridge = (state: ContextPanelViewModel) => {
  const setContextPanelState = useContextPanelStore((store) => store.setContextPanelState);

  useLayoutEffect(() => {
    setContextPanelState(state);
  });
};
