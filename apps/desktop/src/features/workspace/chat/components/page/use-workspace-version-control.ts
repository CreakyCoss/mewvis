import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
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
  writeWorkspaceFile,
} from "../../api";
import type { WorkspaceView } from "../../page-types";
import type {
  WorkspaceFile,
  WorkspaceVersion,
  WorkspaceVersionControlStatus,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
} from "../../types";

type LoadFiles = (historyBranchOverride?: string) => Promise<void>;
type LoadVersionControl = (historyBranchOverride?: string) => Promise<void>;

type UseWorkspaceVersionControlInput = {
  workspaceId: string;
  workspacePath: string;
  activeFile: WorkspaceFile | null;
  loadFiles: LoadFiles;
  loadVersionControlRef: MutableRefObject<LoadVersionControl | null>;
  setActiveFile: Dispatch<SetStateAction<WorkspaceFile | null>>;
  setFilePath: Dispatch<SetStateAction<string>>;
  setFileContent: Dispatch<SetStateAction<string>>;
  setFileError: Dispatch<SetStateAction<string>>;
  setFileViewMode: Dispatch<SetStateAction<"source" | "preview">>;
  setFilePreviewMode: Dispatch<SetStateAction<"closed" | "side" | "expanded">>;
  setWorkspaceView: Dispatch<SetStateAction<WorkspaceView>>;
};

