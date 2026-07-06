import type { AgentClientAgentEvent } from "@/agent-client/types";
import type { AgentMessageBlock, ChatMessage } from "../types";

export const AGENT_BLOCK_AUTO_COLLAPSE_DELAY_MS = 2500;

export type AgentEventGroup = {
  id: string;
  title: string;
  status: "running" | "done" | "error" | "info";
  events: AgentClientAgentEvent[];
};

const createAgentBlockId = () => crypto.randomUUID();

const stringifyBrief = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);

  if (!text) {
    return "";
  }

  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
};

const describeTaskState = (state: string) => {
  switch (state) {
    case "queued":
      return "Agent 任务已排队";
    case "recovering":
      return "Agent 队列任务正在恢复";
    case "starting":
      return "Agent 正在启动";
    case "running":
      return "Agent 正在运行";
    case "waiting_user":
      return "Agent 等待用户回答";
    case "completing":
      return "Agent 正在收尾";
    case "done":
      return "Agent 任务完成";
    case "cancelling":
      return "Agent 正在取消";
    case "cancelled":
      return "Agent 任务已取消";
    case "failed":
      return "Agent 任务失败";
    default:
      return `Agent 状态：${state}`;
  }
};

export const describeAgentEvent = (event: AgentClientAgentEvent) => {
  if (event.type === "state") {
    return describeTaskState(event.taskState);
  }

  if (event.type === "started") {
    return "Agent 已启动";
  }

  if (event.type === "tool_start") {
    return `调用工具 ${event.toolName}: ${stringifyBrief(event.args)}`;
  }

  if (event.type === "question") {
    return `等待用户回答：${event.question}`;
  }

  if (event.type === "question_answered") {
    return `用户已回答：${event.answer}`;
  }

  if (event.type === "tool_update") {
    return `工具更新 ${event.toolName}: ${stringifyBrief(event.partialResult)}`;
  }

  if (event.type === "tool_end") {
    return `${event.isError ? "工具失败" : "工具完成"} ${event.toolName}: ${stringifyBrief(event.result)}`;
  }

  if (event.type === "stderr") {
    return `Agent 日志：${event.message}`;
  }

  if (event.type === "exit") {
    return event.success ? "Agent 任务已退出" : `Agent 任务异常退出：${event.code ?? "unknown"}`;
  }

  if (event.type === "error") {
    return `Agent 错误：${event.message}`;
  }

  if (event.type === "done") {
    return "Agent 任务完成";
  }

  return "";
};

export const describeAgentGroupEvent = (event: AgentClientAgentEvent) => {
  if (event.type === "tool_start") {
    return `开始：${stringifyBrief(event.args)}`;
  }

  if (event.type === "tool_update") {
    return `更新：${stringifyBrief(event.partialResult)}`;
  }

  if (event.type === "tool_end") {
    return `${event.isError ? "失败" : "完成"}：${stringifyBrief(event.result)}`;
  }

  return describeAgentEvent(event);
};

export const groupAgentEvents = (events: AgentClientAgentEvent[]) => {
  const groups: AgentEventGroup[] = [];
  const lastToolGroupByName = new Map<string, AgentEventGroup>();

  events.forEach((event, index) => {
    if (event.type === "tool_start") {
      const group: AgentEventGroup = {
        id: `${index}-${event.toolName}`,
        title: event.toolName,
        status: "running",
        events: [event],
      };
      groups.push(group);
      lastToolGroupByName.set(event.toolName, group);
      return;
    }

    if (event.type === "tool_update" || event.type === "tool_end") {
      const group = lastToolGroupByName.get(event.toolName);
      if (group) {
        group.events.push(event);
        if (event.type === "tool_end") {
          group.status = event.isError ? "error" : "done";
          lastToolGroupByName.delete(event.toolName);
        }
        return;
      }
    }

    const group: AgentEventGroup = {
      id: `${index}-${event.type}`,
      title: event.type === "stderr" ? "Agent 日志" : describeAgentEvent(event),
      status: event.type === "error" ? "error" : "info",
      events: [event],
    };
    groups.push(group);
  });

  return groups;
};

