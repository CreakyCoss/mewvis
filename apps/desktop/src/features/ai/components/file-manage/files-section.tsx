import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { FileText, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "@/features/pages/workspace/files-api";
import type { FileTreeNode } from "@/features/pages/chat/page-types";
import type {
  WorkspaceFile,
  WorkspaceFileEntry,
  WorkspaceVersionControlStatus,
} from "@/features/pages/chat/types";
import {
  buildFileTree,
  getParentDirectoryPaths,
} from "@/features/pages/chat/utils/file-tree";
import { EditPanel } from "./edit-panel";
import { FilesPanel } from "./files-panel";
import type { VersionFileStatusByPath } from "./types";

export type FilesSectionHandle = {
  refresh: () => Promise<void>;
  openActiveFile: (file: WorkspaceFile) => void;
  clearActiveFile: () => void;
};

type FilesSectionProps = {
  bind?: Ref<FilesSectionHandle>;
  workspacePath: string;
  workspaceKey: string;
  versionStatus: WorkspaceVersionControlStatus | null;
  discardingVersionFilePath: string;
  onDiscardVersionFileChanges: (path: string) => void | Promise<void>;
  onVersionChanged: () => void;
  onFilesChange?: (files: WorkspaceFileEntry[]) => void;
  onActiveFileChange?: (file: WorkspaceFile | null) => void;
};

const countSelectableFileTreeNodes = (nodes: FileTreeNode[]): number =>
  nodes.reduce((count, node) => (
    node.isDirectory
      ? count + countSelectableFileTreeNodes(node.children)
      : count + 1
  ), 0);

export const FilesSection = ({
  bind,
  workspacePath,
  workspaceKey,
  versionStatus,
  discardingVersionFilePath,
  onDiscardVersionFileChanges,
  onVersionChanged,
  onFilesChange,
  onActiveFileChange,
}: FilesSectionProps) => {
  const fileListRequestIdRef = useRef(0);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [, setFileError] = useState("");
  const [isFileEditOpen, setIsFileEditOpen] = useState(false);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [expandedFileTreePaths, setExpandedFileTreePaths] = useState<Set<string>>(() => new Set());
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileError, setNewFileError] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const selectableFileCount = useMemo(
    () => countSelectableFileTreeNodes(fileTree),
    [fileTree],
  );
  const versionFileStatusByPath = useMemo(() => {
    const statusByPath: VersionFileStatusByPath = new Map();
    versionStatus?.files.forEach((fileStatus) => {
      statusByPath.set(fileStatus.path, fileStatus);
    });
    return statusByPath;
  }, [versionStatus?.files]);

  const loadFiles = useCallback(async () => {
    const requestId = fileListRequestIdRef.current + 1;
    fileListRequestIdRef.current = requestId;
    setIsFilesLoading(true);
    setFileError("");

    try {
      const nextFiles = await listWorkspaceFiles(workspacePath);
      if (fileListRequestIdRef.current !== requestId) {
        return;
      }
      setFiles(nextFiles);
      onFilesChange?.(nextFiles);
    } catch (caught) {
      if (fileListRequestIdRef.current === requestId) {
        setFileError(String(caught));
      }
    } finally {
      if (fileListRequestIdRef.current === requestId) {
        setIsFilesLoading(false);
      }
    }
  }, [onFilesChange, workspacePath]);

  const openFile = useCallback(async (path: string) => {
    setFileError("");

    try {
      const file = await readWorkspaceFile(workspacePath, path);
      setActiveFile(file);
      setIsFileEditOpen(true);
    } catch (caught) {
      setFileError(String(caught));
    }
  }, [workspacePath]);

  const openActiveFile = useCallback((file: WorkspaceFile) => {
    setActiveFile(file);
    setIsFileEditOpen(true);
  }, []);

  const clearActiveFile = useCallback(() => {
    setActiveFile(null);
    setIsFileEditOpen(false);
  }, []);

  useImperativeHandle(bind, () => ({
    refresh: loadFiles,
    openActiveFile,
    clearActiveFile,
  }), [clearActiveFile, loadFiles, openActiveFile]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setActiveFile(null);
    setFileError("");
    setIsFileEditOpen(false);
    setExpandedFileTreePaths(new Set());
    setFiles([]);
    onFilesChange?.([]);
  }, [onFilesChange, workspaceKey]);

  useEffect(() => {
    onActiveFileChange?.(activeFile);
  }, [activeFile, onActiveFileChange]);

  useEffect(() => {
    setExpandedFileTreePaths((current) => {
      const next = new Set(current);
      files.forEach((file) => {
        if (file.isDirectory && !file.path.includes("/")) {
          next.add(file.path);
        }
      });
      if (activeFile?.path) {
        getParentDirectoryPaths(activeFile.path).forEach((path) => next.add(path));
      }
      return next;
    });
  }, [activeFile?.path, files]);

  const toggleFileTreeDirectory = useCallback((path: string) => {
    setExpandedFileTreePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const createNewFile = async () => {
    const path = newFilePath.trim();
    if (!path) {
      setNewFileError("文件路径不能为空");
      return;
    }

    setIsCreatingFile(true);
    setNewFileError("");
    try {
      const file = await writeWorkspaceFile(workspacePath, path, newFileContent);
      await loadFiles();
      await openFile(file.path);
      onVersionChanged();
      setNewFilePath("");
      setNewFileContent("");
      setIsNewFileDialogOpen(false);
    } catch (caught) {
      setNewFileError(String(caught));
    } finally {
      setIsCreatingFile(false);
    }
  };

  const handleFileSaved = useCallback(async (file: WorkspaceFile) => {
    openActiveFile(file);
    await loadFiles();
    onVersionChanged();
  }, [loadFiles, onVersionChanged, openActiveFile]);

  const handleFileDeleted = useCallback(async () => {
    clearActiveFile();
    await loadFiles();
    onVersionChanged();
  }, [clearActiveFile, loadFiles, onVersionChanged]);

  const fileVersionStatus =
    versionStatus?.files.find((file) => {
      const currentPath = activeFile?.path;
      return (
        currentPath &&
        (file.path === currentPath || file.previousPath === currentPath)
      );
    }) ?? null;
  const isFileDiscarding = fileVersionStatus
    ? discardingVersionFilePath === fileVersionStatus.path
    : false;

  const discardFileChanges = () => {
    if (fileVersionStatus) {
      void onDiscardVersionFileChanges(fileVersionStatus.path);
    }
  };

  return (
    <>
      <FilesPanel
        selectableFileCount={selectableFileCount}
        isFilesLoading={isFilesLoading}
        fileTree={fileTree}
        expandedFileTreePaths={expandedFileTreePaths}
        activeFile={activeFile}
        versionFileStatusByPath={versionFileStatusByPath}
        onRefreshFiles={() => {
          void loadFiles();
          onVersionChanged();
        }}
        onCreateFile={() => setIsNewFileDialogOpen(true)}
        onOpenFile={(path) => void openFile(path)}
        onToggleDirectory={toggleFileTreeDirectory}
      />

      <Dialog
        open={isNewFileDialogOpen}
        onOpenChange={(open) => {
          setIsNewFileDialogOpen(open);
          if (!open) {
            setNewFileError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新建文件</DialogTitle>
            <DialogDescription>
              在当前工作区中创建一个文件，并自动打开编辑弹窗。
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">文件路径</span>
              <Input
                value={newFilePath}
                placeholder="例如：章节/第一章.md"
                onChange={(event) => setNewFilePath(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void createNewFile();
                  }
                }}
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">初始内容</span>
              <Textarea
                value={newFileContent}
                placeholder="可留空"
                className="min-h-48 resize-y font-mono text-sm"
                onChange={(event) => setNewFileContent(event.currentTarget.value)}
              />
            </label>
            {newFileError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {newFileError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsNewFileDialogOpen(false)}
              disabled={isCreatingFile}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void createNewFile()}
              disabled={isCreatingFile || !newFilePath.trim()}
            >
              {isCreatingFile ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              创建文件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditPanel
        workspacePath={workspacePath}
        open={isFileEditOpen}
        activeFile={activeFile}
        isFileDiscarding={isFileDiscarding}
        fileVersionStatus={fileVersionStatus}
        onOpenChange={setIsFileEditOpen}
        onSaved={handleFileSaved}
        onDeleted={handleFileDeleted}
        onDiscardFileChanges={discardFileChanges}
      />
    </>
  );
};
