import type { ChatMessage } from "../types";
import { createTimestampId, createUuid } from "@/utils/ids";
import { formatRelativeTime } from "@/utils/time";

export const DEFAULT_SESSION_TITLE = "新的聊天";

export const createMessageId = () => createUuid();

export const createChatSessionId = () => createTimestampId("chat");

export const createAgentSessionRootDir = (chatSessionId: string | null | undefined) => {
  const id = chatSessionId?.trim().replace(/\.json$/, "");
  return id ? `chats/${id}/session` : null;
};

export const formatSessionTime = (timestamp: number) => formatRelativeTime(timestamp);

export const deriveSessionTitle = (messages: ChatMessage[]) => {
  const firstUserText = messages.find((message) => message.role === "user")?.text.trim();

  if (!firstUserText) {
    return DEFAULT_SESSION_TITLE;
  }

  return firstUserText.replace(/\s+/g, " ").slice(0, 36);
};