export const useWorkspaceVersionControl = ({
  workspaceId,
  workspacePath,
  activeFile,
  loadFiles,
  loadVersionControlRef,
  setActiveFile,
  setFilePath,
  setFileContent,
  setFileError,
  setFileViewMode,
  setFilePreviewMode,
  setWorkspaceView,
}: UseWorkspaceVersionControlInput) => {
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

  const clearSelectedVersionSnapshot = useCallback(() => {
    setSelectedHistoryVersionId("");
    setVersionFiles([]);
    setSelectedVersionSnapshotFilePath("");
    setHistoryVersionDiff(null);
  }, []);

  const loadVersionControl = useCallback(async (historyBranchOverride?: string) => {
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
        status.currentRef ??
        status.branches.find((branch) => branch.isCurrent)?.name ??
        "";
      const availableHistoryBranchNames = new Set(
        status.branches.map((branch) => branch.name),
      );
      let historyBranchName =
        historyBranchOverride ?? selectedVersionHistoryBranchName;
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
        const nextVersions = await listWorkspaceVersions(
          workspacePath,
          historyBranchName || undefined,
        );
        if (versionControlRequestIdRef.current !== requestId) {
          return;
        }
        setVersions(nextVersions);
        if (
          selectedHistoryVersionId &&
          !nextVersions.some((version) => version.id === selectedHistoryVersionId)
        ) {
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
  }, [
    clearSelectedVersionSnapshot,
    selectedHistoryVersionId,
    selectedVersionHistoryBranchName,
    workspacePath,
  ]);
  loadVersionControlRef.current = loadVersionControl;

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
  }, [clearSelectedVersionSnapshot, workspaceId]);

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

  const selectVersionFile = useCallback(async (path: string) => {
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
  }, [workspacePath]);

  const selectHistoryVersionFile = useCallback(async (versionId: string, path: string) => {
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
  }, [workspacePath]);

  const selectHistoryVersion = useCallback(async (version: WorkspaceVersion) => {
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
  }, [selectHistoryVersionFile, workspacePath]);

  const restoreHistoryVersionFile = useCallback(async (file: WorkspaceVersionFileEntry) => {
    if (!historyVersionDiff) {
      setVersionError("请先选择一个历史文件");
      return;
    }

    const content =
      file.status === "deleted"
        ? historyVersionDiff.beforeContent
        : historyVersionDiff.afterContent;

    setRestoringVersionFilePath(file.path);
    setVersionError("");

    try {
      const restored = await writeWorkspaceFile(workspacePath, file.path, content);
      setActiveFile(restored);
      setFilePath(restored.path);
      setFileContent(restored.content);
      setFileViewMode("source");
      setFilePreviewMode("side");
      setWorkspaceView("chat");
      await loadFiles();
    } catch (caught) {
      setVersionError(String(caught));
    } finally {
      setRestoringVersionFilePath("");
    }
  }, [
    historyVersionDiff,
    loadFiles,
    setActiveFile,
    setFileContent,
    setFilePath,
    setFilePreviewMode,
    setFileViewMode,
    setWorkspaceView,
    workspacePath,
  ]);

  const selectVersionHistoryBranch = useCallback(async (branchName: string) => {
    const normalizedBranchName = branchName.trim();
    if (!normalizedBranchName || normalizedBranchName === selectedVersionHistoryBranchName) {
      return;
    }

    setSelectedVersionHistoryBranchName(normalizedBranchName);
    clearSelectedVersionSnapshot();
    setIsVersionHistoryLoading(true);
    setVersionError("");

    try {
      const nextVersions = await listWorkspaceVersions(
        workspacePath,
        normalizedBranchName,
      );
      setVersions(nextVersions);
    } catch (caught) {
      setVersions([]);
      setVersionError(String(caught));
    } finally {
      setIsVersionHistoryLoading(false);
    }
  }, [clearSelectedVersionSnapshot, selectedVersionHistoryBranchName, workspacePath]);

  const createVersion = useCallback(async (relativePaths: string[]) => {
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
      await loadFiles(historyBranchName || undefined);
    } catch (caught) {
      setVersionError(String(caught));
    } finally {
      setIsCreatingVersion(false);
    }
  }, [loadFiles, versionMessage, workspacePath]);

  const discardVersionFileChanges = useCallback(async (
    relativePath: string,
    options?: { skipConfirmation?: boolean },
  ) => {
    const normalizedPath = relativePath.trim();
    if (!normalizedPath) {
      return;
    }

    const statusFile = versionStatus?.files.find(
      (file) =>
        file.path === normalizedPath || file.previousPath === normalizedPath,
    );
    const isNewFile =
      statusFile?.status === "added" || statusFile?.status === "untracked";
    if (!options?.skipConfirmation) {
      const confirmed = window.confirm(
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
      const status = await discardWorkspaceVersionFileChanges(
        workspacePath,
        normalizedPath,
      );
      setVersionStatus(status);
      setSelectedVersionFilePath("");
      setVersionDiff(null);

      await loadFiles(selectedVersionHistoryBranchName || undefined);

      if (
        activeFile &&
        (activeFile.path === normalizedPath ||
          statusFile?.previousPath === activeFile.path)
      ) {
        try {
          const refreshedFile = await readWorkspaceFile(workspacePath, activeFile.path);
          setActiveFile(refreshedFile);
          setFilePath(refreshedFile.path);
          setFileContent(refreshedFile.content);
        } catch {
          setActiveFile(null);
          setFilePath("");
          setFileContent("");
          setFileViewMode("source");
          setFilePreviewMode("closed");
        }
      }
    } catch (caught) {
      setVersionError(String(caught));
    } finally {
      setDiscardingVersionFilePath("");
    }
  }, [
    activeFile,
    loadFiles,
    selectedVersionHistoryBranchName,
    setActiveFile,
    setFileContent,
    setFilePath,
    setFilePreviewMode,
    setFileViewMode,
    versionStatus?.files,
    workspacePath,
  ]);

  const createVersionBranch = useCallback(async (branchName: string) => {
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
  }, [clearSelectedVersionSnapshot, loadVersionControl, workspacePath]);

  const switchVersionBranch = useCallback(async (branchName: string) => {
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
      setActiveFile(null);
      setFilePath("");
      setFileContent("");
      setFileError("");
      setFilePreviewMode("closed");
      setSelectedVersionFilePath("");
      setVersionDiff(null);
      clearSelectedVersionSnapshot();
      await loadFiles(normalizedBranchName);
    } catch (caught) {
      setVersionError(String(caught));
    } finally {
      setSwitchingVersionBranchName("");
    }
  }, [
    clearSelectedVersionSnapshot,
    loadFiles,
    setActiveFile,
    setFileContent,
    setFileError,
    setFilePath,
    setFilePreviewMode,
    versionStatus?.currentRef,
    workspacePath,
  ]);

  return {
    versionStatus,
    versions,
    versionDiff,
    selectedVersionFilePath,
    selectedHistoryVersionId,
    selectedVersionHistoryBranchName,
    versionFiles,
    selectedVersionSnapshotFilePath,
    historyVersionDiff,
    versionMessage,
    setVersionMessage,
    versionError,
    isVersionControlLoading,
    isVersionControlInitializing,
    isVersionDiffLoading,
    isVersionFilesLoading,
    isVersionFileContentLoading,
    isCreatingVersion,
    isVersionHistoryLoading,
    restoringVersionFilePath,
    isCreatingVersionBranch,
    switchingVersionBranchName,
    discardingVersionFilePath,
    loadVersionControl,
    initializeVersionControl,
    selectVersionFile,
    selectHistoryVersion,
    selectVersionHistoryBranch,
    selectHistoryVersionFile,
    createVersion,
    discardVersionFileChanges,
    restoreHistoryVersionFile,
    createVersionBranch,
    switchVersionBranch,
  };
};
