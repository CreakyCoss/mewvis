import type { ChatContextSummary, ConversationMessage } from "./types";

const RECENT_CONTEXT_MESSAGE_COUNT = 12;
const MAX_SUMMARY_CHARS = 12000;
const MAX_SUMMARY_MESSAGE_CHARS = 900;

export type ConversationSummaryInput = {
  previousSummary: string;
  messages: ConversationMessage[];
};

export type ConversationSummarizer = (
  input: ConversationSummaryInput,
) => Promise<string>;

export type RuntimeConversationContext = {
  summary: string;
  recentMessages: ConversationMessage[];
};

const roleLabel = (role: ConversationMessage["role"]) =>
  role === "user" ? "用户" : "助手";

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

const truncateText = (text: string, maxLength: number) => {
  const normalized = normalizeText(text);
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
};

const limitSummary = (summary: string) => {
  if (summary.length <= MAX_SUMMARY_CHARS) {
    return summary;
  }

  return [
    "（较早摘要已按上下文预算裁剪，保留最近的压缩历史。）",
    summary.slice(-MAX_SUMMARY_CHARS),
  ].join("\n");
};

const summarizeMessages = (messages: ConversationMessage[]) =>
  messages
    .map((message) => `- ${roleLabel(message.role)}：${truncateText(message.content, MAX_SUMMARY_MESSAGE_CHARS)}`)
    .join("\n");

const fallbackSummarize = ({ previousSummary, messages }: ConversationSummaryInput) =>
  [previousSummary.trim(), summarizeMessages(messages)].filter(Boolean).join("\n");

export const formatConversationForSummary = (messages: ConversationMessage[]) =>
  messages
    .map((message) => `${roleLabel(message.role)}：${message.content}`)
    .join("\n\n");

export const updateConversationContext = async (
  conversation: ConversationMessage[],
  currentContext: ChatContextSummary | null,
  summarizer?: ConversationSummarizer,
): Promise<ChatContextSummary | null> => {
  const summarizeUntilIndex = Math.max(0, conversation.length - RECENT_CONTEXT_MESSAGE_COUNT);

  if (summarizeUntilIndex === 0) {
    return null;
  }

  const previousUntilIndex = Math.min(
    currentContext?.summarizedUntilIndex ?? 0,
    summarizeUntilIndex,
  );
  const previousSummary = previousUntilIndex > 0 ? currentContext?.summary.trim() ?? "" : "";
  const messagesToSummarize = conversation.slice(previousUntilIndex, summarizeUntilIndex);
  const rawSummary = await Promise.resolve(
    (summarizer ?? fallbackSummarize)({
      previousSummary,
      messages: messagesToSummarize,
    }),
  ).catch(() => fallbackSummarize({
    previousSummary,
    messages: messagesToSummarize,
  }));
  const summary = limitSummary(rawSummary.trim());

  return {
    summary,
    summarizedUntilIndex: summarizeUntilIndex,
    updatedAt: Date.now(),
  };
};

export const buildRuntimeConversationContext = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
): RuntimeConversationContext => {
  return {
    summary: context?.summary ?? "",
    recentMessages: conversation.slice(-RECENT_CONTEXT_MESSAGE_COUNT),
  };
};

export const buildRuntimeConversationMessages = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
): ConversationMessage[] => {
  const runtimeContext = buildRuntimeConversationContext(conversation, context);

  if (!runtimeContext.summary) {
    return runtimeContext.recentMessages;
  }

  return [
    {
      role: "user",
      content: [
        "以下是更早对话的压缩摘要，仅用于恢复跨任务上下文；不要把它当作用户当前的新请求：",
        runtimeContext.summary,
      ].join("\n\n"),
      timestamp: Date.now(),
    },
    ...runtimeContext.recentMessages,
  ];
};
