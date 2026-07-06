import { ChevronDown, ChevronRight, Loader2, Wrench } from "lucide-react";
import type { ChatMessage } from "../../types";
import type { AgentEventGroup } from "../../utils/agent-blocks";
import { describeAgentGroupEvent } from "../../utils/agent-blocks";

type AgentEventTimelineProps = {
  messageId: string;
  messageStatus: ChatMessage["status"];
  agentEventGroups: AgentEventGroup[];
  isCollapsed: boolean;
  onToggle: () => void;
};

export const AgentEventTimeline = ({
  messageId,
  messageStatus,
  agentEventGroups,
  isCollapsed,
  onToggle,
}: AgentEventTimelineProps) => {
  if (agentEventGroups.length === 0) {
    return null;
  }

  const visibleAgentEventGroups =
    messageStatus === "done" || !isCollapsed ? agentEventGroups : agentEventGroups.slice(-5);
  const hiddenAgentEventGroupCount = agentEventGroups.length - visibleAgentEventGroups.length;
  const agentErrorCount = agentEventGroups.filter((group) => group.status === "error").length;

  return (
    <div className="mb-2 overflow-hidden rounded-md bg-muted/35 shadow-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={onToggle}
      >
        {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        <Wrench className="size-3.5" />
        <span>Agent 执行</span>
        <span className="rounded-sm bg-background px-1.5 py-0.5 text-[11px]">{agentEventGroups.length} 段</span>
        {agentErrorCount > 0 && (
          <span className="rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
            {agentErrorCount} 个错误
          </span>
        )}
        {(messageStatus === "loading" || messageStatus === "streaming") && (
          <Loader2 className="ml-auto size-3 animate-spin" />
        )}
      </button>
      {!isCollapsed && (
        <div className="max-h-72 space-y-1.5 overflow-auto bg-background/45 px-2.5 py-2">
          {hiddenAgentEventGroupCount > 0 && (
            <div className="rounded-sm bg-background/70 px-2 py-1 text-xs text-muted-foreground">
              已折叠较早的 {hiddenAgentEventGroupCount} 段执行过程，当前显示最近阶段。
            </div>
          )}
          {visibleAgentEventGroups.map((group) => {
            const latestEvent = group.events[group.events.length - 1];
            const statusLabel =
              group.status === "running"
                ? "执行中"
                : group.status === "done"
                  ? "完成"
                  : group.status === "error"
                    ? "异常"
                    : "信息";

            return (
              <details
                key={`${messageId}-${group.id}`}
                className="group rounded-sm bg-background shadow-xs"
                open={group.status === "running" || group.status === "error"}
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{group.title}</span>
                  <span
                    className={[
                      "rounded-sm px-1.5 py-0.5 text-[11px]",
                      group.status === "error"
                        ? "bg-destructive/10 text-destructive"
                        : group.status === "running"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {statusLabel}
                  </span>
                  <span className="text-[11px]">{group.events.length} 条</span>
                </summary>
                <div className="space-y-1 bg-muted/25 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                  {group.events.slice(-8).map((event, index) => (
                    <div
                      key={`${messageId}-${group.id}-${event.type}-${index}`}
                      className="whitespace-pre-wrap break-words rounded-sm bg-muted/45 px-2 py-1"
                    >
                      {describeAgentGroupEvent(event)}
                    </div>
                  ))}
                  {group.events.length > 8 && (
                    <div className="rounded-sm bg-muted/35 px-2 py-1 text-[11px]">
                      已省略本段较早的 {group.events.length - 8} 条更新。
                    </div>
                  )}
                </div>
                {latestEvent?.type === "tool_end" && latestEvent.isError && (
                  <div className="bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                    工具执行失败，请展开查看最后几条输出。
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
};
