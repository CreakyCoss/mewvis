import type { ChatMessage } from "../types";

export const DEFAULT_SESSION_TITLE = "新的聊天";

export const createMessageId = () => crypto.randomUUID();

export const isMarkdownPath = (path: string) => /\.(md|markdown|mdown)$/i.test(path);

export const formatSessionTime = (timestamp: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));

export const deriveSessionTitle = (messages: ChatMessage[]) => {
  const firstUserText = messages.find((message) => message.role === "user")?.text.trim();

  if (!firstUserText) {
    return DEFAULT_SESSION_TITLE;
  }

  return firstUserText.replace(/\s+/g, " ").slice(0, 36);
};
