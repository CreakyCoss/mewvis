import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentProfile } from "@/features/agent-settings/types";
import type { ChatMode, CollaborationPhase, FileTreeNode } from "../../page-types";
import type { WorkspaceFile } from "../../types";
import { CollaborationStatusPanel } from "../collaboration-status-panel";

type ContextPanelProps = {
  selectableFileCount: number;
  isFilesLoading: boolean;
  fileTree: FileTreeNode[];
  expandedFileTreePaths: Set<string>;
  activeFile: WorkspaceFile | null;
  chatMode: ChatMode;
  collaborationPhase: CollaborationPhase;
  selectedAgent: AgentProfile | null;
  reviewerAgent: AgentProfile | null;
  onRefreshFiles: () => void;
  onPrepareNewFile: () => void;
  onOpenFile: (path: string) => void;
  onToggleDirectory: (path: string) => void;
};

export const ContextPanel = ({
  selectableFileCount,
  isFilesLoading,
  fileTree,
  expandedFileTreePaths,
  activeFile,
  chatMode,
  collaborationPhase,
  selectedAgent,
  reviewerAgent,
  onRefreshFiles,
  onPrepareNewFile,
  onOpenFile,
  onToggleDirectory,
}: ContextPanelProps) => {
  const renderFileTreeNode = (node: FileTreeNode, depth: number) => {
    const isExpanded = expandedFileTreePaths.has(node.path);
    const paddingLeft = `${0.5 + depth * 0.85}rem`;

    if (node.isDirectory) {
      return (
        <div key={node.path}>
          <button
            type="button"
            className="flex h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
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
            <div className="space-y-0.5">
              {node.children.map((child) => renderFileTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        type="button"
        className="flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none data-[active=true]:bg-muted/70"
        style={{ paddingLeft: `${1.55 + depth * 0.85}rem` }}
        data-active={node.path === activeFile?.path}
        onClick={() => onOpenFile(node.path)}
      >
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
    );
  };

  return (
    <aside className="flex w-[clamp(300px,24vw,360px)] shrink-0 flex-col bg-background/90 text-foreground shadow-[-8px_0_28px_-30px_rgb(15_23_42_/_0.38)] backdrop-blur">
      <div className="flex items-center justify-between bg-transparent px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Folder className="size-4" />
          <span>文件</span>
          <span className="rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {selectableFileCount} 个
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
            onClick={onPrepareNewFile}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <section className="space-y-2">
            <div className="space-y-0.5">
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

      {chatMode === "collab" && (
        <CollaborationStatusPanel
          writerAgent={selectedAgent}
          reviewerAgent={reviewerAgent}
          phase={collaborationPhase}
        />
      )}
    </aside>
  );
};
