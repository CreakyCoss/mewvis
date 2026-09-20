import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  FileDiffIcon,
  GitBranchIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
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
} from "design-system/components/ui/alert-dialog";
import { Button } from "design-system/components/ui/button";
import { Checkbox } from "design-system/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "design-system/components/ui/dialog";
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
} from "design-system/components/ui/dropdown-menu";
import { Input } from "design-system/components/ui/input";
import { ScrollArea } from "design-system/components/ui/scroll-area";
import { Textarea } from "design-system/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "design-system/components/ui/toggle-group";
import {
  createWorkspaceVersion,
  createWorkspaceVersionBranch,
  discardWorkspaceVersionFileChanges,
  getWorkspaceVersionControlStatus,
  getWorkspaceVersionFileDiff,
  initializeWorkspaceVersionControl,
  switchWorkspaceVersionBranch,
  type WorkspaceVersionControlStatus,
  type WorkspaceVersionFileDiff,
  type WorkspaceVersionFileStatus,
} from "@/api/workspace-files";
import { subscribeWorkspaceFileChanges } from "../../workspace-files";
import { WorkspaceVersionHistory } from "./history";

type WorkspaceVersionControlProps = {
  workspacePath: string;
};

type WorkspaceVersionTool = "version" | "history";

const versionTools = [
  { value: "version", label: "版本", icon: GitBranchIcon },
  { value: "history", label: "历史", icon: HistoryIcon },
] satisfies Array<{ value: WorkspaceVersionTool; label: string; icon: typeof GitBranchIcon }>;

const fileStatusLabel: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  typechange: "类型",
  conflicted: "冲突",
  untracked: "未跟踪",
};

