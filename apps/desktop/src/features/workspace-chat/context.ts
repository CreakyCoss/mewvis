import type {
  AgentConversationSync,
  AgentConversationSyncMessage,
  AgentSessionStatus,
  ChatContextSummary,
  ConversationMessage,
} from "./types";

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
  syncStatus?: "fresh" | "legacy" | "stale";
};

export const EMPTY_RUNTIME_CONVERSATION_CONTEXT: RuntimeConversationContext = {
  summary: "",
  recentMessages: [],
};

const roleLabel = (role: ConversationMessage["role"]) =>
  role === "user" ? "用户" : "助手";

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

const hashString = (text: string) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

export const conversationMessageContentHash = (message: ConversationMessage) =>
  hashString([
    message.role,
    message.content,
    message.metadata?.agentExecutionSummary ?? "",
    message.metadata?.agentRunStatus ?? "",
    message.metadata?.agentSessionId ?? "",
  ].join("\n"));

const legacyConversationMessageId = (
  message: Omit<ConversationMessage, "id"> & { id?: string },
  index: number,
) => [
  "legacy",
  message.timestamp || index,
  index,
  hashString(`${message.role}\n${message.content}`),
].join("-");

export const normalizeConversationMessages = (
  conversation: Array<ConversationMessage | (Omit<ConversationMessage, "id"> & { id?: string })>,
) => conversation.map((message, index) => ({
  ...message,
  id: message.id?.trim() || legacyConversationMessageId(message, index),
}));

export const toAgentConversationSyncMessage = (
  message: ConversationMessage,
): AgentConversationSyncMessage => ({
  id: message.id,
  role: message.role,
  contentHash: conversationMessageContentHash(message),
  timestamp: message.timestamp,
});

export const createAgentSessionFingerprint = (
  status: AgentSessionStatus | null | undefined,
) => status
  ? {
    latestSessionFile: status.latestSessionFile ?? null,
    sessionFileCount: status.sessionFileCount,
    totalBytes: status.totalBytes,
    messageCount: status.messageCount,
    compactionCount: status.compactionCount,
  }
  : null;

const migrateLegacyAgentSync = (
  sync: AgentConversationSync | null | undefined,
  conversation: ConversationMessage[],
) => {
  if (!sync) {
    return sync ?? null;
  }

  if (sync.syncedMessages?.length > 0) {
    return sync;
  }

  const syncedUntilIndex = Math.min(
    Math.max(0, sync.syncedUntilIndex ?? 0),
    conversation.length,
  );

  return {
    ...sync,
    syncedMessages: conversation
      .slice(0, syncedUntilIndex)
      .map(toAgentConversationSyncMessage),
    lastSyncedMessageId: conversation[syncedUntilIndex - 1]?.id ?? null,
  };
};

export const normalizeChatContextSummary = (
  context: ChatContextSummary | null | undefined,
  conversation: ConversationMessage[],
) => context
  ? {
    ...context,
    agentSync: migrateLegacyAgentSync(context.agentSync, conversation),
  }
  : null;

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
    return currentContext?.agentSync
      ? {
        summary: currentContext.summary ?? "",
        summarizedUntilIndex: 0,
        updatedAt: currentContext.updatedAt,
        agentSync: currentContext.agentSync,
      }
      : null;
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
    agentSync: currentContext?.agentSync ?? null,
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

export const buildUnsyncedAgentConversationContext = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  sessionId: string | null,
): RuntimeConversationContext => {
  if (!sessionId || context?.agentSync?.sessionId !== sessionId) {
    return buildRuntimeConversationContext(conversation, context);
  }

  const sync = migrateLegacyAgentSync(context.agentSync, conversation);
  const syncedMessages = sync?.syncedMessages ?? [];

  if (syncedMessages.length === 0) {
    return {
      summary: "",
      recentMessages: conversation.slice(-RECENT_CONTEXT_MESSAGE_COUNT),
      syncStatus: sync?.syncedUntilIndex ? "legacy" : "fresh",
    };
  }

  const syncedPrefixMatches = syncedMessages.every((syncedMessage, index) => {
    const currentMessage = conversation[index];
    return Boolean(currentMessage) &&
      currentMessage.id === syncedMessage.id &&
      currentMessage.role === syncedMessage.role &&
      conversationMessageContentHash(currentMessage) === syncedMessage.contentHash;
  });

  if (!syncedPrefixMatches) {
    return {
      summary: [
        context.summary,
        "应用聊天历史已在上次 Agent 同步后发生编辑、删除或重排；以下最近对话代表当前应用侧历史，请以后者为准。",
      ].filter(Boolean).join("\n\n"),
      recentMessages: conversation.slice(-RECENT_CONTEXT_MESSAGE_COUNT),
      syncStatus: "stale",
    };
  }

  return {
    summary: "",
    recentMessages: conversation
      .slice(syncedMessages.length)
      .slice(-RECENT_CONTEXT_MESSAGE_COUNT),
    syncStatus: "fresh",
  };
};

export const markAgentConversationSynced = (
  context: ChatContextSummary | null,
  conversation: ConversationMessage[],
  sync: Omit<AgentConversationSync, "syncedMessages" | "lastSyncedMessageId">,
): ChatContextSummary => ({
  summary: context?.summary ?? "",
  summarizedUntilIndex: context?.summarizedUntilIndex ?? 0,
  updatedAt: Date.now(),
  agentSync: {
    ...sync,
    syncedMessages: conversation.map(toAgentConversationSyncMessage),
    lastSyncedMessageId: conversation[conversation.length - 1]?.id ?? null,
  },
});

export const buildRuntimeConversationMessages = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
): ConversationMessage[] => {
  return buildRuntimeConversationContext(conversation, context).recentMessages;
};
