import type { WorkspaceVersionFileStatus } from "@/features/workspace/chat/types";

export const versionStatusLabels: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  typechange: "T",
  conflicted: "!",
  untracked: "?",
};

export const versionStatusTitles: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增",
  modified: "已修改",
  deleted: "已删除",
  renamed: "已重命名",
  typechange: "类型变更",
  conflicted: "存在冲突",
  untracked: "未跟踪",
};

export const versionStatusTextClasses: Record<
  WorkspaceVersionFileStatus["status"],
  string
> = {
  added: "text-emerald-700",
  modified: "text-amber-700",
  deleted: "text-destructive",
  renamed: "text-sky-700",
  typechange: "text-violet-700",
  conflicted: "text-destructive",
  untracked: "text-muted-foreground",
};

export const fileStatusLabels: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增",
  modified: "修改",
  deleted: "删除",
  renamed: "重命名",
  typechange: "类型",
  conflicted: "冲突",
  untracked: "新增",
};

export const fileStatusTitles: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "新增文件",
  modified: "已修改",
  deleted: "已删除",
  renamed: "已重命名",
  typechange: "类型变更",
  conflicted: "存在冲突",
  untracked: "新增文件",
};

export const fileStatusBadgeClasses: Record<
  WorkspaceVersionFileStatus["status"],
  string
> = {
  added: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  modified: "bg-amber-100 text-amber-700 ring-amber-200",
  deleted: "bg-destructive/10 text-destructive ring-destructive/20",
  renamed: "bg-sky-100 text-sky-700 ring-sky-200",
  typechange: "bg-violet-100 text-violet-700 ring-violet-200",
  conflicted: "bg-destructive/10 text-destructive ring-destructive/20",
  untracked: "bg-emerald-100 text-emerald-700 ring-emerald-200",
};

export const getDiscardVersionFileLabel = (
  status: WorkspaceVersionFileStatus["status"],
) =>
  status === "added" || status === "untracked"
    ? "撤销新增"
    : status === "deleted"
    ? "撤销删除"
    : "撤销修改";

export const getDiscardVersionFileTitle = (
  status: WorkspaceVersionFileStatus["status"],
) =>
  status === "added" || status === "untracked"
    ? "撤销新增：删除这个未提交文件"
    : status === "deleted"
    ? "撤销删除：恢复这个文件"
    : "撤销修改：恢复这个文件到当前提交状态";
