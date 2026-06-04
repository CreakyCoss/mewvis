import { extractAgentExecutionSummary } from "@/ai/agent-context";
import type { ChatMessage, ChatSessionMeta, ConversationMessage } from "../../types";

export const sortChatSessionsByFixedOrder = (sessions: ChatSessionMeta[]) =>
  [...sessions].sort((left, right) =>
    right.createdAt - left.createdAt || right.id.localeCompare(left.id)
  );

export const upsertChatSessionMeta = (
  sessions: ChatSessionMeta[],
  session: ChatSessionMeta,
) => sortChatSessionsByFixedOrder([
  session,
  ...sessions.filter((item) => item.id !== session.id),
]);

export const moveHistoryItem = <T extends { id: string }>(
  items: T[],
  itemId: string,
  direction: "up" | "down",
) => {
  const index = items.findIndex((item) => item.id === itemId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
};

export const removeHistoryMessageSegment = <T extends { id: string; role: "user" | "assistant" }>(
  items: T[],
  messageId: string,
) => {
  const index = items.findIndex((item) => item.id === messageId);
  if (index < 0) {
    return items;
  }

  const segmentStart = items[index].role === "assistant" && items[index - 1]?.role === "user"
    ? index - 1
    : index;
  return items.slice(0, segmentStart);
};

export const keepHistoryThroughMessage = <T extends { id: string }>(
  items: T[],
  messageId: string,
) => {
  const index = items.findIndex((item) => item.id === messageId);
  if (index < 0) {
    return items;
  }

  return items.slice(0, index + 1);
};

const normalizeHistoryText = (text: string) => text.replace(/\s+/g, " ").trim();

const findConversationMatchIndex = (
  conversation: ConversationMessage[],
  usedIndexes: Set<number>,
  chatMessage: ChatMessage,
  originalMessage: ChatMessage,
) => {
  const directIndex = conversation.findIndex((message, index) =>
    !usedIndexes.has(index) && message.id === originalMessage.id,
  );
  if (directIndex >= 0) {
    return directIndex;
  }

  const originalText = normalizeHistoryText(originalMessage.text);
  const textIndex = conversation.findIndex((message, index) =>
    !usedIndexes.has(index) &&
    message.role === chatMessage.role &&
    normalizeHistoryText(message.content) === originalText,
  );
  if (textIndex >= 0) {
    return textIndex;
  }

  return conversation.findIndex((message, index) =>
    !usedIndexes.has(index) &&
    message.role === chatMessage.role &&
    Math.abs(message.timestamp - originalMessage.createdAt) < 60_000,
  );
};

export const rebuildConversationFromVisibleMessages = (
  conversation: ConversationMessage[],
  currentMessages: ChatMessage[],
  nextMessages: ChatMessage[],
): ConversationMessage[] => {
  const usedIndexes = new Set<number>();

  return nextMessages.map((chatMessage) => {
    const originalMessage = currentMessages.find((message) => message.id === chatMessage.id) ?? chatMessage;
    const matchIndex = findConversationMatchIndex(
      conversation,
      usedIndexes,
      chatMessage,
      originalMessage,
    );
    const matchedMessage = matchIndex >= 0 ? conversation[matchIndex] : null;
    if (matchIndex >= 0) {
      usedIndexes.add(matchIndex);
    }

    return {
      id: chatMessage.id,
      role: chatMessage.role,
      content: chatMessage.text,
      timestamp: matchedMessage?.timestamp ?? chatMessage.createdAt,
      metadata: matchedMessage?.metadata ?? null,
    };
  });
};

export const stripHiddenAgentContextMetadata = (
  conversation: ConversationMessage[],
): ConversationMessage[] => conversation.map((message) =>
  message.metadata?.agentExecutionSummary || message.metadata?.agentSessionId
    ? {
      ...message,
      metadata: null,
    }
    : message,
);

export const findLatestAgentExecutionSummary = (conversation: ConversationMessage[]) => {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];
    if (message.role !== "assistant") {
      continue;
    }
    const summary = extractAgentExecutionSummary(message);
    if (summary) {
      return summary;
    }
  }

  return "";
};
