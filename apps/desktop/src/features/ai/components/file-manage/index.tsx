import { useCallback, useImperativeHandle, useRef, useState, type Ref } from "react";
import type {
  WorkspaceFile,
  WorkspaceFileEntry,
  WorkspaceVersionControlStatus,
} from "@/features/pages/workspace/files-api";
import { FilesSection, type FilesSectionHandle } from "./files-section";
import type { FileManageTool } from "./types";
import { VersionControlSection, type VersionControlSectionHandle } from "./version-control/section";

export type FileManageHandle = {
  refresh: () => void;
  openTool: (tool: FileManageTool) => void;
};

export type FileManageProps = {
  bind?: Ref<FileManageHandle>;
  workspacePath: string;
  workspaceKey?: string;
  onFilesChange?: (files: WorkspaceFileEntry[]) => void;
  onActiveFileChange?: (file: WorkspaceFile | null) => void;
};

export const FileManage = ({
  bind,
  workspacePath,
  workspaceKey = workspacePath,
  onFilesChange,
  onActiveFileChange,
}: FileManageProps) => {
  const filesSectionRef = useRef<FilesSectionHandle>(null);
  const versionControlRef = useRef<VersionControlSectionHandle>(null);
  const [activeTool, setActiveTool] = useState<FileManageTool>("files");
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [versionStatus, setVersionStatus] = useState<WorkspaceVersionControlStatus | null>(null);
  const [discardingVersionFilePath, setDiscardingVersionFilePath] = useState("");

  const refreshFiles = useCallback(async () => {
    await filesSectionRef.current?.refresh();
  }, []);

  const refreshVersionControl = useCallback(() => {
    versionControlRef.current?.refresh();
  }, []);

  const refresh = useCallback(() => {
    void refreshFiles();
    refreshVersionControl();
  }, [refreshFiles, refreshVersionControl]);

  const handleActiveFileChange = useCallback(
    (file: WorkspaceFile | null) => {
      setActiveFile(file);
      onActiveFileChange?.(file);
    },
    [onActiveFileChange],
  );

  const openActiveFile = useCallback((file: WorkspaceFile) => {
    filesSectionRef.current?.openActiveFile(file);
  }, []);

  const clearActiveFile = useCallback(() => {
    filesSectionRef.current?.clearActiveFile();
  }, []);

  const discardVersionFileChanges = useCallback(
    (path: string, options?: { skipConfirmation?: boolean }) =>
      versionControlRef.current?.discardFileChanges(path, options),
    [],
  );

  useImperativeHandle(
    bind,
    () => ({
      refresh,
      openTool: setActiveTool,
    }),
    [refresh],
  );

  return (
    <aside className="flex min-w-0 w-[clamp(240px,20vw,340px)] shrink-0 overflow-hidden bg-background/90 text-foreground shadow-[-8px_0_28px_-30px_rgb(15_23_42_/_0.38)] backdrop-blur">
      <VersionControlSection
        bind={versionControlRef}
        workspacePath={workspacePath}
        workspaceKey={workspaceKey}
        activeTool={activeTool}
        activeFile={activeFile}
        onToolChange={setActiveTool}
        onStatusChange={setVersionStatus}
        onDiscardingFilePathChange={setDiscardingVersionFilePath}
        onFilesRefresh={refreshFiles}
        onActiveFileOpened={openActiveFile}
        onActiveFileCleared={clearActiveFile}
      >
        <FilesSection
          bind={filesSectionRef}
          workspacePath={workspacePath}
          workspaceKey={workspaceKey}
          versionStatus={versionStatus}
          discardingVersionFilePath={discardingVersionFilePath}
          onDiscardVersionFileChanges={discardVersionFileChanges}
          onVersionChanged={refreshVersionControl}
          onFilesChange={onFilesChange}
          onActiveFileChange={handleActiveFileChange}
        />
      </VersionControlSection>
    </aside>
  );
};
