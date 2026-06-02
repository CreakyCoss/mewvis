import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FileDiff,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  WorkspaceVersion,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
  WorkspaceVersionFileStatus,
  WorkspaceVersionControlStatus,
} from "../../types";

type VersionFileTreeNode = {
  path: string;
  name: string;
  isDirectory: boolean;
  children: VersionFileTreeNode[];
  file?: WorkspaceVersionFileEntry;
  fileCount: number;
};

type SideBySideDiffRow =
  | {
      kind: "hunk" | "meta";
      text: string;
    }
  | {
      kind: "context" | "changed" | "removed" | "added";
      oldLine: number | null;
      newLine: number | null;
      oldText: string;
      newText: string;
    };

const VERSION_RULE_FILE_PATH = ".gitignore";

type VersionControlPanelProps = {
  panelMode?: "worktree" | "history";
  versionStatus: WorkspaceVersionControlStatus | null;
  versions: WorkspaceVersion[];
  versionDiff: WorkspaceVersionFileDiff | null;
  versionFiles: WorkspaceVersionFileEntry[];
  historyVersionDiff: WorkspaceVersionFileDiff | null;
  selectedVersionFilePath: string;
  selectedHistoryVersionId: string;
  selectedVersionHistoryBranchName: string;
  selectedVersionSnapshotFilePath: string;
  versionMessage: string;
  versionError: string;
  isVersionControlLoading: boolean;
  isVersionControlInitializing: boolean;
  isVersionDiffLoading: boolean;
  isVersionFilesLoading: boolean;
  isVersionFileContentLoading: boolean;
  isCreatingVersion: boolean;
  isVersionHistoryLoading: boolean;
  restoringVersionFilePath: string;
  onRefreshVersionControl: () => void;
  onSelectVersionFile: (path: string) => void;
  onSelectHistoryVersion: (version: WorkspaceVersion) => void;
  onSelectVersionHistoryBranch: (branchName: string) => void;
  onSelectHistoryVersionFile: (versionId: string, path: string) => void;
  onVersionMessageChange: (message: string) => void;
  onCreateVersion: (relativePaths: string[]) => void;
  onRestoreHistoryVersionFile: (file: WorkspaceVersionFileEntry) => void;
};

const statusLabels: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  typechange: "T",
  conflicted: "!",
  untracked: "?",
};

const statusTitles: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增",
  modified: "已修改",
  deleted: "已删除",
  renamed: "已重命名",
  typechange: "类型变更",
  conflicted: "存在冲突",
  untracked: "未跟踪",
};

const statusClasses: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "text-emerald-700",
  modified: "text-amber-700",
  deleted: "text-destructive",
  renamed: "text-sky-700",
  typechange: "text-violet-700",
  conflicted: "text-destructive",
  untracked: "text-muted-foreground",
};

const formatVersionTime = (timestamp: number) =>
  new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

const compareVersionFileTreeNodes = (
  left: VersionFileTreeNode,
  right: VersionFileTreeNode,
) => {
  const leftIsVersionRule = left.path === VERSION_RULE_FILE_PATH;
  const rightIsVersionRule = right.path === VERSION_RULE_FILE_PATH;
  if (leftIsVersionRule !== rightIsVersionRule) {
    return leftIsVersionRule ? -1 : 1;
  }

  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return (
    left.name.localeCompare(right.name, "zh-CN", {
      numeric: true,
      sensitivity: "base",
    }) || left.path.localeCompare(right.path)
  );
};