export const WorkspaceVersionControl = ({ workspacePath }: WorkspaceVersionControlProps) => {
  const [activeTool, setActiveTool] = useState<WorkspaceVersionTool>("version");
  const [status, setStatus] = useState<WorkspaceVersionControlStatus | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileDiff, setFileDiff] = useState<WorkspaceVersionFileDiff | null>(null);
  const [selectedCommitPaths, setSelectedCommitPaths] = useState<string[]>([]);
  const [versionMessage, setVersionMessage] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [discardingPath, setDiscardingPath] = useState("");
  const [pendingDiscardFile, setPendingDiscardFile] = useState<WorkspaceVersionFileStatus | null>(null);
  const [switchingBranch, setSwitchingBranch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [error, setError] = useState("");

  const changedPaths = useMemo(() => status?.files.map((file) => file.path) ?? [], [status?.files]);
  const selectedCommitPathSet = useMemo(() => new Set(selectedCommitPaths), [selectedCommitPaths]);
  const selectedPaths = changedPaths.filter((path) => selectedCommitPathSet.has(path));
  const allSelected = changedPaths.length > 0 && selectedPaths.length === changedPaths.length;
  const currentBranch = status?.branches.find((branch) => branch.isCurrent)?.name ?? status?.currentRef ?? "";

  const applyStatus = useCallback((nextStatus: WorkspaceVersionControlStatus) => {
    setStatus(nextStatus);
    setSelectedCommitPaths(nextStatus.files.map((file) => file.path));
    setSelectedFilePath((current) => (nextStatus.files.some((file) => file.path === current) ? current : ""));
    setFileDiff((current) => (nextStatus.files.some((file) => file.path === current?.path) ? current : null));
  }, []);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      applyStatus(await getWorkspaceVersionControlStatus(workspacePath));
    } catch (caught) {
      setStatus(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, [applyStatus, workspacePath]);

  useEffect(() => {
    setActiveTool("version");
    setStatus(null);
    setSelectedFilePath("");
    setFileDiff(null);
    setVersionMessage("");
    setError("");
    void loadStatus();

    return subscribeWorkspaceFileChanges((changedWorkspacePath) => {
      if (changedWorkspacePath === workspacePath) {
        void loadStatus();
      }
    });
  }, [loadStatus, workspacePath]);

  const initializeVersionControl = async () => {
    setIsInitializing(true);
    setError("");
    try {
      applyStatus(await initializeWorkspaceVersionControl(workspacePath));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsInitializing(false);
    }
  };

  const selectDiff = async (path: string) => {
    setSelectedFilePath(path);
    setFileDiff(null);
    setIsDiffLoading(true);
    setError("");
    try {
      setFileDiff(await getWorkspaceVersionFileDiff(workspacePath, path));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDiffLoading(false);
    }
  };

  const discardFile = async () => {
    if (!pendingDiscardFile) {
      return;
    }

    setDiscardingPath(pendingDiscardFile.path);
    setError("");
    try {
      applyStatus(await discardWorkspaceVersionFileChanges(workspacePath, pendingDiscardFile.path));
      setPendingDiscardFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setDiscardingPath("");
    }
  };

  const createVersion = async () => {
    const message = versionMessage.trim();
    if (!message || selectedPaths.length === 0) {
      return;
    }

    setIsCommitting(true);
    setError("");
    try {
      const result = await createWorkspaceVersion(workspacePath, message, selectedPaths);
      applyStatus(result.status);
      setVersionMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsCommitting(false);
    }
  };

  const switchBranch = async (branchName: string) => {
    if (!branchName || branchName === currentBranch || status?.hasChanges) {
      return;
    }

    setSwitchingBranch(branchName);
    setError("");
    try {
      applyStatus(await switchWorkspaceVersionBranch(workspacePath, branchName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSwitchingBranch("");
    }
  };

  const createBranch = async () => {
    const branchName = newBranchName.trim();
    if (!branchName || !status?.hasVersions) {
      return;
    }

    setIsCreatingBranch(true);
    setError("");
    try {
      applyStatus(await createWorkspaceVersionBranch(workspacePath, branchName));
      setNewBranchName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsCreatingBranch(false);
    }
  };

  const versionMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={`h-8 w-full min-w-0 bg-background/70 px-2 text-xs ${
            status?.isEnabled ? "bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground"
          }`}
        >
          {isLoading || isInitializing ? (
            <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          ) : (
            <GitBranchIcon className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-auto truncate text-left">
            {status?.isEnabled ? currentBranch || "HEAD" : "版本"}
          </span>
          {status?.head ? (
            <span className="min-w-0 shrink-[10] truncate font-mono text-xs text-muted-foreground">{status.head}</span>
          ) : null}
          <ChevronDownIcon className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[100] w-80">
        <DropdownMenuLabel>版本管理</DropdownMenuLabel>
        {!status?.isEnabled ? (
          <>
            <DropdownMenuItem disabled>当前工作区尚未初始化版本仓库</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isLoading || isInitializing} onSelect={() => void initializeVersionControl()}>
              <GitBranchIcon className="size-4" />
              初始化版本管理
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled className="flex-col items-start gap-1">
              <span>当前分支：{currentBranch || "HEAD"}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {status.head ? `当前提交 ${status.head}` : "还没有提交"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={status.branches.length <= 1}>
                <GitBranchIcon className="size-4" />
                切换分支
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] w-64">
                <DropdownMenuRadioGroup value={currentBranch} onValueChange={(value) => void switchBranch(value)}>
                  {status.branches.map((branch) => (
                    <DropdownMenuRadioItem
                      key={branch.name}
                      value={branch.name}
                      disabled={branch.isCurrent || status.hasChanges || Boolean(switchingBranch)}
                    >
                      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                      {switchingBranch === branch.name ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
                      ) : branch.shortHead ? (
                        <span className="font-mono text-xs text-muted-foreground">{branch.shortHead}</span>
                      ) : null}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {status.hasChanges ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">有未提交变更时不能切换分支。</div>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!status.hasVersions}>
                <PlusIcon className="size-4" />
                新建分支
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="z-[100] w-72">
                <DropdownMenuLabel>新建并切换分支</DropdownMenuLabel>
                <div className="flex gap-1.5 p-2 pt-1">
                  <Input
                    value={newBranchName}
                    className="h-8 min-w-0"
                    placeholder="输入分支名称"
                    disabled={isCreatingBranch}
                    onChange={(event) => setNewBranchName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void createBranch();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    disabled={!newBranchName.trim() || isCreatingBranch}
                    onClick={() => void createBranch()}
                  >
                    {isCreatingBranch ? (
                      <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <PlusIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isLoading} onSelect={() => void loadStatus()}>
              <RefreshCwIcon className="size-4" />
              刷新版本状态
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border/55 bg-surface-raised/55 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ToggleGroup
            type="single"
            value={activeTool}
            className="grid w-32 shrink-0 grid-cols-2 rounded-lg border bg-background/55 p-1"
            aria-label="版本管理视图"
            onValueChange={(value) => {
              if (value) {
                setActiveTool(value as WorkspaceVersionTool);
              }
            }}
          >
            {versionTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <ToggleGroupItem
                  key={tool.value}
                  value={tool.value}
                  size="sm"
                  className="h-8 min-w-0 gap-1 rounded-md px-1.5 text-xs text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[var(--shadow-card)]"
                >
                  <Icon className="size-3.5" />
                  <span className="truncate">{tool.label}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
          <div className="min-w-0 flex-1">{versionMenu}</div>
        </div>
      </div>

      <ScrollArea className={activeTool === "version" ? "min-h-0 flex-1" : "hidden"}>
        <section className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GitBranchIcon className="size-4" />
              <span>版本控制</span>
            </div>
            <Button type="button" size="icon-xs" variant="ghost" disabled={isLoading} onClick={() => void loadStatus()}>
              <RefreshCwIcon className={`size-3 ${isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>

          {error ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{error}</div>
          ) : null}

          {!status?.isEnabled ? (
            <div className="app-empty-state rounded-xl px-4 py-8 text-sm text-muted-foreground">
              未初始化版本仓库，请在顶部版本菜单中初始化。
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center gap-2 rounded-md bg-muted/45 px-2.5 py-2 text-sm">
                  <Checkbox
                    checked={allSelected ? true : selectedPaths.length > 0 ? "indeterminate" : false}
                    disabled={changedPaths.length === 0}
                    onCheckedChange={(checked) => setSelectedCommitPaths(checked ? changedPaths : [])}
                  />
                  <FileDiffIcon className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 font-medium">变更文件</span>
                  <span className="text-xs text-muted-foreground">{status.files.length}</span>
                </div>
                {status.files.map((file) => (
                  <div
                    key={`${file.status}:${file.path}`}
                    className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <Checkbox
                      checked={selectedCommitPathSet.has(file.path)}
                      onCheckedChange={(checked) =>
                        setSelectedCommitPaths((current) =>
                          checked
                            ? [...new Set([...current, file.path])]
                            : current.filter((path) => path !== file.path),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-xs hover:text-primary"
                      onClick={() => void selectDiff(file.path)}
                    >
                      {file.path}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{fileStatusLabel[file.status]}</span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      title="撤销变更"
                      disabled={Boolean(discardingPath)}
                      onClick={() => setPendingDiscardFile(file)}
                    >
                      {discardingPath === file.path ? (
                        <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <RotateCcwIcon className="size-3" />
                      )}
                    </Button>
                  </div>
                ))}
                {status.files.length === 0 ? (
                  <div className="app-empty-state rounded-xl px-4 py-8 text-center text-sm text-muted-foreground">
                    工作区没有未提交变更
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-3">
                <Textarea
                  value={versionMessage}
                  className="min-h-20 resize-none text-sm"
                  placeholder="输入提交说明"
                  onChange={(event) => setVersionMessage(event.currentTarget.value)}
                />
                <Button
                  type="button"
                  className="w-full"
                  disabled={!versionMessage.trim() || selectedPaths.length === 0 || isCommitting}
                  onClick={() => void createVersion()}
                >
                  {isCommitting ? (
                    <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <GitBranchIcon className="size-4" />
                  )}
                  提交所选变更
                </Button>
              </div>
            </>
          )}
        </section>
      </ScrollArea>
      <div className={activeTool === "history" ? "min-h-0 flex-1" : "hidden"}>
        <WorkspaceVersionHistory workspacePath={workspacePath} />
      </div>

      <Dialog
        open={Boolean(selectedFilePath)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFilePath("");
            setFileDiff(null);
          }
        }}
      >
        <DialogContent className="grid h-[min(82vh,760px)] max-w-[min(94vw,1000px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{selectedFilePath}</DialogTitle>
            <DialogDescription>当前工作区相对于最新提交的文件变更。</DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0">
            <pre className="min-h-full overflow-x-auto p-4 font-mono text-xs leading-5 whitespace-pre">
              {isDiffLoading ? "正在读取变更…" : fileDiff?.patch || "当前文件没有可展示的差异"}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDiscardFile)}
        onOpenChange={(open) => {
          if (!open && !discardingPath) {
            setPendingDiscardFile(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤销未提交变更？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDiscardFile?.status === "added" || pendingDiscardFile?.status === "untracked"
                ? `${pendingDiscardFile.path} 是未提交的新文件，撤销后会被删除。`
                : `${pendingDiscardFile?.path ?? ""} 将恢复到当前提交状态。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(discardingPath)}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(discardingPath)}
              onClick={(event) => {
                event.preventDefault();
                void discardFile();
              }}
            >
              确认撤销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
