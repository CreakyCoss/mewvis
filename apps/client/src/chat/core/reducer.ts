import type { AgentClientChatMessageEvent, AgentClientToolEvent } from "@/agent-client/contracts";
import { AgentRuntimeEventType } from "@/agent-client/wire";
import type { ChatAssistantMessage, ChatAssistantMessageBlock, ChatToolEvent } from "@mewvis/chat-contracts";
import { readMediaResult, startMediaResult } from "./media";

type ChatEvent = AgentClientChatMessageEvent;

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

const updateToolInput = (events: ChatToolEvent[], update: (content: string) => string) => {
  const inputIndex = events.findIndex((event) => event.kind === "input");
  if (inputIndex < 0) {
    return [createToolEvent("input", update("")), ...events];
  }

  const inputEvent = events[inputIndex];
  const nextEvents = [...events];
  nextEvents[inputIndex] = {
    ...inputEvent,
    content: limitToolEventContent(update(inputEvent.content)),
  };
  return nextEvents;
};

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
    blocks.push({ id: createBlockId(), type: "thinking", content });
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

const appendToolEvent = (message: ChatAssistantMessage, event: AgentClientToolEvent) => {
  const blocks = [...message.blocks];
  const toolIndex = findLastBlockIndex(
    blocks,
    (block) => block.type === "tool" && block.toolCallId === event.toolCallId,
  );

  if (event.type === AgentRuntimeEventType.ToolCallStart) {
    if (toolIndex >= 0) {
      return blocks;
    }

    blocks.push({
      id: createBlockId(),
      type: "tool",
      toolCallId: event.toolCallId,
      name: event.toolName,
      status: "running",
      events: [createToolEvent("input", "")],
    });
    return blocks;
  }

  if (event.type === AgentRuntimeEventType.ToolCallDelta) {
    if (toolIndex >= 0) {
      const block = blocks[toolIndex];
      if (block.type === "tool") {
        blocks[toolIndex] = {
          ...block,
          events: updateToolInput(block.events, (content) => `${content}${event.delta}`),
        };
      }
    } else {
      blocks.push({
        id: createBlockId(),
        type: "tool",
        toolCallId: event.toolCallId,
        name: event.toolName,
        status: "running",
        events: [createToolEvent("input", event.delta)],
      });
    }
    return blocks;
  }

  if (event.type === AgentRuntimeEventType.ToolCallEnd || event.type === AgentRuntimeEventType.ToolExecutionStart) {
    if (toolIndex >= 0) {
      const block = blocks[toolIndex];
      if (block.type === "tool") {
        blocks[toolIndex] = {
          ...block,
          name: event.toolName,
          status: "running",
          events: updateToolInput(block.events, () => stringifyToolValue(event.args)),
          ...(event.toolName === "generate_media" ? { media: block.media ?? startMediaResult(event.args) } : {}),
        };
      }
    } else {
      blocks.push({
        id: createBlockId(),
        type: "tool",
        toolCallId: event.toolCallId,
        name: event.toolName,
        status: "running",
        events: [createToolEvent("input", event.args)],
        ...(event.toolName === "generate_media" ? { media: startMediaResult(event.args) } : {}),
      });
    }
    return blocks;
  }

  const previous = blocks[toolIndex];
  const result = event.type === AgentRuntimeEventType.ToolExecutionUpdate ? event.partialResult : event.result;
  const previousMedia = previous?.type === "tool" ? previous.media : undefined;
  const media =
    event.toolName === "generate_media"
      ? (readMediaResult(result, previousMedia) ??
        (event.type === AgentRuntimeEventType.ToolExecutionEnd && previousMedia
          ? {
              ...previousMedia,
              status: "failed" as const,
              error: limitToolEventContent(stringifyToolValue(result)) || "未收到媒体生成结果",
            }
          : undefined))
      : undefined;
  const isError =
    event.type === AgentRuntimeEventType.ToolExecutionEnd && (event.isError || media?.status === "failed");
  const status = event.type === AgentRuntimeEventType.ToolExecutionEnd ? (isError ? "error" : "done") : "running";
  const toolEvent =
    event.type === AgentRuntimeEventType.ToolExecutionUpdate
      ? createToolEvent("update", event.partialResult)
      : createToolEvent("output", event.result, isError);

  if (toolIndex >= 0) {
    const block = blocks[toolIndex];
    if (block.type === "tool") {
      blocks[toolIndex] = {
        ...block,
        status,
        events: [...block.events, toolEvent].slice(-TOOL_EVENT_HISTORY_LIMIT),
        ...(media ? { media } : {}),
      };
    }
  } else {
    blocks.push({
      id: createBlockId(),
      type: "tool",
      toolCallId: event.toolCallId,
      name: event.toolName,
      status,
      events: [toolEvent],
      ...(media ? { media } : {}),
    });
  }

  return blocks;
};

export const applyChatMessageEvent = (message: ChatAssistantMessage, event: ChatEvent): ChatAssistantMessage => {
  if (event.type === AgentRuntimeEventType.TextDelta) {
    return {
      ...message,
      blocks: appendText(message, event.delta),
      status: "streaming",
    };
  }

  if (event.type === AgentRuntimeEventType.ReplaceText) {
    return {
      ...message,
      blocks: replaceLastText(message, event.text),
      status: "streaming",
    };
  }

  if (event.type === AgentRuntimeEventType.ThinkingDelta) {
    return {
      ...message,
      blocks: appendThinking(message, event.delta),
      status: "streaming",
    };
  }

  if (event.type === AgentRuntimeEventType.ThinkingEnd) {
    return {
      ...message,
      blocks: finalizeThinking(message, event.content),
      status: "streaming",
    };
  }

  if (
    event.type === AgentRuntimeEventType.ToolCallStart ||
    event.type === AgentRuntimeEventType.ToolCallDelta ||
    event.type === AgentRuntimeEventType.ToolCallEnd ||
    event.type === AgentRuntimeEventType.ToolExecutionStart ||
    event.type === AgentRuntimeEventType.ToolExecutionUpdate ||
    event.type === AgentRuntimeEventType.ToolExecutionEnd
  ) {
    return {
      ...message,
      blocks: appendToolEvent(message, event),
      status: "streaming",
    };
  }

  const hasText = message.blocks.some((block) => block.type === "text" && block.content.trim());
  const text = event.text.trim() || "Agent 任务已完成。";
  const blocks = (hasText ? message.blocks : appendText(message, text)).map((block) => {
    if (block.type !== "tool" || block.status !== "running") return block;
    return {
      ...block,
      status: block.media?.status === "running" ? ("error" as const) : ("done" as const),
      ...(block.media?.status === "running"
        ? { media: { ...block.media, status: "failed" as const, error: "未收到媒体工具的完成结果，请查看调用详情。" } }
        : {}),
    };
  });

  return {
    ...message,
    blocks,
    status: "done",
  };
};

export const failChatMessage = (
  message: ChatAssistantMessage,
  error: string,
  stopped = false,
): ChatAssistantMessage => {
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

  const normalizedBlocks = blocks.map((block) => {
    if (block.type !== "tool") return block;
    return {
      ...block,
      ...(block.status === "running" ? { status: "error" as const } : {}),
      ...(block.media?.status === "running"
        ? {
            media: {
              ...block.media,
              status: stopped ? ("stopped" as const) : ("failed" as const),
              error: stopped ? "已停止等待，上游生成任务可能仍在执行。" : error,
            },
          }
        : {}),
    };
  });

  return {
    ...message,
    blocks: normalizedBlocks,
    status: "error",
  };
};
