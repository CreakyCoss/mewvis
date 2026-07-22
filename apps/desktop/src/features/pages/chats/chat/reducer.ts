import type { AgentClientAgentEvent } from "@/agent-client/types";
import type { ChatAssistantMessage, ChatAssistantMessageBlock, ChatToolEvent } from "./type";

type ChatEvent = Extract<
  AgentClientAgentEvent,
  {
    type:
      | "text_delta"
      | "replace_text"
      | "thinking_delta"
      | "thinking_end"
      | "tool_start"
      | "tool_update"
      | "tool_end"
      | "done";
  }
>;

const TOOL_EVENT_CONTENT_LIMIT = 2000;
const TOOL_EVENT_HISTORY_LIMIT = 40;

const createBlockId = () => crypto.randomUUID();

const findLastBlockIndex = (
  blocks: ChatAssistantMessageBlock[],
  predicate: (block: ChatAssistantMessageBlock) => boolean,
) => {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (predicate(blocks[index])) {
      return index;
    }
  }

  return -1;
};

const stringifyToolValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value ?? "");
  } catch {
    return String(value ?? "");
  }
};

const limitToolEventContent = (content: string) =>
  content.length > TOOL_EVENT_CONTENT_LIMIT
    ? `${content.slice(0, TOOL_EVENT_CONTENT_LIMIT)}\n…已省略后续内容`
    : content;

const createToolEvent = (kind: ChatToolEvent["kind"], value: unknown, isError = false): ChatToolEvent => ({
  id: createBlockId(),
  kind,
  content: limitToolEventContent(stringifyToolValue(value)),
  ...(isError ? { isError: true } : {}),
});

const appendText = (message: ChatAssistantMessage, content: string) => {
  const blocks = [...message.blocks];
  const lastBlock = blocks.at(-1);

  if (lastBlock?.type === "text") {
    blocks[blocks.length - 1] = { ...lastBlock, content: `${lastBlock.content}${content}` };
  } else {
    blocks.push({ id: createBlockId(), type: "text", content });
  }

  return blocks;
};

const replaceLastText = (message: ChatAssistantMessage, content: string) => {
  const blocks = [...message.blocks];
  const lastBlock = blocks.at(-1);

  if (lastBlock?.type === "text") {
    blocks[blocks.length - 1] = { ...lastBlock, content };
  } else {
    blocks.push({ id: createBlockId(), type: "text", content });
  }

  return blocks;
};

const appendThinking = (message: ChatAssistantMessage, content: string) => {
  const blocks = [...message.blocks];
  const lastBlock = blocks.at(-1);

  if (lastBlock?.type === "thinking") {
    blocks[blocks.length - 1] = { ...lastBlock, content: `${lastBlock.content}${content}` };
  } else {
    const hasPreviousThinking = blocks.some((block) => block.type === "thinking");
    blocks.push({ id: createBlockId(), type: "thinking", content });
    if (hasPreviousThinking) {
      return blocks.map((block, index) =>
        block.type === "thinking" && index < blocks.length - 1 ? { ...block, isCollapsed: true } : block,
      );
    }
  }

  return blocks;
};

const finalizeThinking = (message: ChatAssistantMessage, content: string) => {
  const blocks = [...message.blocks];
  const lastThinkingIndex = findLastBlockIndex(blocks, (block) => block.type === "thinking");

  if (lastThinkingIndex >= 0) {
    const block = blocks[lastThinkingIndex];
    if (block.type === "thinking") {
      const nextContent = content || block.content;
      if (nextContent.trim()) {
        blocks[lastThinkingIndex] = { ...block, content: nextContent };
      } else {
        blocks.splice(lastThinkingIndex, 1);
      }
    }
  } else if (content.trim()) {
    blocks.push({ id: createBlockId(), type: "thinking", content });
  }

  return blocks;
};

const appendToolEvent = (
  message: ChatAssistantMessage,
  event: Extract<ChatEvent, { type: "tool_start" | "tool_update" | "tool_end" }>,
) => {
  const blocks = [...message.blocks];

  if (event.type === "tool_start") {
    blocks.push({
      id: createBlockId(),
      type: "tool",
      name: event.toolName,
      status: "running",
      events: [createToolEvent("input", event.args)],
    });
    return blocks;
  }

  const runningToolIndex = findLastBlockIndex(
    blocks,
    (block) => block.type === "tool" && block.name === event.toolName && block.status === "running",
  );
  const status = event.type === "tool_end" ? (event.isError ? "error" : "done") : "running";
  const toolEvent =
    event.type === "tool_update"
      ? createToolEvent("update", event.partialResult)
      : createToolEvent("output", event.result, event.isError);

  if (runningToolIndex >= 0) {
    const block = blocks[runningToolIndex];
    if (block.type === "tool") {
      blocks[runningToolIndex] = {
        ...block,
        status,
        events: [...block.events, toolEvent].slice(-TOOL_EVENT_HISTORY_LIMIT),
      };
    }
  } else {
    blocks.push({
      id: createBlockId(),
      type: "tool",
      name: event.toolName,
      status,
      events: [toolEvent],
    });
  }

  return blocks;
};

export const applyChatMessageEvent = (message: ChatAssistantMessage, event: ChatEvent): ChatAssistantMessage => {
  if (event.type === "text_delta") {
    return {
      ...message,
      blocks: appendText(message, event.delta),
      status: "streaming",
    };
  }

  if (event.type === "replace_text") {
    return {
      ...message,
      blocks: replaceLastText(message, event.text),
      status: "streaming",
    };
  }

  if (event.type === "thinking_delta") {
    return {
      ...message,
      blocks: appendThinking(message, event.delta),
      status: "streaming",
    };
  }

  if (event.type === "thinking_end") {
    return {
      ...message,
      blocks: finalizeThinking(message, event.content),
      status: "streaming",
    };
  }

  if (event.type === "tool_start" || event.type === "tool_update" || event.type === "tool_end") {
    return {
      ...message,
      blocks: appendToolEvent(message, event),
      status: "streaming",
    };
  }

  const hasText = message.blocks.some((block) => block.type === "text" && block.content.trim());
  const text = event.text.trim() || "Agent 任务已完成。";
  const blocks = (hasText ? message.blocks : appendText(message, text)).map((block) =>
    block.type === "tool" && block.status === "running" ? { ...block, status: "done" as const } : block,
  );

  return {
    ...message,
    blocks,
    status: "done",
  };
};

export const failChatMessage = (message: ChatAssistantMessage, error: string): ChatAssistantMessage => {
  const hasText = message.blocks.some((block) => block.type === "text" && block.content.trim());
  const blocks = [...(hasText ? message.blocks : appendText(message, error))];
  const runningToolIndex = findLastBlockIndex(blocks, (block) => block.type === "tool" && block.status === "running");

  if (runningToolIndex >= 0) {
    const block = blocks[runningToolIndex];
    if (block.type === "tool") {
      blocks[runningToolIndex] = {
        ...block,
        status: "error",
        events: [...block.events, createToolEvent("output", error, true)].slice(-TOOL_EVENT_HISTORY_LIMIT),
      };
    }
  }

  const normalizedBlocks = blocks.map((block) =>
    block.type === "tool" && block.status === "running" ? { ...block, status: "error" as const } : block,
  );

  return {
    ...message,
    blocks: normalizedBlocks,
    status: "error",
  };
};
