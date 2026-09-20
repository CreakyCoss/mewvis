import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "design-system/components/ui/alert-dialog";
import { Button } from "design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "design-system/components/ui/dialog";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { Textarea } from "design-system/components/ui/textarea";
import {
  deleteWorkspaceFile,
  getWorkspaceVersionControlStatus,
  readWorkspaceFile,
  type WorkspaceFile,
  type WorkspaceFileEntry,
  type WorkspaceVersionControlStatus,
  type WorkspaceVersionFileStatusKind,
  writeWorkspaceFile,
} from "@/api/workspace-files";
import { subscribeWorkspaceFileChanges, useWorkspaceFileStore } from "../workspace-files";

type WorkspaceFilesProps = {
  workspacePath: string;
};

type WorkspaceFileTreeNode = WorkspaceFileEntry & {
  children: WorkspaceFileTreeNode[];
};

const compareNodes = (left: WorkspaceFileTreeNode, right: WorkspaceFileTreeNode) =>
  Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name, "zh-CN");

const buildWorkspaceFileTree = (files: WorkspaceFileEntry[]) => {
  const roots: WorkspaceFileTreeNode[] = [];
  const nodes = new Map<string, WorkspaceFileTreeNode>();

  files.forEach((file) => {
    nodes.set(file.path, { ...file, children: [] });
  });

  nodes.forEach((node) => {
    const separatorIndex = node.path.lastIndexOf("/");
    const parentPath = separatorIndex > 0 ? node.path.slice(0, separatorIndex) : "";
    const parent = parentPath ? nodes.get(parentPath) : null;

    if (parent?.isDirectory) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (items: WorkspaceFileTreeNode[]) => {
    items.sort(compareNodes);
    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);
  return roots;
};

const getWorkspaceFileParentPaths = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
};

const versionStatusLabels: Record<WorkspaceVersionFileStatusKind, string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  typechange: "类型",
  conflicted: "冲突",
  untracked: "未跟踪",
};

const versionStatusClasses: Record<WorkspaceVersionFileStatusKind, string> = {
  added: "bg-success/10 text-success ring-success/20",
  modified: "bg-warning/10 text-warning ring-warning/20",
  deleted: "bg-destructive/10 text-destructive ring-destructive/20",
  renamed: "bg-info/10 text-info ring-info/20",
  typechange: "bg-primary/10 text-primary ring-primary/20",
  conflicted: "bg-destructive/10 text-destructive ring-destructive/20",
  untracked: "bg-muted text-muted-foreground ring-border",
};

