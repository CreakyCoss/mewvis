import type { ChatMessage } from "../../types";
import type { AgentEventGroup } from "../../utils/agent-blocks";
import { describeAgentGroupEvent } from "../../utils/agent-blocks";
import { ExecutionChain, type ExecutionChainGroup } from "@/features/ai/components/execution-chain";

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

  const isBusy = messageStatus === "loading" || messageStatus === "streaming";
  const groups: ExecutionChainGroup[] = agentEventGroups.map((group) => {
    const latestEvent = group.events[group.events.length - 1];
    return {
      id: group.id,
      title: group.title,
      status: group.status,
      defaultOpen: group.status === "running" || group.status === "error",
      events: group.events.map((event, index) => ({
        id: `${messageId}-${group.id}-${event.type}-${index}`,
        content: describeAgentGroupEvent(event),
      })),
      footer:
        latestEvent?.type === "tool_execution_end" && latestEvent.isError
          ? "工具执行失败，请展开查看最后几条输出。"
          : undefined,
    };
  });

  return <ExecutionChain groups={groups} isBusy={isBusy} isCollapsed={isCollapsed} onToggle={onToggle} />;
};
