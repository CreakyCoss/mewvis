import type { ChatMessage } from "../types";

export const DEFAULT_SESSION_TITLE = "新的聊天";

export const createMessageId = () => crypto.randomUUID();

const padDatePart = (value: number, length = 2) => value.toString().padStart(length, "0");

const formatTimestampId = (date: Date) => [
  date.getFullYear(),
  padDatePart(date.getMonth() + 1),
  padDatePart(date.getDate()),
  "-",
  padDatePart(date.getHours()),
  padDatePart(date.getMinutes()),
  padDatePart(date.getSeconds()),
  "-",
  padDatePart(date.getMilliseconds(), 3),
].join("");

export const createChatSessionId = () => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `chat-${formatTimestampId(new Date())}-${suffix}`;
};

export const isMarkdownPath = (path: string) => /\.(md|markdown|mdown)$/i.test(path);

export const formatSessionTime = (timestamp: number) => {
  const elapsed = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < hour) {
    return `${Math.max(1, Math.floor(elapsed / minute))} 分`;
  }

  if (elapsed < day) {
    return `${Math.floor(elapsed / hour)} 小时`;
  }

  if (elapsed < 7 * day) {
    return `${Math.floor(elapsed / day)} 天`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
};

export const deriveSessionTitle = (messages: ChatMessage[]) => {
  const firstUserText = messages.find((message) => message.role === "user")?.text.trim();

  if (!firstUserText) {
    return DEFAULT_SESSION_TITLE;
  }

  return firstUserText.replace(/\s+/g, " ").slice(0, 36);
};
