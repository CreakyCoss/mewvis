import { VersionControlHistoryPanel } from "./version-control/history-panel";
import type { VersionControlPanelProps } from "./version-control/types";
import { VersionControlWorktreePanel } from "./version-control/worktree-panel";

export const VersionControlPanel = ({
  panelMode = "worktree",
  ...props
}: VersionControlPanelProps) =>
  panelMode === "history" ? (
    <VersionControlHistoryPanel {...props} />
  ) : (
    <VersionControlWorktreePanel {...props} />
  );

export type { VersionControlPanelProps };
