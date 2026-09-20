import { useCallback, useEffect, useState } from "react";
import {
  ChevronRightIcon,
  GitBranchIcon,
  HistoryIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Button } from "design-system/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "design-system/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "design-system/components/ui/dropdown-menu";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import {
  getWorkspaceVersionCommitFileDiff,
  getWorkspaceVersionControlStatus,
  listWorkspaceVersionFiles,
  listWorkspaceVersions,
  type WorkspaceVersion,
  type WorkspaceVersionControlStatus,
  type WorkspaceVersionFileDiff,
  type WorkspaceVersionFileEntry,
  writeWorkspaceFile,
} from "@/api/workspace-files";
import { subscribeWorkspaceFileChanges } from "../../workspace-files";

type WorkspaceVersionHistoryProps = {
  workspacePath: string;
};

const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);

export const WorkspaceVersionHistory = ({ workspacePath }: WorkspaceVersionHistoryProps) => {
  const [versionStatus, setVersionStatus] = useState<WorkspaceVersionControlStatus | null>(null);
  const [branchName, setBranchName] = useState("");
  const [versions, setVersions] = useState<WorkspaceVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<WorkspaceVersion | null>(null);
  const [versionFiles, setVersionFiles] = useState<WorkspaceVersionFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<WorkspaceVersionFileEntry | null>(null);
  const [fileDiff, setFileDiff] = useState<WorkspaceVersionFileDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [restoringPath, setRestoringPath] = useState("");
  const [error, setError] = useState("");
  const currentBranch =
    versionStatus?.branches.find((branch) => branch.isCurrent)?.name ?? versionStatus?.currentRef ?? "";

  const loadVersionControl = useCallback(
    async (requestedBranch?: string) => {
      setIsLoading(true);
      setError("");
      try {
        const nextStatus = await getWorkspaceVersionControlStatus(workspacePath);
        setVersionStatus(nextStatus);
        if (!nextStatus.isEnabled) {
          setBranchName("");
          setVersions([]);
          return;
        }

        const defaultBranch =
          nextStatus.branches.find((branch) => branch.isCurrent)?.name ?? nextStatus.currentRef ?? "";
        const nextBranch = requestedBranch || defaultBranch;
        setBranchName(nextBranch);
        setVersions(await listWorkspaceVersions(workspacePath, nextBranch || undefined));
      } catch (caught) {
        setVersionStatus(null);
        setVersions([]);
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setIsLoading(false);
      }
    },
    [workspacePath],
  );

  useEffect(() => {
    setVersionStatus(null);
    setBranchName("");
    setSelectedVersion(null);
    setVersionFiles([]);
    setSelectedFile(null);
    setFileDiff(null);
    void loadVersionControl();
  }, [loadVersionControl]);

  useEffect(
    () =>
      subscribeWorkspaceFileChanges((changedWorkspacePath) => {
        if (changedWorkspacePath === workspacePath) {
          void loadVersionControl(branchName || undefined);
        }
      }),
    [branchName, loadVersionControl, workspacePath],
  );

  const selectVersion = async (version: WorkspaceVersion) => {
    setSelectedVersion(version);
    setVersionFiles([]);
    setSelectedFile(null);
    setFileDiff(null);
    setIsDetailLoading(true);
    setError("");
    try {
      setVersionFiles(await listWorkspaceVersionFiles(workspacePath, version.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const selectFile = async (file: WorkspaceVersionFileEntry) => {
    if (!selectedVersion) {
      return;
    }

    setSelectedFile(file);
    setFileDiff(null);
    setIsDetailLoading(true);
    setError("");
    try {
      setFileDiff(await getWorkspaceVersionCommitFileDiff(workspacePath, selectedVersion.id, file.path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const restoreFile = async () => {
    if (!selectedFile || !fileDiff) {
      return;
    }

    setRestoringPath(selectedFile.path);
    setError("");
    try {
      const content = selectedFile.status === "deleted" ? fileDiff.beforeContent : fileDiff.afterContent;
      await writeWorkspaceFile(workspacePath, selectedFile.path, content);
      await loadVersionControl(branchName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRestoringPath("");
    }
  };

  return (
    <>
      <ScrollArea className="h-full">
        <section className="min-w-0 space-y-3 p-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <HistoryIcon className="size-4 shrink-0" />
              <span>提交历史</span>
              <span className="rounded-sm bg-muted/70 px-1.5 py-0.5 text-xs text-muted-foreground">
                {isLoading ? "读取中" : `${versions.length} 次`}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="h-6 max-w-36 min-w-0 bg-muted/70 px-1.5 text-xs text-muted-foreground"
                  >
                    <GitBranchIcon className="size-3.5" />
                    <span className="truncate">{branchName || currentBranch || "HEAD"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>历史分支</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={branchName || currentBranch}
                    onValueChange={(value) => {
                      setSelectedVersion(null);
                      void loadVersionControl(value);
                    }}
                  >
                    {versionStatus?.branches.map((branch) => (
                      <DropdownMenuRadioItem key={branch.name} value={branch.name}>
                        <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                        {branch.shortHead ? (
                          <span className="font-mono text-xs text-muted-foreground">{branch.shortHead}</span>
                        ) : null}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              title="刷新提交历史"
              disabled={isLoading}
              onClick={() => void loadVersionControl(branchName)}
            >
              <RefreshCwIcon className={`size-3 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>

          {error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
          ) : null}

          {!versionStatus?.isEnabled ? (
            <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
              还没有提交历史
            </div>
          ) : versions.length > 0 ? (
            <div className="space-y-1.5">
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-3 text-left transition-colors hover:border-primary/25 hover:bg-card focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
                  onClick={() => void selectVersion(version)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="rounded-sm bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {version.shortId}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{version.summary}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {version.authorName} · {formatTime(version.timestamp)}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
              {isLoading ? "正在读取提交历史" : "还没有提交历史"}
            </div>
          )}
        </section>
      </ScrollArea>

      <Dialog
        open={Boolean(selectedVersion)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedVersion(null);
            setSelectedFile(null);
            setFileDiff(null);
          }
        }}
      >
        <DialogContent className="grid h-[min(88vh,800px)] max-w-[min(96vw,1120px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>提交内容 {selectedVersion?.shortId}</DialogTitle>
            <DialogDescription>{selectedVersion?.summary}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] overflow-hidden">
            <ScrollArea className="min-h-0 border-r">
              <div className="space-y-1 p-3">
                {versionFiles.map((file) => (
                  <button
                    key={`${file.status}:${file.path}`}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted/60 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                    data-active={selectedFile?.path === file.path}
                    onClick={() => void selectFile(file)}
                  >
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    <span className="shrink-0 uppercase text-muted-foreground">{file.status}</span>
                  </button>
                ))}
                {isDetailLoading && versionFiles.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-muted-foreground">
                    <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                    正在读取文件
                  </div>
                ) : null}
              </div>
            </ScrollArea>
            <div className="flex min-h-0 flex-col overflow-hidden">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {selectedFile?.path || "选择文件查看变更"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!fileDiff || Boolean(restoringPath)}
                  onClick={() => void restoreFile()}
                >
                  {restoringPath ? (
                    <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <RotateCcwIcon className="size-4" />
                  )}
                  恢复文件
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <pre className="min-h-full overflow-x-auto p-4 font-mono text-xs leading-5 whitespace-pre">
                  {isDetailLoading ? "正在读取变更…" : fileDiff?.patch || "当前文件没有可展示的差异"}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
