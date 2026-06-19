import type {
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
} from "../../types";

export type HydratableChatSession = {
  id: string | null;
  title: string;
  messages: ChatMessage[];
};

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

export const toHydratableSession = (
  session: ChatSession | null | undefined,
): HydratableChatSession | null => session
  ? {
    id: session.id,
    title: session.title,
    messages: session.messages,
  }
  : null;

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
