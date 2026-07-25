import type { ComponentType, ReactNode } from "react";
import { ChevronDown, ChevronRight, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExecutionChainStatus = "pending" | "running" | "done" | "skipped" | "error" | "info";

export type ExecutionChainEvent = {
  id: string;
  content: ReactNode;
};

export type ExecutionChainGroup = {
  id: string;
  title: string;
  status: ExecutionChainStatus;
  events: ExecutionChainEvent[];
  footer?: ReactNode;
  defaultOpen?: boolean;
};

type ExecutionChainProps = {
  title?: string;
  groups: ExecutionChainGroup[];
  isCollapsed: boolean;
  isBusy?: boolean;
  summaryText?: string;
  collapsedRecentGroupLimit?: number;
  eventLimit?: number;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
  contentClassName?: string;
  showHeader?: boolean;
  onToggle: () => void;
};

const statusLabels: Record<ExecutionChainStatus, string> = {
  pending: "等待",
  running: "执行中",
  done: "完成",
  skipped: "跳过",
  error: "异常",
  info: "信息",
};

const statusClassNames: Record<ExecutionChainStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-primary/10 text-primary",
  done: "bg-background text-muted-foreground",
  skipped: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
  info: "bg-muted text-muted-foreground",
};

export const ExecutionChain = ({
  title = "Agent 执行",
  groups,
  isCollapsed,
  isBusy = false,
  summaryText,
  collapsedRecentGroupLimit = 5,
  eventLimit = 8,
  icon: Icon = Wrench,
  className,
  contentClassName,
  showHeader = true,
  onToggle,
}: ExecutionChainProps) => {
  if (groups.length === 0) {
    return null;
  }

  const visibleGroups =
    isBusy && groups.length > collapsedRecentGroupLimit ? groups.slice(-collapsedRecentGroupLimit) : groups;
  const hiddenGroupCount = groups.length - visibleGroups.length;
  const errorCount = groups.filter((group) => group.status === "error").length;
  const runningCount = groups.filter((group) => group.status === "running").length;
  const shouldShowContent = !showHeader || !isCollapsed;

  return (
    <div className={cn("app-process-block mb-3 overflow-hidden rounded-xl", className)}>
      {showHeader && (
        <button
          type="button"
          className="app-process-trigger flex w-full min-w-0 items-center gap-2 px-3 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:ring-inset"
          onClick={onToggle}
        >
          {isCollapsed ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
          <Icon className="size-3.5 shrink-0" />
          <span className="shrink-0">{title}</span>
          <span className="rounded-md border border-border/60 bg-background/70 px-2 py-0.5 text-xs">
            {groups.length} 段
          </span>
          {summaryText ? (
            <span className="min-w-0 truncate rounded-md bg-background/70 px-2 py-0.5 text-xs">{summaryText}</span>
          ) : null}
          {errorCount > 0 && (
            <span className="shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              {errorCount} 个错误
            </span>
          )}
          {(isBusy || runningCount > 0) && (
            <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          )}
        </button>
      )}

      {shouldShowContent && (
        <div
          className={cn(
            "app-process-content max-h-72 space-y-2 overflow-auto px-3 py-2.5",
            !showHeader && "bg-transparent",
            contentClassName,
          )}
        >
          {hiddenGroupCount > 0 && (
            <div className="rounded-lg border border-border/55 bg-surface-raised/70 px-2.5 py-1.5 text-xs text-muted-foreground">
              已折叠较早的 {hiddenGroupCount} 段执行过程，当前显示最近阶段。
            </div>
          )}
          {visibleGroups.map((group) => {
            const statusLabel = statusLabels[group.status];
            const eventCount = group.events.length;
            const visibleEvents = group.events.slice(-eventLimit);
            const isGroupOpen = group.defaultOpen ?? (group.status === "running" || group.status === "error");

            return (
              <details
                key={group.id}
                className="group overflow-hidden rounded-lg border border-border/60 bg-surface-raised/75"
                open={isGroupOpen}
              >
                <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 py-1 text-xs text-muted-foreground outline-none hover:bg-accent/35 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3 shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-90" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{group.title}</span>
                  <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs", statusClassNames[group.status])}>
                    {statusLabel}
                  </span>
                  <span className="shrink-0 text-xs">{eventCount} 条</span>
                </summary>
                <div className="space-y-1.5 border-t border-border/55 bg-background/45 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                  {visibleEvents.map((event) => (
                    <div
                      key={event.id}
                      className="whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-surface/55 px-2.5 py-1.5"
                    >
                      {event.content}
                    </div>
                  ))}
                  {eventCount > eventLimit && (
                    <div className="rounded-lg border border-border/50 bg-surface/55 px-2.5 py-1.5 text-xs">
                      已省略本段较早的 {eventCount - eventLimit} 条更新。
                    </div>
                  )}
                </div>
                {group.footer ? (
                  <div className="border-t border-destructive/20 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                    {group.footer}
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
