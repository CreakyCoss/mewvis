import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VERSION_RULE_FILE_PATH } from "@/features/pages/chat/utils/version-control";
import {
  versionStatusLabels,
  versionStatusTextClasses,
  versionStatusTitles,
} from "./status";
import type { VersionFileTreeNode } from "./types";
import { VersionRuleBadge } from "./version-rule-badge";

type VersionFileTreeProps = {
  nodes: VersionFileTreeNode[];
  expandedPaths: Set<string>;
  selectedPath: string;
  onToggleDirectory: (path: string) => void;
  onSelectFile: (path: string) => void;
};

export const VersionFileTree = ({
  nodes,
  expandedPaths,
  selectedPath,
  onToggleDirectory,
  onSelectFile,
}: VersionFileTreeProps) => {
  const renderNode = (node: VersionFileTreeNode, depth: number) => {
    const paddingLeft = `${0.45 + depth * 0.85}rem`;

    if (node.isDirectory) {
      const isExpanded = expandedPaths.has(node.path);

      return (
        <div key={node.path} className="min-w-0 overflow-hidden">
          <button
            type="button"
            className="flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            style={{ paddingLeft }}
            onClick={() => onToggleDirectory(node.path)}
            title={node.path}
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                isExpanded && "rotate-90",
              )}
            />
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-sidebar-primary" />
            ) : (
              <Folder className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            <span className="rounded-sm bg-muted/70 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {node.fileCount}
            </span>
          </button>
          {isExpanded && node.children.length > 0 && (
            <div className="min-w-0 space-y-0.5 overflow-hidden">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const isVersionRuleFile = node.path === VERSION_RULE_FILE_PATH;
    const fileStatus = node.file?.status;
    const fileTitle = node.file?.previousPath
      ? `${node.file.previousPath} -> ${node.path}`
      : node.path;

    return (
      <button
        type="button"
        key={node.path}
        className="flex h-8 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none data-[active=true]:bg-muted/70"
        style={{ paddingLeft: `${1.55 + depth * 0.85}rem` }}
        data-active={node.path === selectedPath}
        title={fileTitle}
        onClick={() => onSelectFile(node.path)}
      >
        {isVersionRuleFile ? (
          <GitBranch className="size-4 shrink-0 text-sky-700" />
        ) : (
          <FileText className="size-4 shrink-0 text-muted-foreground" />
        )}
        {fileStatus && (
          <span
            className={cn(
              "inline-flex h-5 min-w-0 shrink-0 items-center justify-center rounded-sm border border-current/25 px-1 font-mono text-[11px] font-semibold leading-none",
              versionStatusTextClasses[fileStatus],
            )}
            title={versionStatusTitles[fileStatus]}
          >
            {versionStatusLabels[fileStatus]}
          </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isVersionRuleFile && "font-medium",
          )}
        >
          {node.name}
        </span>
        {isVersionRuleFile && <VersionRuleBadge />}
      </button>
    );
  };

  return (
    <div className="min-w-0 space-y-0.5 overflow-hidden">
      {nodes.map((node) => renderNode(node, 0))}
    </div>
  );
};
