import type { ChatTraceStep, ChatTraceTurn } from "../../types";

export const traceModeLabels: Record<ChatTraceTurn["mode"], string> = {
  chat: "聊天",
  agent: "Agent",
  collab: "协作",
};

export const traceStatusLabels: Record<ChatTraceTurn["status"], string> = {
  running: "进行中",
  done: "完成",
  error: "异常",
};

export const traceStepStatusLabels: Record<NonNullable<ChatTraceStep["status"]>, string> = {
  pending: "等待",
  running: "进行中",
  done: "完成",
  error: "异常",
};

export const traceStatusClasses: Record<ChatTraceTurn["status"], string> = {
  running: "bg-sky-500",
  done: "bg-emerald-500",
  error: "bg-destructive",
};

export const traceStepStatusClasses: Record<NonNullable<ChatTraceStep["status"]>, string> = {
  pending: "bg-muted-foreground/45",
  running: "bg-sky-500",
  done: "bg-muted-foreground/55",
  error: "bg-destructive",
};

export const getTraceStepDisplayStatus = (
  turnStatus: ChatTraceTurn["status"],
  stepStatus?: ChatTraceStep["status"],
) => {
  if (!stepStatus) {
    return undefined;
  }

  if ((stepStatus === "running" || stepStatus === "pending") && turnStatus !== "running") {
    return turnStatus === "error" ? "error" : "done";
  }

  return stepStatus;
};

export const formatTraceTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const formatTraceDuration = (durationMs?: number | null) => {
  if (typeof durationMs !== "number") {
    return "";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
};

export const traceJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
