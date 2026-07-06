import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronDown, Folder, GitBranch, History, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  createWorkspaceVersion,
  createWorkspaceVersionBranch,
  discardWorkspaceVersionFileChanges,
  getWorkspaceVersionCommitFileDiff,
  getWorkspaceVersionFileDiff,
  getWorkspaceVersionControlStatus,
  initializeWorkspaceVersionControl,
  listWorkspaceVersionFiles,
  listWorkspaceVersions,
  readWorkspaceFile,
  switchWorkspaceVersionBranch,
  type WorkspaceFile,
  type WorkspaceVersion,
  type WorkspaceVersionControlStatus,
  type WorkspaceVersionFileDiff,
  type WorkspaceVersionFileEntry,
  writeWorkspaceFile,
} from "@/features/pages/workspace/files-api";
import { cn } from "@/lib/utils";
import type { FileManageTool } from "../types";
import { VersionControlHistoryPanel } from "./history-panel";
import { VersionControlWorktreePanel } from "./worktree-panel";

export type VersionControlSectionHandle = {
  refresh: () => void;
  discardFileChanges: (relativePath: string, options?: { skipConfirmation?: boolean }) => Promise<void>;
};

type VersionControlSectionProps = {
  bind?: Ref<VersionControlSectionHandle>;
  workspacePath: string;
  workspaceKey: string;
  activeTool: FileManageTool;
  activeFile: WorkspaceFile | null;
  children: ReactNode;
  onToolChange: (tool: FileManageTool) => void;
  onStatusChange: (status: WorkspaceVersionControlStatus | null) => void;
  onDiscardingFilePathChange: (path: string) => void;
  onFilesRefresh: () => Promise<void>;
  onActiveFileOpened: (file: WorkspaceFile) => void;
  onActiveFileCleared: () => void;
};

type PendingDiscardConfirmation = {
  message: string;
  resolve: (confirmed: boolean) => void;
};

const toolItems: Array<{
  value: FileManageTool;
  label: string;
  icon: typeof Folder;
}> = [
  { value: "files", label: "文件", icon: Folder },
  { value: "version", label: "版本", icon: GitBranch },
  { value: "history", label: "历史", icon: History },
];

