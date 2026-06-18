import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  GitBranch,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildSideBySideDiffRows } from "./diff";
import { SideBySideDiffViewer } from "./diff-viewer";
import { buildVersionFileTree } from "./file-tree";
import { formatVersionTime } from "./format";
import type { VersionControlViewProps } from "./types";
import { VersionFileTree } from "./version-file-tree";

type VersionControlHistoryPanelProps = Pick<
  VersionControlViewProps,
  | "versionStatus"
  | "versions"
  | "versionFiles"
  | "historyVersionDiff"
  | "selectedHistoryVersionId"
  | "selectedVersionHistoryBranchName"
  | "selectedVersionSnapshotFilePath"
  | "versionError"
  | "isVersionControlLoading"
  | "isVersionControlInitializing"
  | "isVersionFilesLoading"
  | "isVersionFileContentLoading"
  | "isVersionHistoryLoading"
  | "restoringVersionFilePath"
  | "onRefreshVersionControl"
  | "onSelectHistoryVersion"
  | "onSelectVersionHistoryBranch"
  | "onSelectHistoryVersionFile"
  | "onRestoreHistoryVersionFile"
>;

export const VersionControlHistoryPanel = ({
  versionStatus,
  versions,
  versionFiles,
  historyVersionDiff,
  selectedHistoryVersionId,
  selectedVersionHistoryBranchName,
  selectedVersionSnapshotFilePath,
  versionError,
  isVersionControlLoading,
  isVersionControlInitializing,
  isVersionFilesLoading,
  isVersionFileContentLoading,
  isVersionHistoryLoading,
  restoringVersionFilePath,
  onRefreshVersionControl,
  onSelectHistoryVersion,
  onSelectVersionHistoryBranch,
  onSelectHistoryVersionFile,
  onRestoreHistoryVersionFile,
}: VersionControlHistoryPanelProps) => {
  const [isCommitDetailsDialogOpen, setIsCommitDetailsDialogOpen] = useState(false);
  const [expandedVersionFileTreePaths, setExpandedVersionFileTreePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const versionFileTree = useMemo(
    () => buildVersionFileTree(versionFiles),
    [versionFiles],
  );
  const historySideBySideDiffRows = useMemo(
    () => buildSideBySideDiffRows(historyVersionDiff),
    [historyVersionDiff],
  );
  const versionFileTreeDirectoryKey = versionFileTree.directoryPaths.join("\0");
  const isVersionControlEnabled = versionStatus?.isEnabled ?? false;
  const selectedHistoryVersion =
    versions.find((version) => version.id === selectedHistoryVersionId) ?? null;
  const selectedHistoryVersionFile =
    versionFiles.find((file) => file.path === selectedVersionSnapshotFilePath) ?? null;
  const currentBranchName =
    versionStatus?.branches.find((branch) => branch.isCurrent)?.name ??
    versionStatus?.currentRef ??
    "";
  const currentHistoryBranchName =
    selectedVersionHistoryBranchName || currentBranchName;
  const versionHistoryCountLabel = isVersionHistoryLoading
    ? "读取中"
    : `${versions.length} 次`;

  useEffect(() => {
    setExpandedVersionFileTreePaths(new Set(versionFileTree.directoryPaths));
  }, [selectedHistoryVersionId, versionFileTreeDirectoryKey]);

  const toggleVersionFileTreeDirectory = (path: string) => {
    setExpandedVersionFileTreePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const openCommitDetails = (version: (typeof versions)[number]) => {
    setIsCommitDetailsDialogOpen(true);
    onSelectHistoryVersion(version);
  };

  return (
    <section className="min-w-0 space-y-3 overflow-hidden">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm font-medium">
          <History className="size-4 shrink-0" />
          <span className="shrink-0">提交历史</span>
          <span
            className="inline-flex h-5 shrink-0 items-center rounded-sm bg-muted/70 px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums"
            title="提交数"
          >
            {versionHistoryCountLabel}
          </span>
          {isVersionControlEnabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-6 max-w-[9.5rem] min-w-0 rounded-md bg-muted/70 px-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="选择历史分支"
                  aria-label="选择历史分支"
                  disabled={(versionStatus?.branches.length ?? 0) === 0}
                >
                  <GitBranch className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    {currentHistoryBranchName || "HEAD"}
                  </span>
                  <ChevronDown className="size-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>历史分支</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={currentHistoryBranchName}
                  onValueChange={(branchName) => {
                    if (branchName !== currentHistoryBranchName) {
                      onSelectVersionHistoryBranch(branchName);
                    }
                  }}
                >
                  {(versionStatus?.branches ?? []).map((branch) => (
                    <DropdownMenuRadioItem
                      key={branch.name}
                      value={branch.name}
                      className="min-w-0"
                    >
                      <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                      {branch.isCurrent ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          当前
                        </span>
                      ) : branch.shortHead ? (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {branch.shortHead}
                        </span>
                      ) : null}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          title="刷新提交历史"
          onClick={onRefreshVersionControl}
          disabled={isVersionControlLoading || isVersionControlInitializing}
        >
          {isVersionControlLoading || isVersionHistoryLoading ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
        </Button>
      </div>

      {!isVersionControlEnabled ? (
        <div className="px-2 py-8 text-sm text-muted-foreground">
          还没有提交历史
        </div>
      ) : (
        <>
          <div className="min-w-0 space-y-1.5">
            {isVersionHistoryLoading ? (
              <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                正在读取提交历史
              </div>
            ) : versions.length ? (
              versions.map((version) => (
                <button
                  type="button"
                  key={version.id}
                  className="flex w-full min-w-0 items-start gap-2 overflow-hidden rounded-md border border-border/55 bg-background/60 px-2.5 py-2.5 text-left shadow-xs transition-colors hover:border-border hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[active=true]:border-primary/35 data-[active=true]:bg-primary/10"
                  data-active={version.id === selectedHistoryVersionId}
                  onClick={() => openCommitDetails(version)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {version.shortId}
                      </span>
                      <span
                        className="min-w-0 truncate text-sm font-medium"
                        title={version.summary}
                      >
                        {version.summary}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {version.authorName} · {formatVersionTime(version.timestamp)}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-2 py-8 text-sm text-muted-foreground">
                还没有提交历史
              </div>
            )}
          </div>

          <Dialog
            open={isCommitDetailsDialogOpen}
            onOpenChange={setIsCommitDetailsDialogOpen}
          >
            <DialogContent
              overlayClassName="pointer-events-none !top-12 !right-0 !bottom-0 !left-0 bg-transparent supports-backdrop-filter:backdrop-blur-0 min-[720px]:!left-[clamp(216px,22vw,288px)]"
              className="!top-12 !right-0 !bottom-0 !left-0 h-auto w-auto max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 shadow-[-10px_0_32px_-28px_rgb(15_23_42_/_0.45)] sm:w-auto sm:max-w-none min-[720px]:!left-[clamp(216px,22vw,288px)]"
            >
              <DialogHeader className="min-w-0 border-b border-border/60 px-5 py-4 pr-16">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-lg">
                      提交内容 {selectedHistoryVersion?.shortId ?? ""}
                    </DialogTitle>
                    <DialogDescription className="truncate">
                      {selectedHistoryVersion
                        ? `${currentHistoryBranchName || "HEAD"} · ${selectedHistoryVersion.summary}`
                        : "选择一个提交查看内容"}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,0.34fr)_minmax(0,1fr)] overflow-hidden">
                <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-border/60">
                  <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>变更文件</span>
                    <span className="tabular-nums">
                      {selectedHistoryVersion ? versionFiles.length : 0}
                    </span>
                  </div>
                  <ScrollArea className="min-h-0 min-w-0 overflow-hidden">
                    <div className="min-w-0 p-3 pr-4">
                      {!selectedHistoryVersion ? (
                        <div className="px-2 py-8 text-sm text-muted-foreground">
                          选择一个提交
                        </div>
                      ) : isVersionFilesLoading ? (
                        <div className="px-2 py-8 text-sm text-muted-foreground">
                          正在读取提交文件
                        </div>
                      ) : versionFileTree.nodes.length ? (
                        <VersionFileTree
                          nodes={versionFileTree.nodes}
                          expandedPaths={expandedVersionFileTreePaths}
                          selectedPath={selectedVersionSnapshotFilePath}
                          onToggleDirectory={toggleVersionFileTreeDirectory}
                          onSelectFile={(path) =>
                            onSelectHistoryVersionFile(selectedHistoryVersion.id, path)
                          }
                        />
                      ) : (
                        <div className="px-2 py-8 text-sm text-muted-foreground">
                          这个提交没有文件变更
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
                <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
                  <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground">
                    <div className="min-w-0 truncate" title={selectedVersionSnapshotFilePath}>
                      {selectedVersionSnapshotFilePath || "文件差异"}
                    </div>
                    {selectedHistoryVersionFile && historyVersionDiff && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="shrink-0"
                        title="将这个历史文件恢复到工作区"
                        onClick={() => onRestoreHistoryVersionFile(selectedHistoryVersionFile)}
                        disabled={
                          isVersionFileContentLoading ||
                          Boolean(restoringVersionFilePath)
                        }
                      >
                        {restoringVersionFilePath === selectedHistoryVersionFile.path ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        {selectedHistoryVersionFile.status === "deleted"
                          ? "恢复已删除文件"
                          : "恢复此文件"}
                      </Button>
                    )}
                  </div>
                  <div className="min-h-0 min-w-0 overflow-auto">
                    {!selectedHistoryVersion ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        选择一个提交
                      </div>
                    ) : isVersionFilesLoading ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        正在读取提交文件
                      </div>
                    ) : isVersionFileContentLoading ? (
                      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                        <LoaderCircle className="size-4 animate-spin" />
                        正在读取文件差异
                      </div>
                    ) : selectedVersionSnapshotFilePath ? (
                      historySideBySideDiffRows.length ? (
                        <SideBySideDiffViewer rows={historySideBySideDiffRows} />
                      ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                          没有文本差异
                        </div>
                      )
                    ) : (
                      <div className="p-4 text-sm text-muted-foreground">
                        选择一个文件查看差异
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
