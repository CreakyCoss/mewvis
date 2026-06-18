import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  buildSideBySideDiffRows,
  getDiffChangeRowIndexes,
} from "./diff";
import { SideBySideDiffViewer } from "./diff-viewer";
import {
  getDiscardVersionFileLabel,
  getDiscardVersionFileTitle,
  versionStatusLabels,
  versionStatusTextClasses,
  versionStatusTitles,
} from "./status";
import type { VersionControlViewProps } from "./types";

type VersionControlWorktreePanelProps = Pick<
  VersionControlViewProps,
  | "versionStatus"
  | "versionDiff"
  | "selectedVersionFilePath"
  | "versionMessage"
  | "versionError"
  | "isVersionControlLoading"
  | "isVersionControlInitializing"
  | "isVersionDiffLoading"
  | "isCreatingVersion"
  | "discardingVersionFilePath"
  | "onRefreshVersionControl"
  | "onSelectVersionFile"
  | "onVersionMessageChange"
  | "onCreateVersion"
  | "onDiscardVersionFileChanges"
>;

export const VersionControlWorktreePanel = ({
  versionStatus,
  versionDiff,
  selectedVersionFilePath,
  versionMessage,
  versionError,
  isVersionControlLoading,
  isVersionControlInitializing,
  isVersionDiffLoading,
  isCreatingVersion,
  discardingVersionFilePath,
  onRefreshVersionControl,
  onSelectVersionFile,
  onVersionMessageChange,
  onCreateVersion,
  onDiscardVersionFileChanges,
}: VersionControlWorktreePanelProps) => {
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
  const [diffDialogFilePath, setDiffDialogFilePath] = useState("");
  const [selectedCommitPaths, setSelectedCommitPaths] = useState<string[]>([]);
  const [hasCustomizedCommitSelection, setHasCustomizedCommitSelection] =
    useState(false);
  const [activeDiffChangeIndex, setActiveDiffChangeIndex] = useState(0);
  const diffRowRefs = useRef(new Map<number, HTMLDivElement>());

  const sideBySideDiffRows = useMemo(
    () => buildSideBySideDiffRows(versionDiff),
    [versionDiff],
  );
  const diffChangeRowIndexes = useMemo(
    () => getDiffChangeRowIndexes(sideBySideDiffRows),
    [sideBySideDiffRows],
  );
  const activeDiffRowIndex = diffChangeRowIndexes[activeDiffChangeIndex] ?? -1;
  const isVersionControlEnabled = versionStatus?.isEnabled ?? false;
  const isVersionStatusPending = !versionStatus && isVersionControlLoading;
  const changedFilePaths = useMemo(
    () => versionStatus?.files.map((file) => file.path) ?? [],
    [versionStatus?.files],
  );
  const changedFilePathKey = changedFilePaths.join("\0");
  const selectedCommitPathSet = useMemo(
    () => new Set(selectedCommitPaths),
    [selectedCommitPaths],
  );
  const selectedPathsForCommit = useMemo(
    () => changedFilePaths.filter((path) => selectedCommitPathSet.has(path)),
    [changedFilePaths, selectedCommitPathSet],
  );
  const allChangedFilesSelected =
    changedFilePaths.length > 0 &&
    selectedPathsForCommit.length === changedFilePaths.length;
  const hasSelectedChangedFiles = selectedPathsForCommit.length > 0;
  const canCreateVersion =
    isVersionControlEnabled &&
    Boolean(versionStatus?.hasChanges) &&
    hasSelectedChangedFiles &&
    versionMessage.trim().length > 0 &&
    !isCreatingVersion;

  useEffect(() => {
    setActiveDiffChangeIndex(0);
  }, [diffDialogFilePath, sideBySideDiffRows.length]);

  useEffect(() => {
    if (
      !isDiffDialogOpen ||
      isVersionDiffLoading ||
      diffChangeRowIndexes.length === 0
    ) {
      return;
    }

    const firstChangeRowIndex = diffChangeRowIndexes[0];
    window.requestAnimationFrame(() => {
      diffRowRefs.current.get(firstChangeRowIndex)?.scrollIntoView({
        block: "center",
      });
    });
  }, [diffChangeRowIndexes, diffDialogFilePath, isDiffDialogOpen, isVersionDiffLoading]);

  useEffect(() => {
    if (changedFilePaths.length === 0) {
      setHasCustomizedCommitSelection(false);
      setSelectedCommitPaths([]);
      return;
    }

    setSelectedCommitPaths((currentPaths) => {
      if (!hasCustomizedCommitSelection) {
        return changedFilePaths;
      }

      const availablePaths = new Set(changedFilePaths);
      const retainedPaths = currentPaths.filter((path) => availablePaths.has(path));
      if (currentPaths.length > 0 && retainedPaths.length === 0) {
        return changedFilePaths;
      }
      return retainedPaths;
    });
  }, [changedFilePathKey, changedFilePaths, hasCustomizedCommitSelection]);

  const openVersionDiff = (path: string) => {
    setDiffDialogFilePath(path);
    setIsDiffDialogOpen(true);
    onSelectVersionFile(path);
  };

  const scrollToDiffChange = (nextChangeIndex: number) => {
    if (diffChangeRowIndexes.length === 0) {
      return;
    }

    const normalizedIndex =
      (nextChangeIndex + diffChangeRowIndexes.length) % diffChangeRowIndexes.length;
    const rowIndex = diffChangeRowIndexes[normalizedIndex];
    setActiveDiffChangeIndex(normalizedIndex);

    window.requestAnimationFrame(() => {
      diffRowRefs.current.get(rowIndex)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  const toggleAllCommitPaths = (checked: boolean | "indeterminate") => {
    setHasCustomizedCommitSelection(true);
    setSelectedCommitPaths(checked ? changedFilePaths : []);
  };

  const toggleCommitPath = (path: string, checked: boolean | "indeterminate") => {
    setHasCustomizedCommitSelection(true);
    setSelectedCommitPaths((currentPaths) => {
      if (checked) {
        return currentPaths.includes(path) ? currentPaths : [...currentPaths, path];
      }
      return currentPaths.filter((currentPath) => currentPath !== path);
    });
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <GitBranch className="size-4 shrink-0" />
          <span className="shrink-0">版本控制</span>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          title="刷新版本状态"
          onClick={onRefreshVersionControl}
          disabled={isVersionControlLoading || isVersionControlInitializing}
        >
          {isVersionControlLoading ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
        </Button>
      </div>

      {!isVersionControlEnabled ? (
        <div className="rounded-md bg-muted/45 px-2.5 py-2 text-sm text-muted-foreground">
          {isVersionStatusPending
            ? "正在读取版本状态"
            : "未初始化版本仓库，请在顶部版本菜单中初始化。"}
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md bg-muted/45 px-2.5 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-1.5">
                <Checkbox
                  checked={
                    allChangedFilesSelected
                      ? true
                      : hasSelectedChangedFiles
                      ? "indeterminate"
                      : false
                  }
                  onCheckedChange={toggleAllCommitPaths}
                  disabled={!changedFilePaths.length}
                  aria-label="选择全部变更"
                />
                <FileDiff className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate font-medium">变更文件</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
                待提交 {selectedPathsForCommit.length}/{changedFilePaths.length}
              </span>
            </div>
            <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <div className="min-w-0 space-y-0.5 pr-2">
                {versionStatus?.files.length ? (
                  versionStatus.files.map((file) => {
                    const isSelectedForCommit = selectedCommitPathSet.has(file.path);
                    const fileLabel = file.previousPath
                      ? `${file.previousPath} -> ${file.path}`
                      : file.path;
                    const discardLabel = getDiscardVersionFileLabel(file.status);
                    const isDiscardingThisFile = discardingVersionFilePath === file.path;

                    return (
                      <div
                        key={file.path}
                        className="grid h-8 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 overflow-hidden rounded-md px-2 transition-colors hover:bg-muted/55 data-[active=true]:bg-muted/70"
                        data-active={file.path === selectedVersionFilePath}
                      >
                        <Checkbox
                          checked={isSelectedForCommit}
                          onCheckedChange={(checked) => toggleCommitPath(file.path, checked)}
                          aria-label={`提交 ${file.path}`}
                        />
                        <button
                          type="button"
                          className="grid h-full min-w-0 grid-cols-[1.7rem_minmax(0,1fr)] items-center gap-2 overflow-hidden text-left text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                          title={fileLabel}
                          onClick={() => openVersionDiff(file.path)}
                        >
                          <span
                            className={cn(
                              "inline-flex h-5 min-w-0 items-center justify-center rounded-sm border border-current/25 px-1 font-mono text-[11px] font-semibold leading-none",
                              versionStatusTextClasses[file.status],
                            )}
                            title={versionStatusTitles[file.status]}
                          >
                            {versionStatusLabels[file.status]}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{fileLabel}</span>
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              title={getDiscardVersionFileTitle(file.status)}
                              aria-label={`${discardLabel} ${file.path}`}
                              disabled={Boolean(discardingVersionFilePath)}
                            >
                              {isDiscardingThisFile ? (
                                <LoaderCircle className="size-3 animate-spin" />
                              ) : (
                                <RotateCcw className="size-3" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{discardLabel}？</AlertDialogTitle>
                              <AlertDialogDescription>
                                {getDiscardVersionFileTitle(file.status)}。
                                <span className="mt-2 block break-all font-medium text-foreground">
                                  {fileLabel}
                                </span>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() =>
                                  onDiscardVersionFileChanges(file.path, {
                                    skipConfirmation: true,
                                  })
                                }
                              >
                                确认{discardLabel}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    没有变更
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <Dialog open={isDiffDialogOpen} onOpenChange={setIsDiffDialogOpen}>
            <DialogContent
              overlayClassName="pointer-events-none !top-12 !right-0 !bottom-0 !left-0 bg-transparent supports-backdrop-filter:backdrop-blur-0 min-[720px]:!left-[clamp(216px,22vw,288px)]"
              className="!top-12 !right-0 !bottom-0 !left-0 h-auto w-auto max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 shadow-[-10px_0_32px_-28px_rgb(15_23_42_/_0.45)] sm:w-auto sm:max-w-none min-[720px]:!left-[clamp(216px,22vw,288px)]"
            >
              <DialogHeader className="min-w-0 border-b border-border/60 px-5 py-4 pr-16">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-lg">文件变更</DialogTitle>
                    <DialogDescription className="truncate">
                      {diffDialogFilePath || selectedVersionFilePath || "选择一个变更文件"}
                    </DialogDescription>
                  </div>
                  <div className="mr-8 flex shrink-0 items-center gap-1.5">
                    <span className="min-w-12 rounded-md bg-muted/70 px-2 py-1 text-center text-xs tabular-nums text-muted-foreground">
                      {diffChangeRowIndexes.length
                        ? `${activeDiffChangeIndex + 1}/${diffChangeRowIndexes.length}`
                        : "0"}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      title="上一处变更"
                      onClick={() => scrollToDiffChange(activeDiffChangeIndex - 1)}
                      disabled={isVersionDiffLoading || diffChangeRowIndexes.length === 0}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      title="下一处变更"
                      onClick={() => scrollToDiffChange(activeDiffChangeIndex + 1)}
                      disabled={isVersionDiffLoading || diffChangeRowIndexes.length === 0}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>
              <div className="min-h-0 min-w-0 overflow-auto">
                {isVersionDiffLoading ? (
                  <div className="flex min-h-[360px] items-center gap-2 p-4 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    正在读取差异
                  </div>
                ) : sideBySideDiffRows.length ? (
                  <SideBySideDiffViewer
                    rows={sideBySideDiffRows}
                    activeRowIndex={activeDiffRowIndex}
                    rowRefs={diffRowRefs}
                  />
                ) : (
                  <div className="min-h-[360px] p-4 text-sm text-muted-foreground">
                    没有文本差异
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <div className="shrink-0 space-y-2 rounded-md border border-border/50 bg-background/45 p-2">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <GitCommitHorizontal className="size-3.5" />
                <span>提交</span>
              </div>
              <span className="shrink-0 tabular-nums">
                {selectedPathsForCommit.length} 个文件
              </span>
            </div>
            <Textarea
              value={versionMessage}
              placeholder="填写提交说明，例如这次改动的目的和范围"
              onChange={(event) => onVersionMessageChange(event.target.value)}
              disabled={isCreatingVersion}
              rows={4}
              className="max-h-36 min-h-24 resize-none text-sm leading-5"
            />
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={() => onCreateVersion(selectedPathsForCommit)}
              disabled={!canCreateVersion}
            >
              {isCreatingVersion ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <GitCommitHorizontal className="size-4" />
              )}
              提交
            </Button>
          </div>
        </>
      )}

      {versionError && (
        <div className="overflow-hidden break-words rounded-md bg-destructive/10 px-2.5 py-2 text-sm leading-5 text-destructive">
          {versionError}
        </div>
      )}
    </section>
  );
};