export const VersionControlSection = ({
  bind,
  workspacePath,
  workspaceKey,
  activeTool,
  activeFile,
  children,
  onToolChange,
  onStatusChange,
  onDiscardingFilePathChange,
  onFilesRefresh,
  onActiveFileOpened,
  onActiveFileCleared,
}: VersionControlSectionProps) => {
  const versionControlRequestIdRef = useRef(0);
  const [versionStatus, setVersionStatus] = useState<WorkspaceVersionControlStatus | null>(null);
  const [versions, setVersions] = useState<WorkspaceVersion[]>([]);
  const [versionDiff, setVersionDiff] = useState<WorkspaceVersionFileDiff | null>(null);
  const [selectedVersionFilePath, setSelectedVersionFilePath] = useState("");
  const [selectedHistoryVersionId, setSelectedHistoryVersionId] = useState("");
  const [selectedVersionHistoryBranchName, setSelectedVersionHistoryBranchName] = useState("");
  const [versionFiles, setVersionFiles] = useState<WorkspaceVersionFileEntry[]>([]);
  const [selectedVersionSnapshotFilePath, setSelectedVersionSnapshotFilePath] = useState("");
  const [historyVersionDiff, setHistoryVersionDiff] = useState<WorkspaceVersionFileDiff | null>(null);
  const [versionMessage, setVersionMessage] = useState("");
  const [versionError, setVersionError] = useState("");
  const [isVersionControlLoading, setIsVersionControlLoading] = useState(false);
  const [isVersionControlInitializing, setIsVersionControlInitializing] = useState(false);
  const [isVersionDiffLoading, setIsVersionDiffLoading] = useState(false);
  const [isVersionFilesLoading, setIsVersionFilesLoading] = useState(false);
  const [isVersionFileContentLoading, setIsVersionFileContentLoading] = useState(false);
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isVersionHistoryLoading, setIsVersionHistoryLoading] = useState(false);
  const [restoringVersionFilePath, setRestoringVersionFilePath] = useState("");
  const [isCreatingVersionBranch, setIsCreatingVersionBranch] = useState(false);
  const [switchingVersionBranchName, setSwitchingVersionBranchName] = useState("");
  const [discardingVersionFilePath, setDiscardingVersionFilePath] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [pendingDiscardConfirmation, setPendingDiscardConfirmation] = useState<PendingDiscardConfirmation | null>(null);

  const requestDiscardConfirmation = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        setPendingDiscardConfirmation({ message, resolve });
      }),
    [],
  );

  const resolveDiscardConfirmation = useCallback((confirmed: boolean) => {
    setPendingDiscardConfirmation((pending) => {
      pending?.resolve(confirmed);
      return null;
    });
  }, []);

  const clearSelectedVersionSnapshot = useCallback(() => {
    setSelectedHistoryVersionId("");
    setVersionFiles([]);
    setSelectedVersionSnapshotFilePath("");
    setHistoryVersionDiff(null);
  }, []);

  const loadVersionControl = useCallback(
    async (historyBranchOverride?: string) => {
      const requestId = versionControlRequestIdRef.current + 1;
      versionControlRequestIdRef.current = requestId;
      setIsVersionControlLoading(true);
      setVersionError("");

      try {
        const status = await getWorkspaceVersionControlStatus(workspacePath);
        if (versionControlRequestIdRef.current !== requestId) {
          return;
        }
        setVersionStatus(status);
        setSelectedVersionFilePath((currentPath) => {
          if (!currentPath || status.files.some((file) => file.path === currentPath)) {
            return currentPath;
          }
          setVersionDiff(null);
          return "";
        });

        if (!status.isEnabled) {
          setVersions([]);
          setVersionDiff(null);
          setSelectedVersionHistoryBranchName("");
          clearSelectedVersionSnapshot();
          return;
        }

        const fallbackHistoryBranchName =
          status.currentRef ?? status.branches.find((branch) => branch.isCurrent)?.name ?? "";
        const availableHistoryBranchNames = new Set(status.branches.map((branch) => branch.name));
        let historyBranchName = historyBranchOverride ?? selectedVersionHistoryBranchName;
        if (!historyBranchName) {
          historyBranchName = fallbackHistoryBranchName;
        }
        if (historyBranchName && !availableHistoryBranchNames.has(historyBranchName)) {
          historyBranchName = fallbackHistoryBranchName;
        }
        if (historyBranchName !== selectedVersionHistoryBranchName) {
          setSelectedVersionHistoryBranchName(historyBranchName);
          clearSelectedVersionSnapshot();
        }

        setIsVersionHistoryLoading(true);
        try {
          const nextVersions = await listWorkspaceVersions(workspacePath, historyBranchName || undefined);
          if (versionControlRequestIdRef.current !== requestId) {
            return;
          }
          setVersions(nextVersions);
          if (selectedHistoryVersionId && !nextVersions.some((version) => version.id === selectedHistoryVersionId)) {
            clearSelectedVersionSnapshot();
          }
        } finally {
          if (versionControlRequestIdRef.current === requestId) {
            setIsVersionHistoryLoading(false);
          }
        }
      } catch (caught) {
        if (versionControlRequestIdRef.current === requestId) {
          setVersionError(String(caught));
        }
      } finally {
        if (versionControlRequestIdRef.current === requestId) {
          setIsVersionControlLoading(false);
          setIsVersionHistoryLoading(false);
        }
      }
    },
    [clearSelectedVersionSnapshot, selectedHistoryVersionId, selectedVersionHistoryBranchName, workspacePath],
  );

  useEffect(() => {
    setVersionStatus(null);
    setVersions([]);
    setVersionDiff(null);
    setSelectedVersionFilePath("");
    setVersionMessage("");
    setVersionError("");
    setRestoringVersionFilePath("");
    setIsCreatingVersionBranch(false);
    setSwitchingVersionBranchName("");
    setDiscardingVersionFilePath("");
    clearSelectedVersionSnapshot();
  }, [clearSelectedVersionSnapshot, workspaceKey]);

  useEffect(() => {
    void loadVersionControl();
  }, [workspaceKey, workspacePath]);

  useEffect(() => {
    onStatusChange(versionStatus);
  }, [onStatusChange, versionStatus]);

  useEffect(() => {
    onDiscardingFilePathChange(discardingVersionFilePath);
  }, [discardingVersionFilePath, onDiscardingFilePathChange]);

  const initializeVersionControl = useCallback(async () => {
    setIsVersionControlInitializing(true);
    setVersionError("");

    try {
      const status = await initializeWorkspaceVersionControl(workspacePath);
      setVersionStatus(status);
      if (!status.hasVersions && status.hasChanges && !versionMessage.trim()) {
        setVersionMessage("初始化工作区版本");
      }
      await loadVersionControl();
    } catch (caught) {
      setVersionError(String(caught));
    } finally {
      setIsVersionControlInitializing(false);
    }
  }, [loadVersionControl, versionMessage, workspacePath]);

  const selectVersionFile = useCallback(
    async (path: string) => {
      setSelectedVersionFilePath(path);
      setIsVersionDiffLoading(true);
      setVersionError("");

      try {
        const diff = await getWorkspaceVersionFileDiff(workspacePath, path);
        setVersionDiff(diff);
      } catch (caught) {
        setVersionDiff(null);
        setVersionError(String(caught));
      } finally {
        setIsVersionDiffLoading(false);
      }
    },
    [workspacePath],
  );

  const selectHistoryVersionFile = useCallback(
    async (versionId: string, path: string) => {
      setSelectedVersionSnapshotFilePath(path);
      setIsVersionFileContentLoading(true);
      setVersionError("");

      try {
        const diff = await getWorkspaceVersionCommitFileDiff(workspacePath, versionId, path);
        setHistoryVersionDiff(diff);
      } catch (caught) {
        setHistoryVersionDiff(null);
        setVersionError(String(caught));
      } finally {
        setIsVersionFileContentLoading(false);
      }
    },
    [workspacePath],
  );

  const selectHistoryVersion = useCallback(
    async (version: WorkspaceVersion) => {
      setSelectedHistoryVersionId(version.id);
      setVersionFiles([]);
      setSelectedVersionSnapshotFilePath("");
      setHistoryVersionDiff(null);
      setIsVersionFilesLoading(true);
      setVersionError("");

      try {
        const filesInVersion = await listWorkspaceVersionFiles(workspacePath, version.id);
        setVersionFiles(filesInVersion);
        if (filesInVersion.length > 0) {
          await selectHistoryVersionFile(version.id, filesInVersion[0].path);
        }
      } catch (caught) {
        setVersionFiles([]);
        setVersionError(String(caught));
      } finally {
        setIsVersionFilesLoading(false);
      }
    },
    [selectHistoryVersionFile, workspacePath],
  );

  const restoreHistoryVersionFile = useCallback(
    async (file: WorkspaceVersionFileEntry) => {
      if (!historyVersionDiff) {
        setVersionError("请先选择一个历史文件");
        return;
      }

      const content = file.status === "deleted" ? historyVersionDiff.beforeContent : historyVersionDiff.afterContent;

      setRestoringVersionFilePath(file.path);
      setVersionError("");

      try {
        const restored = await writeWorkspaceFile(workspacePath, file.path, content);
        onActiveFileOpened(restored);
        await onFilesRefresh();
        await loadVersionControl();
      } catch (caught) {
        setVersionError(String(caught));
      } finally {
        setRestoringVersionFilePath("");
      }
    },
    [historyVersionDiff, loadVersionControl, onActiveFileOpened, onFilesRefresh, workspacePath],
  );

  const selectVersionHistoryBranch = useCallback(
    async (branchName: string) => {
      const normalizedBranchName = branchName.trim();
      if (!normalizedBranchName || normalizedBranchName === selectedVersionHistoryBranchName) {
        return;
      }

      setSelectedVersionHistoryBranchName(normalizedBranchName);
      clearSelectedVersionSnapshot();
      setIsVersionHistoryLoading(true);
      setVersionError("");

      try {
        const nextVersions = await listWorkspaceVersions(workspacePath, normalizedBranchName);
        setVersions(nextVersions);
      } catch (caught) {
        setVersions([]);
        setVersionError(String(caught));
      } finally {
        setIsVersionHistoryLoading(false);
      }
    },
    [clearSelectedVersionSnapshot, selectedVersionHistoryBranchName, workspacePath],
  );

  const createVersion = useCallback(
    async (relativePaths: string[]) => {
      const message = versionMessage.trim();
      if (!message) {
        setVersionError("提交说明不能为空");
        return;
      }
      if (relativePaths.length === 0) {
        setVersionError("请选择至少一个要提交的文件");
        return;
      }

      setIsCreatingVersion(true);
      setVersionError("");

      try {
        const result = await createWorkspaceVersion(workspacePath, message, relativePaths);
        setVersionStatus(result.status);
        const historyBranchName = result.status.currentRef ?? "";
        setSelectedVersionHistoryBranchName(historyBranchName);
        setVersionMessage("");
        setSelectedVersionFilePath("");
        setVersionDiff(null);
        await onFilesRefresh();
      } catch (caught) {
        setVersionError(String(caught));
      } finally {
        setIsCreatingVersion(false);
      }
    },
    [onFilesRefresh, versionMessage, workspacePath],
  );

  const discardVersionFileChanges = useCallback(
    async (relativePath: string, options?: { skipConfirmation?: boolean }) => {
      const normalizedPath = relativePath.trim();
      if (!normalizedPath) {
        return;
      }

      const statusFile = versionStatus?.files.find(
        (file) => file.path === normalizedPath || file.previousPath === normalizedPath,
      );
      const isNewFile = statusFile?.status === "added" || statusFile?.status === "untracked";
      if (!options?.skipConfirmation) {
        const confirmed = await requestDiscardConfirmation(
          isNewFile
            ? `撤销 ${normalizedPath} 的未提交新增？该文件会被删除。`
            : `撤销 ${normalizedPath} 的未提交修改？文件会恢复到当前提交。`,
        );
        if (!confirmed) {
          return;
        }
      }

      setDiscardingVersionFilePath(normalizedPath);
      setVersionError("");

      try {
        const status = await discardWorkspaceVersionFileChanges(workspacePath, normalizedPath);
        setVersionStatus(status);
        setSelectedVersionFilePath("");
        setVersionDiff(null);

        await onFilesRefresh();

        if (activeFile && (activeFile.path === normalizedPath || statusFile?.previousPath === activeFile.path)) {
          try {
            const refreshedFile = await readWorkspaceFile(workspacePath, activeFile.path);
            onActiveFileOpened(refreshedFile);
          } catch {
            onActiveFileCleared();
          }
        }
      } catch (caught) {
        setVersionError(String(caught));
      } finally {
        setDiscardingVersionFilePath("");
      }
    },
    [
      activeFile,
      onActiveFileCleared,
      onActiveFileOpened,
      onFilesRefresh,
      requestDiscardConfirmation,
      versionStatus?.files,
      workspacePath,
    ],
  );

  const createVersionBranch = useCallback(
    async (branchName: string) => {
      const normalizedBranchName = branchName.trim();
      if (!normalizedBranchName) {
        setVersionError("分支名称不能为空");
        return;
      }

      setIsCreatingVersionBranch(true);
      setVersionError("");

      try {
        const status = await createWorkspaceVersionBranch(workspacePath, normalizedBranchName);
        setVersionStatus(status);
        setSelectedVersionHistoryBranchName(normalizedBranchName);
        setSelectedVersionFilePath("");
        setVersionDiff(null);
        clearSelectedVersionSnapshot();
        await loadVersionControl(normalizedBranchName);
      } catch (caught) {
        setVersionError(String(caught));
      } finally {
        setIsCreatingVersionBranch(false);
      }
    },
    [clearSelectedVersionSnapshot, loadVersionControl, workspacePath],
  );

  const switchVersionBranch = useCallback(
    async (branchName: string) => {
      const normalizedBranchName = branchName.trim();
      if (!normalizedBranchName || normalizedBranchName === versionStatus?.currentRef) {
        return;
      }

      setSwitchingVersionBranchName(normalizedBranchName);
      setVersionError("");

      try {
        const status = await switchWorkspaceVersionBranch(workspacePath, normalizedBranchName);
        setVersionStatus(status);
        setSelectedVersionHistoryBranchName(normalizedBranchName);
        onActiveFileCleared();
        setSelectedVersionFilePath("");
        setVersionDiff(null);
        clearSelectedVersionSnapshot();
        await onFilesRefresh();
      } catch (caught) {
        setVersionError(String(caught));
      } finally {
        setSwitchingVersionBranchName("");
      }
    },
    [clearSelectedVersionSnapshot, onActiveFileCleared, onFilesRefresh, versionStatus?.currentRef, workspacePath],
  );

  useImperativeHandle(
    bind,
    () => ({
      refresh: () => {
        void loadVersionControl();
      },
      discardFileChanges: discardVersionFileChanges,
    }),
    [discardVersionFileChanges, loadVersionControl],
  );

  const isVersionControlEnabled = versionStatus?.isEnabled ?? false;
  const isVersionStatusPending = !versionStatus && isVersionControlLoading;
  const currentBranchName =
    versionStatus?.branches.find((branch) => branch.isCurrent)?.name ?? versionStatus?.currentRef ?? "";
  const canSwitchBranch =
    isVersionControlEnabled &&
    !versionStatus?.hasChanges &&
    !switchingVersionBranchName &&
    !isVersionControlLoading &&
    (versionStatus?.branches.length ?? 0) > 1;
  const canCreateBranch =
    isVersionControlEnabled &&
    Boolean(versionStatus?.hasVersions) &&
    newBranchName.trim().length > 0 &&
    !isCreatingVersionBranch;

  const createBranch = () => {
    const branchName = newBranchName.trim();
    if (!branchName) {
      return;
    }
    void createVersionBranch(branchName);
    setNewBranchName("");
  };

  const versionMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 max-w-[13rem] min-w-0 rounded-md bg-background/70 px-2 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            isVersionControlEnabled && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
          title="版本管理"
          aria-label="版本管理"
        >
          {isVersionControlLoading || isVersionControlInitializing ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <GitBranch className="size-3.5" />
          )}
          <span className="min-w-0 truncate">{isVersionControlEnabled ? currentBranchName || "HEAD" : "版本"}</span>
          {isVersionControlEnabled && versionStatus?.head && (
            <span className="hidden shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground sm:inline">
              {versionStatus.head}
            </span>
          )}
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[100] w-80">
        <DropdownMenuLabel>版本管理</DropdownMenuLabel>
        {!isVersionControlEnabled ? (
          <>
            <DropdownMenuItem disabled className="flex-col items-start gap-1">
              <span className="font-medium">{isVersionStatusPending ? "正在读取版本状态" : "未初始化版本仓库"}</span>
              <span className="text-xs text-muted-foreground">
                {isVersionStatusPending ? "正在读取版本状态。" : "初始化后即可在本地提交、切换和回退。"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void initializeVersionControl()}
              disabled={isVersionControlInitializing || isVersionControlLoading}
            >
              {isVersionControlInitializing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <GitBranch className="size-4" />
              )}
              初始化版本管理
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled className="flex-col items-start gap-1">
              <span className="max-w-full truncate font-medium">当前分支：{currentBranchName || "HEAD"}</span>
              {versionStatus?.head ? (
                <span className="font-mono text-[11px] text-muted-foreground">当前提交 {versionStatus.head}</span>
              ) : (
                <span className="text-xs text-muted-foreground">还没有提交</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="data-disabled:pointer-events-none data-disabled:opacity-50"
                disabled={(versionStatus?.branches.length ?? 0) <= 1}
              >
                <GitBranch className="size-4" />
                切换分支
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] w-64">
                <DropdownMenuLabel>选择分支</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={currentBranchName}
                  onValueChange={(branchName) => {
                    if (branchName !== currentBranchName && canSwitchBranch) {
                      void switchVersionBranch(branchName);
                    }
                  }}
                >
                  {(versionStatus?.branches ?? []).map((branch) => (
                    <DropdownMenuRadioItem
                      key={branch.name}
                      value={branch.name}
                      disabled={branch.isCurrent || !canSwitchBranch}
                      className="min-w-0"
                    >
                      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                      {switchingVersionBranchName === branch.name ? (
                        <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                      ) : branch.shortHead ? (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{branch.shortHead}</span>
                      ) : null}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {versionStatus?.hasChanges && (versionStatus?.branches.length ?? 0) > 1 && (
                  <div className="px-2 py-1.5 text-xs leading-4 text-muted-foreground">
                    有未提交变更时不能切换分支。
                  </div>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                className="data-disabled:pointer-events-none data-disabled:opacity-50"
                disabled={!versionStatus?.hasVersions}
              >
                <Plus className="size-4" />
                新建分支
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] w-72">
                <DropdownMenuLabel>新建并切换分支</DropdownMenuLabel>
                <div className="flex min-w-0 gap-1.5 p-2 pt-1">
                  <Input
                    value={newBranchName}
                    placeholder={versionStatus?.hasVersions ? "输入分支名称" : "先完成一次提交"}
                    className="h-8 min-w-0"
                    onChange={(event) => setNewBranchName(event.target.value)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter" && canCreateBranch) {
                        event.preventDefault();
                        createBranch();
                      }
                    }}
                    disabled={!versionStatus?.hasVersions || isCreatingVersionBranch}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    title="新建并切换分支"
                    onClick={createBranch}
                    disabled={!canCreateBranch}
                  >
                    {isCreatingVersionBranch ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </Button>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void loadVersionControl()}
              disabled={isVersionControlLoading || isVersionControlInitializing}
            >
              {isVersionControlLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              刷新版本状态
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
    onRefreshVersionControl: () => void loadVersionControl(),
    onSelectVersionFile: (path: string) => void selectVersionFile(path),
    onSelectHistoryVersion: (version: WorkspaceVersion) => void selectHistoryVersion(version),
    onSelectVersionHistoryBranch: (branchName: string) => void selectVersionHistoryBranch(branchName),
    onSelectHistoryVersionFile: (versionId: string, path: string) => void selectHistoryVersionFile(versionId, path),
    onVersionMessageChange: setVersionMessage,
    onCreateVersion: (relativePaths: string[]) => void createVersion(relativePaths),
    onDiscardVersionFileChanges: (path: string, options?: { skipConfirmation?: boolean }) =>
      void discardVersionFileChanges(path, options),
    onRestoreHistoryVersionFile: (file: WorkspaceVersionFileEntry) => void restoreHistoryVersionFile(file),
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/55 px-3 py-2.5">
        <div className="min-w-0">{versionMenu}</div>
        <ToggleGroup
          type="single"
          value={activeTool}
          onValueChange={(value) => {
            if (value) {
              onToolChange(value as FileManageTool);
            }
          }}
          className="shrink-0 rounded-md bg-muted/60 p-0.5"
          aria-label="文件管理视图"
        >
          {toolItems.map((item) => {
            const Icon = item.icon;
            return (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                size="sm"
                className="size-7 rounded-sm p-0 data-[state=on]:bg-background data-[state=on]:shadow-xs"
                aria-label={item.label}
                title={item.label}
              >
                <Icon className="size-3.5" />
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div
        className={["min-h-0 min-w-0 flex-1 flex-col overflow-hidden", activeTool === "files" ? "flex" : "hidden"].join(
          " ",
        )}
      >
        {children}
      </div>
      <div
        className={["min-h-0 min-w-0 flex-1 overflow-hidden p-3", activeTool === "version" ? "block" : "hidden"].join(
          " ",
        )}
      >
        <VersionControlWorktreePanel {...versionPanelProps} />
      </div>
      <ScrollArea
        className={["min-h-0 min-w-0 flex-1 overflow-hidden", activeTool === "history" ? "block" : "hidden"].join(" ")}
      >
        <div className="min-w-0 overflow-hidden p-3">
          <VersionControlHistoryPanel {...versionPanelProps} />
        </div>
      </ScrollArea>

      <Dialog
        open={Boolean(pendingDiscardConfirmation)}
        onOpenChange={(open) => {
          if (!open) {
            resolveDiscardConfirmation(false);
          }
        }}
      >
        {pendingDiscardConfirmation && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>撤销未提交变更</DialogTitle>
              <DialogDescription>{pendingDiscardConfirmation.message}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => resolveDiscardConfirmation(false)}>
                取消
              </Button>
              <Button type="button" variant="destructive" onClick={() => resolveDiscardConfirmation(true)}>
                确认撤销
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};