export const WorkspaceFiles = ({ workspacePath }: WorkspaceFilesProps) => {
  const fileStore = useWorkspaceFileStore();
  const [versionStatus, setVersionStatus] = useState<WorkspaceVersionControlStatus | null>(null);
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileTree = useMemo(
    () => buildWorkspaceFileTree(fileStore.workspacePath === workspacePath ? fileStore.files : []),
    [fileStore.files, fileStore.workspacePath, workspacePath],
  );
  const fileCount = useMemo(
    () => (fileStore.workspacePath === workspacePath ? fileStore.files.filter((file) => !file.isDirectory).length : 0),
    [fileStore.files, fileStore.workspacePath, workspacePath],
  );
  const versionStatusByPath = useMemo(
    () => new Map((versionStatus?.files ?? []).map((file) => [file.path, file])),
    [versionStatus?.files],
  );

  const loadVersionStatus = useCallback(async () => {
    try {
      setVersionStatus(await getWorkspaceVersionControlStatus(workspacePath));
    } catch {
      setVersionStatus(null);
    }
  }, [workspacePath]);

  useEffect(() => {
    setVersionStatus(null);
    setActiveFile(null);
    setExpandedPaths(new Set());
    setIsEditorOpen(false);
    setError("");
    void loadVersionStatus();

    return subscribeWorkspaceFileChanges((changedWorkspacePath) => {
      if (changedWorkspacePath === workspacePath) {
        void loadVersionStatus();
      }
    });
  }, [loadVersionStatus, workspacePath]);

  useEffect(() => {
    if (fileStore.workspacePath !== workspacePath) {
      return;
    }

    setExpandedPaths((current) => {
      const next = new Set(current);
      fileStore.files.forEach((file) => {
        if (file.isDirectory && !file.path.includes("/")) {
          next.add(file.path);
        }
      });
      return next;
    });
  }, [fileStore.files, fileStore.workspacePath, workspacePath]);

  const openFile = async (path: string) => {
    setError("");
    try {
      const file = await readWorkspaceFile(workspacePath, path);
      setActiveFile(file);
      setFilePath(file.path);
      setFileContent(file.content);
      setIsEditorOpen(true);
      setExpandedPaths((current) => new Set([...current, ...getWorkspaceFileParentPaths(file.path)]));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const openNewFile = () => {
    setActiveFile(null);
    setFilePath("");
    setFileContent("");
    setError("");
    setIsEditorOpen(true);
  };

  const saveFile = async () => {
    const path = filePath.trim();
    if (!path) {
      setError("文件路径不能为空");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      const savedFile = await writeWorkspaceFile(workspacePath, path, fileContent);
      setActiveFile(savedFile);
      setFilePath(savedFile.path);
      setFileContent(savedFile.content);
      await Promise.all([fileStore.refreshFiles(), loadVersionStatus()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFile = async () => {
    if (!activeFile) {
      return;
    }

    setIsDeleting(true);
    setError("");
    try {
      await deleteWorkspaceFile(workspacePath, activeFile.path);
      setActiveFile(null);
      setFilePath("");
      setFileContent("");
      setIsEditorOpen(false);
      await Promise.all([fileStore.refreshFiles(), loadVersionStatus()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleDirectory = (path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: WorkspaceFileTreeNode, depth: number) => {
    const paddingLeft = `${0.75 + depth * 0.8}rem`;

    if (node.isDirectory) {
      const isExpanded = expandedPaths.has(node.path);
      return (
        <div key={node.path} className="min-w-0">
          <button
            type="button"
            className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
            style={{ paddingLeft }}
            onClick={() => toggleDirectory(node.path)}
          >
            <ChevronRightIcon
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            {isExpanded ? (
              <FolderOpenIcon className="size-4 shrink-0 text-primary" />
            ) : (
              <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
          </button>
          {isExpanded ? node.children.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    const fileStatus = versionStatusByPath.get(node.path);

    return (
      <button
        key={node.path}
        type="button"
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
        style={{ paddingLeft: `${1.85 + depth * 0.8}rem` }}
        onClick={() => void openFile(node.path)}
      >
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {fileStatus ? (
          <span
            className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium ring-1 ${versionStatusClasses[fileStatus.status]}`}
            title={fileStatus.previousPath ? `${fileStatus.previousPath} → ${fileStatus.path}` : undefined}
          >
            {versionStatusLabels[fileStatus.status]}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex min-w-0 items-center justify-between gap-2 px-3 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <FolderIcon className="size-4 shrink-0" />
            <span>文件</span>
            <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
              {fileCount}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title="刷新文件"
              onClick={() => void Promise.all([fileStore.refreshFiles(), loadVersionStatus()])}
            >
              <RefreshCwIcon
                className={`size-4 ${fileStore.isLoading ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
            </Button>
            <Button type="button" size="icon" variant="ghost" title="新建文件" onClick={openNewFile}>
              <PlusIcon className="size-4" />
            </Button>
          </div>
        </header>

        {(error || (fileStore.workspacePath === workspacePath ? fileStore.error : "")) && !isEditorOpen ? (
          <div className="mx-3 mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {error || fileStore.error}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <div className="min-w-0 px-2 pb-3">
            {(fileStore.workspacePath !== workspacePath || fileStore.isLoading) && fileTree.length === 0 ? (
              <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                正在读取文件
              </div>
            ) : fileTree.length > 0 ? (
              fileTree.map((node) => renderNode(node, 0))
            ) : (
              <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                暂无可编辑文件
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <Dialog
        open={isEditorOpen}
        onOpenChange={(open) => {
          setIsEditorOpen(open);
          if (!open) {
            setError("");
          }
        }}
      >
        <DialogContent className="grid h-[min(88vh,800px)] max-w-[min(96vw,960px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{activeFile ? "编辑文件" : "新建文件"}</DialogTitle>
            <DialogDescription>修改工作区中的文本文件内容。</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden p-5">
            <Input
              value={filePath}
              placeholder="例如：章节/第一章.md"
              readOnly={Boolean(activeFile)}
              onChange={(event) => setFilePath(event.currentTarget.value)}
            />
            <Textarea
              value={fileContent}
              className="min-h-0 resize-none font-mono text-sm leading-6"
              placeholder="输入文件内容"
              onChange={(event) => setFileContent(event.currentTarget.value)}
            />
          </div>
          <DialogFooter className="border-t px-5 py-4 sm:justify-between">
            <div>
              {activeFile ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive" disabled={isSaving || isDeleting}>
                      {isDeleting ? (
                        <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <Trash2Icon className="size-4" />
                      )}
                      删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>删除当前文件？</AlertDialogTitle>
                      <AlertDialogDescription>将从工作区删除 {activeFile.path}。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void deleteFile()}>
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {error ? <span className="mr-auto text-xs text-destructive">{error}</span> : null}
              <Button type="button" variant="outline" onClick={() => setIsEditorOpen(false)}>
                取消
              </Button>
              <Button
                type="button"
                disabled={!filePath.trim() || isSaving || isDeleting}
                onClick={() => void saveFile()}
              >
                {isSaving ? (
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <SaveIcon className="size-4" />
                )}
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