export const mergeAgentThinking = (blocks: AgentMessageBlock[]) =>
  blocks
    .filter((block) => block.type === "thinking")
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join("\n\n");

export const updateLastAgentTextBlock = (message: ChatMessage, updater: (content: string) => string) => {
  const blocks = [...(message.agentBlocks ?? [])];
  const lastBlock = blocks.at(-1);

  if (lastBlock?.type === "text") {
    blocks[blocks.length - 1] = {
      ...lastBlock,
      content: updater(lastBlock.content),
    };
  } else {
    blocks.push({
      id: createAgentBlockId(),
      type: "text",
      content: updater(""),
    });
  }

  return blocks;
};

export const updateLastAgentThinkingBlock = (message: ChatMessage, updater: (content: string) => string) => {
  const blocks = [...(message.agentBlocks ?? [])];
  const lastBlock = blocks.at(-1);

  if (lastBlock?.type === "thinking") {
    blocks[blocks.length - 1] = {
      ...lastBlock,
      content: updater(lastBlock.content),
    };
  } else {
    const hasPreviousThinking = blocks.some((block) => block.type === "thinking");
    blocks.push({
      id: createAgentBlockId(),
      type: "thinking",
      content: updater(""),
    });

    if (hasPreviousThinking) {
      return blocks.map((block, index) =>
        block.type === "thinking" && index < blocks.length - 1 ? { ...block, isCollapsed: true } : block,
      );
    }
  }

  return blocks;
};

export const findLastAgentThinkingBlockId = (blocks: AgentMessageBlock[]) => {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.type === "thinking") {
      return block.id;
    }
  }

  return null;
};

export const finalizeLastAgentThinkingBlock = (message: ChatMessage, content: string) => {
  const blocks = [...(message.agentBlocks ?? [])];
  const thinkingIndex = (() => {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index].type === "thinking") {
        return index;
      }
    }

    return -1;
  })();
  const nextContent = content.trim();

  if (thinkingIndex < 0) {
    if (!nextContent) {
      return { blocks, blockId: null };
    }

    const blockId = createAgentBlockId();
    blocks.push({
      id: blockId,
      type: "thinking",
      content,
    });
    return { blocks, blockId };
  }

  const block = blocks[thinkingIndex];
  if (block.type !== "thinking") {
    return { blocks, blockId: null };
  }

  const contentForBlock = content || block.content;
  if (!contentForBlock.trim()) {
    blocks.splice(thinkingIndex, 1);
    return { blocks, blockId: null };
  }

  blocks[thinkingIndex] = {
    ...block,
    content: contentForBlock,
  };
  return { blocks, blockId: block.id };
};

export const removeEmptyAgentThinkingBlocks = (blocks: AgentMessageBlock[] | undefined) =>
  blocks?.filter((block) => block.type !== "thinking" || block.content.trim());

export const appendAgentToolEventBlock = (
  message: ChatMessage,
  event: Extract<AgentClientAgentEvent, { type: "tool_start" | "tool_update" | "tool_end" }>,
) => {
  const blocks = [...(message.agentBlocks ?? [])];
  const findRunningToolBlockIndex = () => {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      if (block.type === "tool" && block.toolName === event.toolName && block.status === "running") {
        return index;
      }
    }

    return -1;
  };
  const existingIndex = event.type === "tool_start" ? -1 : findRunningToolBlockIndex();
  const status = event.type === "tool_end" ? (event.isError ? "error" : "done") : "running";
  let blockId: string | null = null;

  if (existingIndex >= 0) {
    const block = blocks[existingIndex];
    if (block.type === "tool") {
      blockId = block.id;
      blocks[existingIndex] = {
        ...block,
        status,
        events: [...block.events, event],
      };
    }
  } else {
    blockId = createAgentBlockId();
    blocks.push({
      id: blockId,
      type: "tool",
      toolName: event.toolName,
      status,
      events: [event],
    });
  }

  return { blocks, blockId };
};

