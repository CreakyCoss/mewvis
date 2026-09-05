import { memo, useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon, CircleAlertIcon, Loader2Icon, WrenchIcon } from "lucide-react";
import type { ChatAssistantMessageBlock, ChatToolEvent } from "@/chat/core";
import { useFollowBottom } from "../../follow-bottom";
import { BLOCK_AUTO_COLLAPSE_DELAY } from "../constants";

type ToolBlockProps = {
  block: Extract<ChatAssistantMessageBlock, { type: "tool" }>;
};

const TOOL_VISIBLE_EVENT_LIMIT = 8;

const toolEventLabel = (event: ChatToolEvent) => {
  if (event.kind === "input") {
    return "输入";
  }
  if (event.kind === "update") {
    return "更新";
  }
  return event.isError ? "错误" : "结果";
};

const ToolBlockComponent = ({ block }: ToolBlockProps) => {
  const [manualExpanded, setManualExpanded] = useState<boolean>();
  const [autoExpanded, setAutoExpanded] = useState(block.status === "running" || block.status === "error");
  const isExpanded = manualExpanded ?? autoExpanded;
  const hiddenEventCount = Math.max(0, block.events.length - TOOL_VISIBLE_EVENT_LIMIT);
  const visibleEvents = block.events.slice(-TOOL_VISIBLE_EVENT_LIMIT);
  const statusLabel = block.status === "running" ? "执行中" : block.status === "done" ? "已完成" : "执行异常";
  const { scrollRef, handleScroll } = useFollowBottom(block.events, isExpanded);

  useEffect(() => {
    if (block.status === "running" || block.status === "error") {
      setAutoExpanded(true);
      return undefined;
    }

    const timer = window.setTimeout(() => setAutoExpanded(false), BLOCK_AUTO_COLLAPSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [block.status]);

  return (
    <div className="app-process-block overflow-hidden rounded-xl">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={`${block.name}，${statusLabel}，${block.events.length} 条记录`}
        className="app-process-trigger flex w-full min-w-0 cursor-pointer items-center gap-2 px-3 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:ring-inset"
        onClick={() => setManualExpanded(!isExpanded)}
      >
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-3.5 shrink-0 transition-transform motion-reduce:transition-none ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
        <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={block.name}>
          {block.name}
        </span>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
            block.status === "error"
              ? "bg-destructive/10 text-destructive"
              : block.status === "running"
                ? "bg-primary/10 text-primary"
                : "border border-border/60 bg-background/70 text-muted-foreground"
          }`}
        >
          {block.status === "running" ? (
            <Loader2Icon aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
          ) : block.status === "done" ? (
            <CheckIcon aria-hidden="true" className="size-3" />
          ) : (
            <CircleAlertIcon aria-hidden="true" className="size-3" />
          )}
          {statusLabel}
        </span>
        <span className="shrink-0 text-xs">{block.events.length} 条</span>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            ref={scrollRef}
            className="app-process-content max-h-72 space-y-1.5 overflow-auto px-3 py-2.5 text-xs leading-5 text-muted-foreground"
            onScroll={handleScroll}
          >
            {hiddenEventCount > 0 ? (
              <div className="rounded-lg border border-border/55 bg-surface-raised/70 px-2.5 py-1.5 text-xs">
                已省略较早的 {hiddenEventCount} 条更新。
              </div>
            ) : (
              <div className="rounded-lg border border-border/55 bg-surface-raised/70 px-2.5 py-1.5 text-xs">
                没有可展示的执行详情
              </div>
            )}
            {visibleEvents.length > 0
              ? visibleEvents.map((event) => (
                  <div
                    key={event.id}
                    className={`rounded-lg border border-border/55 bg-surface-raised/70 px-2.5 py-1.5 ${
                      event.isError ? "border-destructive/25 bg-destructive/8 text-destructive" : ""
                    }`}
                  >
                    <div className="mb-0.5 text-xs font-medium">{toolEventLabel(event)}</div>
                    <div className="break-words font-mono whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {event.content || (block.status === "running" ? "正在执行…" : "无内容")}
                    </div>
                  </div>
                ))
              : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ToolBlock = memo(ToolBlockComponent);
