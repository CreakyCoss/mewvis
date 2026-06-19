import { ChevronRight, FileText, Folder, FolderOpen, GitBranch, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileTreeNode } from "@/features/pages/chat/page-types";
import type { WorkspaceFile } from "@/features/pages/chat/types";
import { VERSION_RULE_FILE_PATH } from "@/features/pages/chat/utils/version-control";
import { cn } from "@/lib/utils";
import {
  fileStatusBadgeClasses,
  fileStatusLabels,
  fileStatusTitles,
} from "./version-control/status";
import { VersionRuleBadge } from "./version-control/version-rule-badge";
import type { VersionFileStatusByPath } from "./types";

type FilesPanelProps = {
  selectableFileCount: number;
  isFilesLoading: boolean;
  fileTree: FileTreeNode[];
  expandedFileTreePaths: Set<string>;
  activeFile: WorkspaceFile | null;
  versionFileStatusByPath: VersionFileStatusByPath;
  onRefreshFiles: () => void;
  onCreateFile: () => void;
  onOpenFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
};

export const FilesPanel = ({
  selectableFileCount,
  isFilesLoading,
  fileTree,
  expandedFileTreePaths,
  activeFile,
  versionFileStatusByPath,
  onRefreshFiles,
  onCreateFile,
  onOpenFile,
  onToggleDirectory,
}: FilesPanelProps) => {
  const renderFileTreeNode = (node: FileTreeNode, depth: number) => {
    const isExpanded = expandedFileTreePaths.has(node.path);
    const paddingLeft = `${0.5 + depth * 0.85}rem`;

    if (node.isDirectory) {
      return (
        <div key={node.path} className="min-w-0 overflow-hidden">
          <button
            type="button"
            className="flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
            style={{ paddingLeft }}
            onClick={() => onToggleDirectory(node.path)}
          >
            <ChevronRight
              className={[
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                isExpanded ? "rotate-90" : "",
              ].join(" ")}
            />
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-sidebar-primary" />
            ) : (
              <Folder className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            {node.children.length > 0 && (
              <span className="rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {node.children.length}
              </span>
            )}
          </button>
          {isExpanded && node.children.length > 0 && (
            <div className="min-w-0 space-y-0.5 overflow-hidden">
              {node.children.map((child) => renderFileTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const isVersionRuleFile = node.path === VERSION_RULE_FILE_PATH;
    const fileStatus = versionFileStatusByPath.get(node.path);
    const fileStatusTitle = fileStatus?.previousPath
      ? `${fileStatusTitles[fileStatus.status]}：${fileStatus.previousPath} -> ${fileStatus.path}`
      : fileStatus
      ? fileStatusTitles[fileStatus.status]
      : "";

    return (
      <div
        key={node.path}
        className="flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-muted/70"
        style={{ paddingLeft: `${1.55 + depth * 0.85}rem` }}
        data-active={node.path === activeFile?.path}
      >
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={() => onOpenFile(node.path)}
        >
          {isVersionRuleFile ? (
            <GitBranch className="size-4 shrink-0 text-sky-700" />
          ) : (
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              isVersionRuleFile && "font-medium",
            )}
          >
            {node.name}
          </span>
        </button>
        {isVersionRuleFile && <VersionRuleBadge />}
        {fileStatus && (
          <span
            className={cn(
              "shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium ring-1",
              fileStatusBadgeClasses[fileStatus.status],
            )}
            title={fileStatusTitle}
          >
            {fileStatusLabels[fileStatus.status]}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2 bg-transparent px-3 py-3 xl:px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Folder className="size-4" />
          <span className="shrink-0">文件</span>
          <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {selectableFileCount}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="刷新文件"
            onClick={onRefreshFiles}
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            title="新建文件"
            onClick={onCreateFile}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 overflow-hidden p-3 pt-0">
          <section className="min-w-0 space-y-2 overflow-hidden">
            <div className="min-w-0 space-y-0.5 overflow-hidden">
              {isFilesLoading ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  正在读取文件
                </div>
              ) : selectableFileCount ? (
                fileTree.map((node) => renderFileTreeNode(node, 0))
              ) : (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  暂无可编辑文件
                </div>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </>
  );
};