const buildVersionFileTree = (files: WorkspaceVersionFileEntry[]) => {
  const root: VersionFileTreeNode = {
    path: "",
    name: "",
    isDirectory: true,
    children: [],
    fileCount: 0,
  };
  const nodesByPath = new Map<string, VersionFileTreeNode>([["", root]]);

  const ensureDirectory = (path: string) => {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    const existing = nodesByPath.get(normalized);
    if (existing) {
      return existing;
    }

    const parts = normalized.split("/").filter(Boolean);
    const name = parts.at(-1) ?? normalized;
    const parent = ensureDirectory(parts.slice(0, -1).join("/"));
    const node: VersionFileTreeNode = {
      path: normalized,
      name,
      isDirectory: true,
      children: [],
      fileCount: 0,
    };

    nodesByPath.set(normalized, node);
    parent.children.push(node);
    return node;
  };

  files.forEach((file) => {
    const normalizedPath = file.path.replace(/^\/+|\/+$/g, "");
    if (!normalizedPath) {
      return;
    }

    const parts = normalizedPath.split("/");
    const parent = ensureDirectory(parts.slice(0, -1).join("/"));
    const existing = nodesByPath.get(normalizedPath);
    if (existing) {
      existing.file = file;
      existing.isDirectory = false;
      existing.name = file.name;
      return;
    }

    const node: VersionFileTreeNode = {
      path: normalizedPath,
      name: file.name,
      isDirectory: false,
      children: [],
      file,
      fileCount: 1,
    };

    nodesByPath.set(normalizedPath, node);
    parent.children.push(node);
  });

  const directoryPaths: string[] = [];
  const sortAndCount = (node: VersionFileTreeNode): number => {
    if (!node.isDirectory) {
      node.fileCount = 1;
      return 1;
    }

    if (node.path) {
      directoryPaths.push(node.path);
    }
    node.children.sort(compareVersionFileTreeNodes);
    node.fileCount = node.children.reduce(
      (count, child) => count + sortAndCount(child),
      0,
    );
    return node.fileCount;
  };

  sortAndCount(root);
  return { nodes: root.children, directoryPaths };
};

const VersionRuleBadge = () => (
  <span className="shrink-0 rounded-sm bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
    版本规则
  </span>
);

