import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  deleteWorkspaceFile,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../../api";
import type { WorkspaceFile, WorkspaceFileEntry } from "../../types";
import { buildFileTree, getParentDirectoryPaths } from "../../utils/file-tree";
import { isMarkdownPath } from "../../utils/sessions";
import type { WorkspaceView } from "../../page-types";

type LoadVersionControl = (historyBranchOverride?: string) => Promise<void>;

type UseFileWorkbenchInput = {
  workspaceId: string;
  workspacePath: string;
  loadVersionControlRef: MutableRefObject<LoadVersionControl | null>;
  onWorkspaceViewChange: Dispatch<SetStateAction<WorkspaceView>>;
};

export const useFileWorkbench = ({
  workspaceId,
  workspacePath,
  loadVersionControlRef,
  onWorkspaceViewChange,
}: UseFileWorkbenchInput) => {
  const fileListRequestIdRef = useRef(0);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileError, setFileError] = useState("");
  const [fileViewMode, setFileViewMode] = useState<"source" | "preview">("source");
  const [filePreviewMode, setFilePreviewMode] = useState<"closed" | "side" | "expanded">("closed");
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [expandedFileTreePaths, setExpandedFileTreePaths] = useState<Set<string>>(() => new Set());
  const [isFileSaving, setIsFileSaving] = useState(false);
  const [isFileDeleting, setIsFileDeleting] = useState(false);

  const selectableFiles = useMemo(
    () => files.filter((file) => !file.isDirectory),
    [files],
  );
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const isMarkdownFile = useMemo(
    () => isMarkdownPath(filePath),
    [filePath],
  );

  const loadFiles = useCallback(async (historyBranchOverride?: string) => {
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
      void loadVersionControlRef.current?.(historyBranchOverride);
    } catch (caught) {
      if (fileListRequestIdRef.current === requestId) {
        setFileError(String(caught));
      }
    } finally {
      if (fileListRequestIdRef.current === requestId) {
        setIsFilesLoading(false);
      }
    }
  }, [loadVersionControlRef, workspacePath]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setFileError("");
    setFileViewMode("source");
    setFilePreviewMode("closed");
    setExpandedFileTreePaths(new Set());
  }, [workspaceId]);

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

  useEffect(() => {
    if (!isMarkdownFile && fileViewMode === "preview") {
      setFileViewMode("source");
    }
  }, [fileViewMode, isMarkdownFile]);

  const openFile = useCallback(async (path: string) => {
    setFileError("");

    try {
      const file = await readWorkspaceFile(workspacePath, path);
      setActiveFile(file);
      setFilePath(file.path);
      setFileContent(file.content);
      setFilePreviewMode("side");
      onWorkspaceViewChange("chat");
    } catch (caught) {
      setFileError(String(caught));
    }
  }, [onWorkspaceViewChange, workspacePath]);

  const prepareNewFile = useCallback(() => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setFileError("");
    setFileViewMode("source");
    setFilePreviewMode("side");
    onWorkspaceViewChange("chat");
  }, [onWorkspaceViewChange]);

  const saveFile = useCallback(async () => {
    setIsFileSaving(true);
    setFileError("");

    try {
      const saved = await writeWorkspaceFile(workspacePath, filePath, fileContent);
      setActiveFile(saved);
      setFilePath(saved.path);
      setFileContent(saved.content);
      await loadFiles();
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFileSaving(false);
    }
  }, [fileContent, filePath, loadFiles, workspacePath]);

  const deleteFile = useCallback(async () => {
    const targetPath = activeFile?.path;
    if (!targetPath) {
      return;
    }

    setIsFileDeleting(true);
    setFileError("");

    try {
      await deleteWorkspaceFile(workspacePath, targetPath);
      setActiveFile(null);
      setFilePath("");
      setFileContent("");
      setFileViewMode("source");
      await loadFiles();
    } catch (caught) {
      setFileError(String(caught));
    } finally {
      setIsFileDeleting(false);
    }
  }, [activeFile?.path, loadFiles, workspacePath]);

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

  return {
    files,
    setFiles,
    activeFile,
    setActiveFile,
    filePath,
    setFilePath,
    fileContent,
    setFileContent,
    fileError,
    setFileError,
    fileViewMode,
    setFileViewMode,
    filePreviewMode,
    setFilePreviewMode,
    isFilesLoading,
    expandedFileTreePaths,
    isFileSaving,
    isFileDeleting,
    selectableFiles,
    fileTree,
    isMarkdownFile,
    loadFiles,
    openFile,
    prepareNewFile,
    saveFile,
    deleteFile,
    toggleFileTreeDirectory,
  };
};
