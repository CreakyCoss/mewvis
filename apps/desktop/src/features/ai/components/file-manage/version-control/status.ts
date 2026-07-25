import type { WorkspaceVersionFileStatus } from "@/api/workspace-files";

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

export const versionStatusTextClasses: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "text-success",
  modified: "text-warning",
  deleted: "text-destructive",
  renamed: "text-primary",
  typechange: "text-accent-foreground",
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

export const fileStatusBadgeClasses: Record<WorkspaceVersionFileStatus["status"], string> = {
  added: "bg-success/10 text-success ring-success/20",
  modified: "bg-warning/10 text-warning ring-warning/20",
  deleted: "bg-destructive/10 text-destructive ring-destructive/20",
  renamed: "bg-primary/10 text-primary ring-primary/20",
  typechange: "bg-accent text-accent-foreground ring-primary/15",
  conflicted: "bg-destructive/10 text-destructive ring-destructive/20",
  untracked: "bg-success/10 text-success ring-success/20",
};

export const getDiscardVersionFileLabel = (status: WorkspaceVersionFileStatus["status"]) =>
  status === "added" || status === "untracked" ? "撤销新增" : status === "deleted" ? "撤销删除" : "撤销修改";

export const getDiscardVersionFileTitle = (status: WorkspaceVersionFileStatus["status"]) =>
  status === "added" || status === "untracked"
    ? "撤销新增：删除这个未提交文件"
    : status === "deleted"
      ? "撤销删除：恢复这个文件"
      : "撤销修改：恢复这个文件到当前提交状态";