const parseUnifiedDiff = (patch: string): SideBySideDiffRow[] => {
  const rows: SideBySideDiffRow[] = [];
  const removedLines: Array<{ line: number; text: string }> = [];
  const addedLines: Array<{ line: number; text: string }> = [];
  let oldLine = 0;
  let newLine = 0;
  let isInsideHunk = false;

  const flushChangedLines = () => {
    const pairedCount = Math.min(removedLines.length, addedLines.length);
    for (let index = 0; index < pairedCount; index += 1) {
      rows.push({
        kind: "changed",
        oldLine: removedLines[index].line,
        newLine: addedLines[index].line,
        oldText: removedLines[index].text,
        newText: addedLines[index].text,
      });
    }

    for (let index = pairedCount; index < removedLines.length; index += 1) {
      rows.push({
        kind: "removed",
        oldLine: removedLines[index].line,
        newLine: null,
        oldText: removedLines[index].text,
        newText: "",
      });
    }

    for (let index = pairedCount; index < addedLines.length; index += 1) {
      rows.push({
        kind: "added",
        oldLine: null,
        newLine: addedLines[index].line,
        oldText: "",
        newText: addedLines[index].text,
      });
    }

    removedLines.length = 0;
    addedLines.length = 0;
  };

  for (const line of patch.replace(/\n$/, "").split("\n")) {
    const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunkMatch) {
      flushChangedLines();
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[2]);
      isInsideHunk = true;
      rows.push({ kind: "hunk", text: line });
      continue;
    }

    if (!isInsideHunk) {
      if (
        line.startsWith("Binary files ") ||
        line.startsWith("new file mode ") ||
        line.startsWith("deleted file mode ")
      ) {
        rows.push({ kind: "meta", text: line });
      }
      continue;
    }

    if (line.startsWith("\\ No newline")) {
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      removedLines.push({ line: oldLine, text: line.slice(1) });
      oldLine += 1;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.push({ line: newLine, text: line.slice(1) });
      newLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      flushChangedLines();
      const text = line.slice(1);
      rows.push({
        kind: "context",
        oldLine,
        newLine,
        oldText: text,
        newText: text,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  flushChangedLines();
  return rows;
};

const splitDiffContentLines = (content: string) => {
  if (!content) {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    lines.pop();
  }
  return lines;
};

const compactChangedRows = (
  rows: Array<
    | {
        kind: "context";
        oldLine: number;
        newLine: number;
        text: string;
      }
    | {
        kind: "removed";
        oldLine: number;
        text: string;
      }
    | {
        kind: "added";
        newLine: number;
        text: string;
      }
  >,
): SideBySideDiffRow[] => {
  const compactRows: SideBySideDiffRow[] = [];
  let removedLines: Array<{ line: number; text: string }> = [];
  let addedLines: Array<{ line: number; text: string }> = [];

  const flush = () => {
    const pairedCount = Math.min(removedLines.length, addedLines.length);
    for (let index = 0; index < pairedCount; index += 1) {
      compactRows.push({
        kind: "changed",
        oldLine: removedLines[index].line,
        newLine: addedLines[index].line,
        oldText: removedLines[index].text,
        newText: addedLines[index].text,
      });
    }
    for (let index = pairedCount; index < removedLines.length; index += 1) {
      compactRows.push({
        kind: "removed",
        oldLine: removedLines[index].line,
        newLine: null,
        oldText: removedLines[index].text,
        newText: "",
      });
    }
    for (let index = pairedCount; index < addedLines.length; index += 1) {
      compactRows.push({
        kind: "added",
        oldLine: null,
        newLine: addedLines[index].line,
        oldText: "",
        newText: addedLines[index].text,
      });
    }
    removedLines = [];
    addedLines = [];
  };

  for (const row of rows) {
    if (row.kind === "context") {
      flush();
      compactRows.push({
        kind: "context",
        oldLine: row.oldLine,
        newLine: row.newLine,
        oldText: row.text,
        newText: row.text,
      });
    } else if (row.kind === "removed") {
      removedLines.push({ line: row.oldLine, text: row.text });
    } else {
      addedLines.push({ line: row.newLine, text: row.text });
    }
  }

  flush();
  return compactRows;
};

const buildFullContentDiff = (
  beforeContent: string,
  afterContent: string,
): SideBySideDiffRow[] => {
  const beforeLines = splitDiffContentLines(beforeContent);
  const afterLines = splitDiffContentLines(afterContent);
  const rowCountProduct = beforeLines.length * afterLines.length;

  if (beforeLines.length === 0 && afterLines.length === 0) {
    return [];
  }

  if (rowCountProduct > 2_000_000) {
    return compactChangedRows([
      ...beforeLines.map((text, index) => ({
        kind: "removed" as const,
        oldLine: index + 1,
        text,
      })),
      ...afterLines.map((text, index) => ({
        kind: "added" as const,
        newLine: index + 1,
        text,
      })),
    ]);
  }

  const columnCount = afterLines.length + 1;
  const table = new Uint32Array((beforeLines.length + 1) * columnCount);
  const at = (beforeIndex: number, afterIndex: number) =>
    beforeIndex * columnCount + afterIndex;

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      table[at(beforeIndex, afterIndex)] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? table[at(beforeIndex + 1, afterIndex + 1)] + 1
          : Math.max(
              table[at(beforeIndex + 1, afterIndex)],
              table[at(beforeIndex, afterIndex + 1)],
            );
    }
  }

  const rawRows: Parameters<typeof compactChangedRows>[0] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
    if (
      beforeIndex < beforeLines.length &&
      afterIndex < afterLines.length &&
      beforeLines[beforeIndex] === afterLines[afterIndex]
    ) {
      rawRows.push({
        kind: "context",
        oldLine: beforeIndex + 1,
        newLine: afterIndex + 1,
        text: beforeLines[beforeIndex],
      });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      beforeIndex < beforeLines.length &&
      (afterIndex >= afterLines.length ||
        table[at(beforeIndex + 1, afterIndex)] >=
          table[at(beforeIndex, afterIndex + 1)])
    ) {
      rawRows.push({
        kind: "removed",
        oldLine: beforeIndex + 1,
        text: beforeLines[beforeIndex],
      });
      beforeIndex += 1;
    } else if (afterIndex < afterLines.length) {
      rawRows.push({
        kind: "added",
        newLine: afterIndex + 1,
        text: afterLines[afterIndex],
      });
      afterIndex += 1;
    }
  }

  return compactChangedRows(rawRows);
};

