import { CircleAlert, CircleCheck, Clock3, Loader2 } from "lucide-react";
import type { KnowledgeIndexStatus } from "../types";

type StatusBadgeProps = {
  status: KnowledgeIndexStatus | null;
  invalidModel?: boolean;
};

const badgeClassName =
  "inline-flex w-fit justify-self-start items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium";

export const StatusBadge = ({ status, invalidModel = false }: StatusBadgeProps) => {
  if (invalidModel) {
    return (
      <span className={`${badgeClassName} bg-destructive/9 text-destructive`}>
        <CircleAlert className="size-3.5" />
        模型失效
      </span>
    );
  }

  if (status?.status === "ready") {
    return (
      <span className={`${badgeClassName} bg-accent text-primary`}>
        <CircleCheck className="size-3.5" />
        可检索
      </span>
    );
  }

  if (status?.status === "building") {
    return (
      <span className={`${badgeClassName} bg-primary/9 text-primary`}>
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
        正在建立
      </span>
    );
  }

  if (status?.status === "error") {
    return (
      <span className={`${badgeClassName} bg-destructive/9 text-destructive`}>
        <CircleAlert className="size-3.5" />
        建立失败
      </span>
    );
  }

  return (
    <span className={`${badgeClassName} bg-warning/10 text-warning`}>
      <Clock3 className="size-3.5" />
      {status?.status === "stale" ? "等待更新" : "等待建立"}
    </span>
  );
};

export const formatKnowledgeTime = (value: number | null | undefined) => {
  if (!value) return "尚未建立";
  const delta = Date.now() - value;
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
