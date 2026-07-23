import { memo } from "react";
import { Brain, ChevronDown, ChevronRight, Loader2, Wrench } from "lucide-react";
import { SmoothMarkdownContent, SmoothPlainText } from "@/features/ai/components/markdown";
import type { AgentMessageBlock, ChatMessage } from "../../types";
import { describeAgentGroupEvent } from "../../utils/agent-blocks";

type AgentBlockListProps = {
  messageId: string;
  messageStatus: ChatMessage["status"];
  agentBlocks: AgentMessageBlock[];
  showThinkingProcess: boolean;
  showToolCallProcess: boolean;
  isBlockCollapsed: (messageId: string, block: AgentMessageBlock) => boolean;
  onToggleBlock: (messageId: string, blockId: string) => void;
};

const AgentBlockListComponent = ({
  messageId,
  messageStatus,
  agentBlocks,
  showThinkingProcess,
  showToolCallProcess,
  isBlockCollapsed,
  onToggleBlock,
}: AgentBlockListProps) => {
  const isMessageStreaming = messageStatus === "loading" || messageStatus === "streaming";
  const visibleBlocks = agentBlocks.filter((block) => {
    if (block.type === "thinking") {
      return showThinkingProcess;
    }

    if (block.type === "tool") {
      return showToolCallProcess;
    }

    return true;
  });

  if (visibleBlocks.length === 0) {
    if (messageStatus === "loading" || messageStatus === "streaming") {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Agent 正在处理</span>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-hidden">
      {visibleBlocks.map((block) => {
        if (block.type === "thinking") {
          const isCollapsed = isBlockCollapsed(messageId, block);

          return (
            <div key={block.id} className="overflow-hidden rounded-md bg-muted/35 shadow-xs">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => onToggleBlock(messageId, block.id)}
              >
                {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                <Brain className="size-3.5" />
                <span>Thinking</span>
                {messageStatus !== "done" && agentBlocks.at(-1)?.id === block.id && (
                  <Loader2 className="ml-auto size-3 animate-spin" />
                )}
              </button>
              <div
                className={[
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                ].join(" ")}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className="max-h-48 overflow-auto bg-background/45 px-2.5 py-2 text-xs leading-5 whitespace-pre-wrap text-muted-foreground"
                    data-agent-thinking-content="true"
                  >
                    <SmoothPlainText content={block.content} fallback="正在思考..." isStreaming={isMessageStreaming} />
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (block.type === "tool") {
          const latestEvent = block.events[block.events.length - 1];
          const isCollapsed = isBlockCollapsed(messageId, block);
          const statusLabel = block.status === "running" ? "执行中" : block.status === "done" ? "完成" : "异常";

          return (
            <div key={block.id} className="overflow-hidden rounded-md bg-muted/35 shadow-xs">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onToggleBlock(messageId, block.id)}
              >
                <ChevronRight className={["size-3 transition-transform", isCollapsed ? "" : "rotate-90"].join(" ")} />
                <Wrench className="size-3.5" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{block.toolName}</span>
                <span
                  className={[
                    "rounded-sm px-1.5 py-0.5 text-[11px]",
                    block.status === "error"
                      ? "bg-destructive/10 text-destructive"
                      : block.status === "running"
                        ? "bg-primary/10 text-primary"
                        : "bg-background text-muted-foreground",
                  ].join(" ")}
                >
                  {statusLabel}
                </span>
                <span className="text-[11px]">{block.events.length} 条</span>
              </button>
              <div
                className={[
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
                ].join(" ")}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="space-y-1 bg-background/45 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                    {block.events.slice(-8).map((event, index) => (
                      <div
                        key={`${block.id}-${event.type}-${index}`}
                        className="whitespace-pre-wrap break-words rounded-sm bg-background/70 px-2 py-1"
                      >
                        {describeAgentGroupEvent(event)}
                      </div>
                    ))}
                    {block.events.length > 8 && (
                      <div className="rounded-sm bg-background/60 px-2 py-1 text-[11px]">
                        已省略本段较早的 {block.events.length - 8} 条更新。
                      </div>
                    )}
                  </div>
                  {latestEvent?.type === "tool_execution_end" && latestEvent.isError && (
                    <div className="bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
                      工具执行失败，请展开查看最后几条输出。
                    </div>
                  )}
                </div>
              </div>
              {isCollapsed && latestEvent?.type === "tool_execution_end" && latestEvent.isError && (
                <div className="bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">工具执行失败</div>
              )}
            </div>
          );
        }

        return (
          <div key={block.id} className="agent-response-block min-w-0 max-w-full overflow-hidden">
            <SmoothMarkdownContent content={block.content} isStreaming={isMessageStreaming} />
          </div>
        );
      })}
    </div>
  );
};

export const AgentBlockList = memo(AgentBlockListComponent);
