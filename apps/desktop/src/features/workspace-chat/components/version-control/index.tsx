import { VersionControlHistoryPanel } from "./history-panel";
import type { VersionControlPanelProps } from "./types";
import { VersionControlWorktreePanel } from "./worktree-panel";

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