export const VersionControlPanel = ({
  panelMode = "worktree",
  versionStatus,
  versions,
  versionDiff,
  versionFiles,
  historyVersionDiff,
  selectedVersionFilePath,
  selectedHistoryVersionId,
  selectedVersionHistoryBranchName,
  selectedVersionSnapshotFilePath,
  versionMessage,
  versionError,
  isVersionControlLoading,
  isVersionControlInitializing,
  isVersionDiffLoading,
  isVersionFilesLoading,
  isVersionFileContentLoading,
  isCreatingVersion,
  isVersionHistoryLoading,
  restoringVersionFilePath,
  onRefreshVersionControl,
  onSelectVersionFile,
  onSelectHistoryVersion,
  onSelectVersionHistoryBranch,
  onSelectHistoryVersionFile,
  onVersionMessageChange,
  onCreateVersion,
  onRestoreHistoryVersionFile,
}: VersionControlPanelProps) => {
  const [isDiffDialogOpen, setIsDiffDialogOpen] = useState(false);
  const [diffDialogFilePath, setDiffDialogFilePath] = useState("");
  const [isCommitDetailsDialogOpen, setIsCommitDetailsDialogOpen] = useState(false);
  const [selectedCommitPaths, setSelectedCommitPaths] = useState<string[]>([]);
  const [hasCustomizedCommitSelection, setHasCustomizedCommitSelection] = useState(false);
  const [expandedVersionFileTreePaths, setExpandedVersionFileTreePaths] = useState<Set<string>>(
    () => new Set(),
  );
  const versionFileTree = useMemo(
    () => buildVersionFileTree(versionFiles),
    [versionFiles],
  );
  const sideBySideDiffRows = useMemo(() => {
    if (
      typeof versionDiff?.beforeContent === "string" ||
      typeof versionDiff?.afterContent === "string"
    ) {
      return buildFullContentDiff(
        versionDiff?.beforeContent ?? "",
        versionDiff?.afterContent ?? "",
      );
    }
    return parseUnifiedDiff(versionDiff?.patch ?? "");
  }, [versionDiff?.afterContent, versionDiff?.beforeContent, versionDiff?.patch]);
  const historySideBySideDiffRows = useMemo(() => {
    if (
      typeof historyVersionDiff?.beforeContent === "string" ||
      typeof historyVersionDiff?.afterContent === "string"
    ) {
      return buildFullContentDiff(
        historyVersionDiff?.beforeContent ?? "",
        historyVersionDiff?.afterContent ?? "",
      );
    }
    return parseUnifiedDiff(historyVersionDiff?.patch ?? "");
  }, [
    historyVersionDiff?.afterContent,
    historyVersionDiff?.beforeContent,
    historyVersionDiff?.patch,
  ]);
  const diffChangeRowIndexes = useMemo(
    () =>
      sideBySideDiffRows.reduce<number[]>((indexes, row, index) => {
        if (!("text" in row) && row.kind !== "context") {
          indexes.push(index);
        }
        return indexes;
      }, []),
    [sideBySideDiffRows],
  );
  const [activeDiffChangeIndex, setActiveDiffChangeIndex] = useState(0);
  const diffRowRefs = useRef(new Map<number, HTMLDivElement>());
  const activeDiffRowIndex = diffChangeRowIndexes[activeDiffChangeIndex] ?? -1;
  const versionFileTreeDirectoryKey = versionFileTree.directoryPaths.join("\0");
  const isVersionControlEnabled = versionStatus?.isEnabled ?? false;
  const isVersionStatusPending = !versionStatus && isVersionControlLoading;
  const selectedHistoryVersion =
    versions.find((version) => version.id === selectedHistoryVersionId) ?? null;
  const selectedHistoryVersionFile =
    versionFiles.find((file) => file.path === selectedVersionSnapshotFilePath) ?? null;
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
    changedFilePaths.length > 0 && selectedPathsForCommit.length === changedFilePaths.length;
  const hasSelectedChangedFiles = selectedPathsForCommit.length > 0;
  const currentBranchName =
    versionStatus?.branches.find((branch) => branch.isCurrent)?.name ??
    versionStatus?.currentRef ??
    "";
  const currentHistoryBranchName =
    selectedVersionHistoryBranchName || currentBranchName;
  const canCreateVersion =
    isVersionControlEnabled &&
    Boolean(versionStatus?.hasChanges) &&
    hasSelectedChangedFiles &&
    versionMessage.trim().length > 0 &&
    !isCreatingVersion;

  useEffect(() => {
    setExpandedVersionFileTreePaths(new Set(versionFileTree.directoryPaths));
  }, [selectedHistoryVersionId, versionFileTreeDirectoryKey]);

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

  const openCommitDetails = (version: WorkspaceVersion) => {
    setIsCommitDetailsDialogOpen(true);
    onSelectHistoryVersion(version);
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

  const renderSideBySideDiffRows = (
    rows: SideBySideDiffRow[],
    options?: { enableAnchors?: boolean },
  ) => (
    <div className="min-w-0 p-3 text-[12px] leading-5">
      <div className="sticky top-0 z-10 grid grid-cols-[2.65rem_minmax(0,1fr)_2.65rem_minmax(0,1fr)] overflow-hidden rounded-t-md border border-border/60 bg-muted/70 text-xs font-medium text-muted-foreground">
        <div className="border-r border-border/60 px-2 py-1.5 text-right">
          行
        </div>
        <div className="border-r border-border/60 px-3 py-1.5">
          变更前
        </div>
        <div className="border-r border-border/60 px-2 py-1.5 text-right">
          行
        </div>
        <div className="px-3 py-1.5">变更后</div>
      </div>
      <div className="overflow-hidden rounded-b-md border-x border-b border-border/60">
        {rows.map((row, index) => {
          if ("text" in row) {
            return (
              <div
                key={`${row.kind}-${index}`}
                className="border-b border-border/50 bg-muted/45 px-3 py-1.5 font-mono text-[11px] text-muted-foreground last:border-b-0"
              >
                {row.text}
              </div>
            );
          }

          const oldChanged = row.kind === "removed" || row.kind === "changed";
          const newChanged = row.kind === "added" || row.kind === "changed";
          const oldEmpty = row.kind === "added";
          const newEmpty = row.kind === "removed";
          const isActiveChangeRow =
            Boolean(options?.enableAnchors) && index === activeDiffRowIndex;

          return (
            <div
              key={`${row.kind}-${index}`}
              ref={(node) => {
                if (!options?.enableAnchors) {
                  return;
                }
                if (node) {
                  diffRowRefs.current.set(index, node);
                } else {
                  diffRowRefs.current.delete(index);
                }
              }}
              className={cn(
                "grid grid-cols-[2.65rem_minmax(0,1fr)_2.65rem_minmax(0,1fr)] border-b border-border/40 last:border-b-0",
                isActiveChangeRow && "ring-2 ring-primary/45 ring-inset",
              )}
            >
              <div
                className={cn(
                  "border-r border-border/50 px-2 py-1 text-right font-mono text-[11px] text-muted-foreground",
                  oldChanged && "bg-destructive/10 text-destructive",
                  oldEmpty && "bg-muted/25",
                )}
              >
                {row.oldLine ?? ""}
              </div>
              <pre
                className={cn(
                  "min-h-5 whitespace-pre-wrap break-words border-r border-border/50 px-3 py-1 font-mono text-[11px] text-foreground",
                  oldChanged && "bg-destructive/10 text-destructive",
                  oldEmpty && "bg-muted/25 text-muted-foreground",
                )}
              >
                {oldChanged ? "- " : "  "}
                {row.oldText || " "}
              </pre>
              <div
                className={cn(
                  "border-r border-border/50 px-2 py-1 text-right font-mono text-[11px] text-muted-foreground",
                  newChanged && "bg-emerald-500/10 text-emerald-800",
                  newEmpty && "bg-muted/25",
                )}
              >
                {row.newLine ?? ""}
              </div>
              <pre
                className={cn(
                  "min-h-5 whitespace-pre-wrap break-words px-3 py-1 font-mono text-[11px] text-foreground",
                  newChanged && "bg-emerald-500/10 text-emerald-800",
                  newEmpty && "bg-muted/25 text-muted-foreground",
                )}
              >
                {newChanged ? "+ " : "  "}
                {row.newText || " "}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderVersionFileTreeNode = (node: VersionFileTreeNode, depth: number) => {
    const paddingLeft = `${0.45 + depth * 0.85}rem`;

    if (node.isDirectory) {
      const isExpanded = expandedVersionFileTreePaths.has(node.path);

      return (
        <div key={node.path} className="min-w-0 overflow-hidden">
          <button
            type="button"
            className="flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md pr-2 text-left text-sm transition-colors hover:bg-muted/55 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            style={{ paddingLeft }}
            onClick={() => toggleVersionFileTreeDirectory(node.path)}
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
              {node.children.map((child) => renderVersionFileTreeNode(child, depth + 1))}
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
        data-active={node.path === selectedVersionSnapshotFilePath}
        title={fileTitle}
        onClick={() => {
          if (selectedHistoryVersion) {
            onSelectHistoryVersionFile(selectedHistoryVersion.id, node.path);
          }
        }}
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
              statusClasses[fileStatus],
            )}
            title={statusTitles[fileStatus]}
          >
            {statusLabels[fileStatus]}
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

  if (panelMode === "history") {
    return (
      <section className="min-w-0 space-y-3 overflow-hidden">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <History className="size-4 shrink-0" />
            <span className="shrink-0">提交历史</span>
            {currentHistoryBranchName && (
              <span className="min-w-0 truncate rounded-md bg-muted/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {currentHistoryBranchName}
              </span>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 w-full min-w-0 justify-start gap-2 bg-background/60"
                >
                  <GitBranch className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {currentHistoryBranchName || "HEAD"}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
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

            <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md bg-muted/45 px-2.5 py-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                提交数
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {isVersionHistoryLoading ? "读取中" : versions.length}
              </span>
            </div>

            <div className="min-w-0 space-y-1">
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
                    className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/45 data-[active=true]:bg-muted/70"
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
                      <div className="min-w-0 space-y-0.5 p-3 pr-4">
                        {!selectedHistoryVersion ? (
                          <div className="px-2 py-8 text-sm text-muted-foreground">
                            选择一个提交
                          </div>
                        ) : isVersionFilesLoading ? (
                          <div className="px-2 py-8 text-sm text-muted-foreground">
                            正在读取提交文件
                          </div>
                        ) : versionFileTree.nodes.length ? (
                          versionFileTree.nodes.map((node) =>
                            renderVersionFileTreeNode(node, 0),
                          )
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
                          renderSideBySideDiffRows(historySideBySideDiffRows)
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
  }

  return (
    <section className="min-w-0 space-y-3 overflow-hidden">
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
          <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md border border-border/50 bg-background/45 px-2.5 py-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">
              当前分支
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-medium">
              {currentBranchName || "HEAD"}
            </span>
            {versionStatus?.head && (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                {versionStatus.head}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-md bg-muted/45 px-2.5 py-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                工作区
              </span>
              <span
                className={cn(
                  "shrink-0 font-medium tabular-nums",
                  versionStatus?.hasChanges ? "text-amber-700" : "text-emerald-700",
                )}
              >
                {versionStatus?.hasChanges
                  ? `${versionStatus.changedFileCount} 项变更`
                  : "干净"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
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
                <FileDiff className="size-3.5" />
                <span>变更文件</span>
              </div>
              <span className="shrink-0 tabular-nums">
                待提交 {selectedPathsForCommit.length}/{changedFilePaths.length}
              </span>
            </div>
            <ScrollArea className="max-h-40 min-w-0 overflow-hidden">
              <div className="min-w-0 space-y-0.5 pr-2">
                {versionStatus?.files.length ? (
                  versionStatus.files.map((file) => {
                    const isSelectedForCommit = selectedCommitPathSet.has(file.path);
                    const fileLabel = file.previousPath
                      ? `${file.previousPath} -> ${file.path}`
                      : file.path;

                    return (
                      <div
                        key={file.path}
                        className="grid h-8 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-md px-2 transition-colors hover:bg-muted/55 data-[active=true]:bg-muted/70"
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
                              statusClasses[file.status],
                            )}
                            title={statusTitles[file.status]}
                          >
                            {statusLabels[file.status]}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{fileLabel}</span>
                        </button>
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
                  renderSideBySideDiffRows(sideBySideDiffRows, { enableAnchors: true })
                ) : (
                  <div className="min-h-[360px] p-4 text-sm text-muted-foreground">
                    没有文本差异
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <div className="space-y-2 rounded-md border border-border/50 bg-background/45 p-2">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <GitCommitHorizontal className="size-3.5" />
                <span>提交</span>
              </div>
              <span className="shrink-0 tabular-nums">
                {selectedPathsForCommit.length} 个文件
              </span>
            </div>
            <Input
              value={versionMessage}
              placeholder="填写提交说明"
              onChange={(event) => onVersionMessageChange(event.target.value)}
              disabled={isCreatingVersion}
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
