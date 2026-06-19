import type { LedgerRuntimeLink } from "./types";

export const formatLedgerTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const formatLedgerDateTime = (timestamp?: number | null) =>
  timestamp
    ? new Date(timestamp).toLocaleString("zh-CN", {
      hour12: false,
    })
    : "未记录";

export const formatLedgerDuration = (durationMs?: number | null) => {
  if (typeof durationMs !== "number") {
    return "";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
};

export const ledgerJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const ledgerStatusLabels: Record<NonNullable<LedgerRuntimeLink["status"]>, string> = {
  running: "进行中",
  done: "完成",
  error: "异常",
};

export const ledgerStatusClasses: Record<NonNullable<LedgerRuntimeLink["status"]>, string> = {
  running: "bg-sky-500",
  done: "bg-emerald-500",
  error: "bg-destructive",
};

export const formatLedgerId = (value?: string | null) => {
  if (!value) {
    return "未记录";
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

export const previewLedgerText = (
  content?: string | null,
  maxLength = 72,
) => {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}...`;
};

export const formatLedgerRole = (role?: string | null) => {
  switch (role) {
    case "user":
      return "用户";
    case "assistant":
      return "助手";
    case "system":
      return "系统";
    case "tool":
      return "工具";
    default:
      return role || "消息";
  }
};