export const isTimelineEvent = (event: AgentClientAgentEvent) =>
  event.type !== "text_delta" &&
  event.type !== "thinking_delta" &&
  event.type !== "thinking_end" &&
  event.type !== "replace_text" &&
  event.type !== "done";

export type AppliedAgentMessageEvent = {
  message: ChatMessage;
  thinkingBlockId: string | null;
  completedToolBlockId: string | null;
};

type AgentMessageStreamEvent = Extract<
  AgentClientAgentEvent,
  { type: "text_delta" | "thinking_delta" | "thinking_end" | "replace_text" }
>;

type AgentToolEvent = Extract<AgentClientAgentEvent, { type: "tool_start" | "tool_update" | "tool_end" }>;

export const isAgentMessageStreamEvent = (event: AgentClientAgentEvent): event is AgentMessageStreamEvent =>
  event.type === "text_delta" ||
  event.type === "thinking_delta" ||
  event.type === "thinking_end" ||
  event.type === "replace_text";

const isAgentToolEvent = (event: AgentClientAgentEvent): event is AgentToolEvent =>
  event.type === "tool_start" || event.type === "tool_update" || event.type === "tool_end";

const appliedAgentMessageEvent = (
  message: ChatMessage,
  thinkingBlockId: string | null = null,
  completedToolBlockId: string | null = null,
): AppliedAgentMessageEvent => ({
  message,
  thinkingBlockId,
  completedToolBlockId,
});

export const applyAgentEventToMessage = (
  message: ChatMessage,
  event: AgentClientAgentEvent,
): AppliedAgentMessageEvent => {
  if (event.type === "text_delta") {
    const text = `${message.text}${event.delta}`;
    return appliedAgentMessageEvent({
      ...message,
      text,
      agentBlocks: updateLastAgentTextBlock(message, (content) => `${content}${event.delta}`),
      status: "streaming",
    });
  }

  if (event.type === "thinking_delta") {
    const agentBlocks = updateLastAgentThinkingBlock(message, (content) => `${content}${event.delta}`);
    return appliedAgentMessageEvent({
      ...message,
      thinking: mergeAgentThinking(agentBlocks),
      agentBlocks,
      status: "streaming",
    });
  }

  if (event.type === "thinking_end") {
    const result = finalizeLastAgentThinkingBlock(message, event.content);
    return appliedAgentMessageEvent(
      {
        ...message,
        thinking: mergeAgentThinking(result.blocks),
        agentBlocks: result.blocks,
        status: "streaming",
      },
      result.blockId,
    );
  }

  if (event.type === "replace_text") {
    return appliedAgentMessageEvent({
      ...message,
      text: event.text,
      agentBlocks: updateLastAgentTextBlock(message, () => event.text),
      status: "streaming",
    });
  }

  if (event.type === "done") {
    const assistantText = event.text.trim();
    const text = assistantText || message.text || "Agent 任务已完成。";
    const hasTextBlock = message.agentBlocks?.some((block) => block.type === "text");
    const agentBlocks = removeEmptyAgentThinkingBlocks(message.agentBlocks);
    return appliedAgentMessageEvent({
      ...message,
      text,
      agentBlocks: hasTextBlock
        ? agentBlocks
        : updateLastAgentTextBlock(
            {
              ...message,
              agentBlocks,
            },
            () => text,
          ),
      status: "done",
    });
  }

  if (isTimelineEvent(event)) {
    let agentBlocks = message.agentBlocks;
    let completedToolBlockId: string | null = null;

    if (isAgentToolEvent(event)) {
      const result = appendAgentToolEventBlock(message, event);
      agentBlocks = result.blocks;
      completedToolBlockId = event.type === "tool_end" ? result.blockId : null;
    }

    return appliedAgentMessageEvent(
      {
        ...message,
        agentBlocks,
        agentEvents: [...(message.agentEvents ?? []), event].slice(-80),
        status: event.type === "error" ? "error" : message.status,
      },
      null,
      completedToolBlockId,
    );
  }

  return appliedAgentMessageEvent(message);
};
