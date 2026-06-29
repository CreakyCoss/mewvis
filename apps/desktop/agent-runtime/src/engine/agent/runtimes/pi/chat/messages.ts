import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  Model,
  Usage,
} from "@earendil-works/pi-ai";
import {
  AgentResultType,
  type ChatMessageInput,
  type ChatResult,
} from "../../../contracts/protocol.js";
import type { RuntimeChatCommand } from "../../types.js";

export const createPiChatResult = (message: AssistantMessage): ChatResult => ({
  type: AgentResultType.ChatResult,
  text: textFromPiMessage(message),
  thinking: thinkingFromPiMessage(message),
});

export const createPiChatContext = (
  command: RuntimeChatCommand,
  model: Model<Api>,
): Context => ({
  systemPrompt: command.systemPrompt ?? undefined,
  messages: command.messages.map((message) => toPiMessage(message, model)),
});

export const textFromPiMessage = (message: AssistantMessage) => {
  const text = message.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("")
    .trim();

  if (text) {
    return text;
  }

  const thinking = thinkingFromPiMessage(message);
  if (thinking) {
    return thinking;
  }

  const toolCalls = message.content
    .filter((content) => content.type === "toolCall")
    .map((content) => `${content.name}(${JSON.stringify(content.arguments)})`);

  if (toolCalls.length) {
    return `模型返回了工具调用：\n${toolCalls.join("\n")}`;
  }

  if (message.errorMessage) {
    return `模型返回错误：${message.errorMessage}`;
  }

  const diagnostic = message.diagnostics?.find((item) => item.error?.message);
  if (diagnostic?.error?.message) {
    return `模型请求失败：${diagnostic.error.message}`;
  }

  return `模型未返回可展示文本。stopReason=${message.stopReason}`;
};

export const thinkingFromPiMessage = (message: AssistantMessage) => {
  const thinking = message.content
    .filter((content) => content.type === "thinking")
    .map((content) => content.thinking)
    .join("")
    .trim();

  return thinking || null;
};

const toPiMessage = (
  item: ChatMessageInput,
  model: Model<Api>,
): Message => {
  if (item.role === "assistant") {
    return {
      role: "assistant",
      content: [{ type: "text", text: item.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: emptyPiUsage(),
      stopReason: "stop",
      timestamp: Date.now(),
    };
  }

  return {
    role: "user",
    content: item.content,
    timestamp: Date.now(),
  };
};

const emptyPiUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
});
