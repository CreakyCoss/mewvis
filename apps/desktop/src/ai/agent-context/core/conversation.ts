import {
  countConversationTokens,
  DEFAULT_CONVERSATION_TOKEN_BUDGET,
  findConversationTailStartByTokenBudget,
  SUMMARY_TARGET_RATIO,
  SUMMARY_TRIGGER_RATIO,
} from "./token-budget";
import type {
  AgentConversationSync,
  AgentConversationSyncMessage,
  AgentSessionStatus,
  ChatContextSummary,
  ConversationMessage,
} from "./types";

const MAX_SUMMARY_CHARS = 12000;
const MAX_SUMMARY_MESSAGE_CHARS = 900;

export type ConversationSummaryInput = {
  previousSummary: string;
  messages: ConversationMessage[];
};

export type ConversationSummarizer = (
  input: ConversationSummaryInput,
) => Promise<string>;

export type UpdateConversationContextOptions = {
  summarizer?: ConversationSummarizer;
  tokenBudget?: number;
  forceSummarize?: boolean;
  rebuildSummary?: boolean;
};

export type RuntimeConversationContext = {
  summary: string;
  recentMessages: ConversationMessage[];
  syncStatus?: "fresh" | "stale";
  agentSessionId?: string | null;
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

export const createAgentContextKey = (agentId: string | null | undefined) => {
  const key = agentId?.trim() || "default";
  return key
    .replace(/\.json$/, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\.\./g, "-")
    .replace(/^\.+/, "")
    || "default";
};

export const createAgentSessionGenerationId = () => `session-${crypto.randomUUID()}`;

export const createAgentRuntimeSessionId = (
  chatSessionId: string,
  agentId: string | null | undefined,
  generationId?: string | null,
) => [
  createAgentContextKey(agentId),
  chatSessionId.trim().replace(/\.json$/, ""),
  generationId?.trim() || null,
].filter(Boolean).join("/");

export const conversationMessageContentHash = (message: ConversationMessage) =>
  hashString([
    message.role,
    message.content,
    message.metadata?.agentExecutionSummary ?? "",
    message.metadata?.agentRunStatus ?? "",
    message.metadata?.agentSessionId ?? "",
  ].join("\n"));

const conversationSliceContentHash = (messages: ConversationMessage[]) =>
  hashString(messages
    .map((message) => [
      message.id,
      message.role,
      message.timestamp,
      conversationMessageContentHash(message),
    ].join(":"))
    .join("\n"));

const conversationFingerprint = (conversation: ConversationMessage[]) =>
  conversationSliceContentHash(conversation);

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

export const normalizeChatContextSummary = (
  context: ChatContextSummary | null | undefined,
) => context
  ? {
    ...context,
    agentSyncs: context.agentSyncs ?? {},
  }
  : null;

export const getAgentConversationSync = (
  context: ChatContextSummary | null | undefined,
  agentId: string | null | undefined,
) => context?.agentSyncs?.[createAgentContextKey(agentId)]
  ?? null;

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

const shouldReuseSummary = (
  context: ChatContextSummary | null,
  summarizeUntilIndex: number,
  conversation: ConversationMessage[],
) => Boolean(
  context?.summaryFingerprint &&
  context.summaryFingerprint.summarizedUntilIndex === summarizeUntilIndex &&
  context.summaryFingerprint.contentHash === conversationSliceContentHash(conversation.slice(0, summarizeUntilIndex)),
);

const shouldAppendSummary = (
  context: ChatContextSummary | null,
  previousUntilIndex: number,
  conversation: ConversationMessage[],
) => Boolean(
  previousUntilIndex > 0 &&
  context?.summaryFingerprint &&
  context.summaryFingerprint.summarizedUntilIndex === previousUntilIndex &&
  context.summaryFingerprint.contentHash === conversationSliceContentHash(conversation.slice(0, previousUntilIndex)),
);

export const isConversationSummaryCurrent = (
  context: ChatContextSummary | null | undefined,
  conversation: ConversationMessage[],
) => {
  if (!context?.summary) {
    return false;
  }

  if (!context.summaryFingerprint) {
    return !context.historyInvalidatedAt;
  }

  if (context.summaryFingerprint.summarizedUntilIndex > conversation.length) {
    return false;
  }

  const summarizedUntilIndex = Math.min(
    Math.max(0, context.summaryFingerprint.summarizedUntilIndex),
    conversation.length,
  );
  return context.summaryFingerprint.summarizedUntilIndex === (context.summarizedUntilIndex ?? 0) &&
    context.summaryFingerprint.contentHash ===
      conversationSliceContentHash(conversation.slice(0, summarizedUntilIndex));
};

const currentSummaryText = (
  context: ChatContextSummary | null | undefined,
  conversation: ConversationMessage[],
) => isConversationSummaryCurrent(context, conversation)
  ? context?.summary ?? ""
  : "";

export const updateConversationContext = async (
  conversation: ConversationMessage[],
  currentContext: ChatContextSummary | null,
  optionsOrSummarizer?: UpdateConversationContextOptions | ConversationSummarizer,
): Promise<ChatContextSummary | null> => {
  const options = typeof optionsOrSummarizer === "function"
    ? { summarizer: optionsOrSummarizer }
    : optionsOrSummarizer ?? {};
  const tokenBudget = options.tokenBudget ?? DEFAULT_CONVERSATION_TOKEN_BUDGET;
  const triggerTokens = Math.floor(tokenBudget * SUMMARY_TRIGGER_RATIO);
  const targetTokens = Math.floor(tokenBudget * SUMMARY_TARGET_RATIO);
  const totalTokens = countConversationTokens(conversation);
  const agentSyncs = currentContext?.agentSyncs ?? {};
  const nextConversationFingerprint = conversationFingerprint(conversation);
  const rebuildSummary = Boolean(options.forceSummarize || options.rebuildSummary);
  const existingConversationChanged = Boolean(
    currentContext?.conversationFingerprint &&
    currentContext.conversationFingerprint !== nextConversationFingerprint,
  );

  if (!rebuildSummary && totalTokens <= triggerTokens) {
    if (
      Object.keys(agentSyncs).length === 0 &&
      !currentContext?.historyInvalidatedAt
    ) {
      return null;
    }

    return {
      summary: "",
      summarizedUntilIndex: 0,
      updatedAt: currentContext?.updatedAt ?? Date.now(),
      historyInvalidatedAt: currentContext?.historyInvalidatedAt ?? null,
      summaryFingerprint: null,
      conversationFingerprint: nextConversationFingerprint,
      agentSyncs,
    };
  }

  const summarizeUntilIndex = findConversationTailStartByTokenBudget(conversation, targetTokens);
  if (summarizeUntilIndex <= 0) {
    return {
      summary: rebuildSummary ? "" : currentSummaryText(currentContext, conversation),
      summarizedUntilIndex: 0,
      updatedAt: rebuildSummary ? Date.now() : currentContext?.updatedAt ?? Date.now(),
      historyInvalidatedAt: currentContext?.historyInvalidatedAt ?? null,
      summaryFingerprint: null,
      conversationFingerprint: nextConversationFingerprint,
      agentSyncs,
    };
  }

  if (
    !rebuildSummary &&
    !existingConversationChanged &&
    shouldReuseSummary(currentContext, summarizeUntilIndex, conversation)
  ) {
    return {
      summary: currentContext?.summary ?? "",
      summarizedUntilIndex: summarizeUntilIndex,
      updatedAt: currentContext?.updatedAt ?? Date.now(),
      historyInvalidatedAt: currentContext?.historyInvalidatedAt ?? null,
      summaryFingerprint: currentContext?.summaryFingerprint ?? null,
      conversationFingerprint: nextConversationFingerprint,
      agentSyncs,
    };
  }

  const previousUntilIndex = Math.min(
    currentContext?.summarizedUntilIndex ?? 0,
    summarizeUntilIndex,
  );
  const canAppend = !rebuildSummary &&
    !existingConversationChanged &&
    shouldAppendSummary(currentContext, previousUntilIndex, conversation);
  const previousSummary = canAppend ? currentContext?.summary.trim() ?? "" : "";
  const messagesToSummarize = canAppend
    ? conversation.slice(previousUntilIndex, summarizeUntilIndex)
    : conversation.slice(0, summarizeUntilIndex);
  const rawSummary = await Promise.resolve(
    (options.summarizer ?? fallbackSummarize)({
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
    historyInvalidatedAt: currentContext?.historyInvalidatedAt ?? null,
    summaryFingerprint: {
      summarizedUntilIndex: summarizeUntilIndex,
      contentHash: conversationSliceContentHash(conversation.slice(0, summarizeUntilIndex)),
    },
    conversationFingerprint: nextConversationFingerprint,
    agentSyncs,
  };
};

export const buildRuntimeConversationContext = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  tokenBudget = DEFAULT_CONVERSATION_TOKEN_BUDGET,
): RuntimeConversationContext => {
  const summary = currentSummaryText(context, conversation);
  const summarizedUntilIndex = summary ? context?.summarizedUntilIndex ?? 0 : 0;
  const unsummarizedMessages = conversation.slice(summarizedUntilIndex);
  const recentStart = findConversationTailStartByTokenBudget(
    unsummarizedMessages,
    tokenBudget,
  );

  return {
    summary,
    recentMessages: unsummarizedMessages.slice(recentStart),
  };
};

export const buildUnsyncedAgentConversationContext = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  agentId: string | null | undefined,
  tokenBudget = DEFAULT_CONVERSATION_TOKEN_BUDGET,
): RuntimeConversationContext => {
  const sync = getAgentConversationSync(context, agentId);
  if (!sync) {
    if (context?.historyInvalidatedAt) {
      return {
        summary: currentSummaryText(context, conversation),
        recentMessages: conversation.slice(findConversationTailStartByTokenBudget(conversation, tokenBudget)),
        syncStatus: "stale",
        agentSessionId: null,
      };
    }

    return buildRuntimeConversationContext(conversation, context, tokenBudget);
  }

  if (sync.invalidatedAt) {
    return {
      summary: currentSummaryText(context, conversation),
      recentMessages: conversation.slice(findConversationTailStartByTokenBudget(conversation, tokenBudget)),
      syncStatus: "stale",
      agentSessionId: null,
    };
  }

  const syncedMessages = sync.syncedMessages ?? [];

  if (syncedMessages.length === 0) {
    return {
      summary: "",
      recentMessages: conversation.slice(findConversationTailStartByTokenBudget(conversation, tokenBudget)),
      syncStatus: "fresh",
      agentSessionId: sync.sessionId,
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
      summary: currentSummaryText(context, conversation),
      recentMessages: conversation.slice(findConversationTailStartByTokenBudget(conversation, tokenBudget)),
      syncStatus: "stale",
      agentSessionId: null,
    };
  }

  const unsyncedMessages = conversation.slice(syncedMessages.length);
  return {
    summary: "",
    recentMessages: unsyncedMessages.slice(findConversationTailStartByTokenBudget(unsyncedMessages, tokenBudget)),
    syncStatus: "fresh",
    agentSessionId: sync.sessionId,
  };
};

export const markAgentConversationSynced = (
  context: ChatContextSummary | null,
  conversation: ConversationMessage[],
  agentId: string | null | undefined,
  sync: Omit<AgentConversationSync, "agentId" | "syncedMessages" | "lastSyncedMessageId">,
): ChatContextSummary => {
  const key = createAgentContextKey(agentId);
  const summary = currentSummaryText(context, conversation);
  const agentSync: AgentConversationSync = {
    ...sync,
    agentId: key,
    syncedMessages: conversation.map(toAgentConversationSyncMessage),
    lastSyncedMessageId: conversation[conversation.length - 1]?.id ?? null,
  };

  return {
    summary,
    summarizedUntilIndex: summary ? context?.summarizedUntilIndex ?? 0 : 0,
    updatedAt: Date.now(),
    historyInvalidatedAt: null,
    summaryFingerprint: summary ? context?.summaryFingerprint ?? null : null,
    conversationFingerprint: conversationFingerprint(conversation),
    agentSyncs: {
      ...(context?.agentSyncs ?? {}),
      [key]: agentSync,
    },
  };
};

const invalidateExistingAgentConversationSync = (
  sync: AgentConversationSync,
  invalidatedAt: number,
): AgentConversationSync => ({
  ...sync,
  invalidatedAt,
});

export const invalidateConversationContextForHistoryChange = (
  context: ChatContextSummary | null,
  conversation: ConversationMessage[],
): ChatContextSummary => {
  const invalidatedAt = Date.now();
  const agentSyncs = Object.fromEntries(
    Object.entries(context?.agentSyncs ?? {}).map(([key, sync]) => [
      key,
      invalidateExistingAgentConversationSync(sync, invalidatedAt),
    ]),
  );

  return {
    summary: "",
    summarizedUntilIndex: 0,
    updatedAt: invalidatedAt,
    historyInvalidatedAt: invalidatedAt,
    summaryFingerprint: null,
    conversationFingerprint: conversationFingerprint(conversation),
    agentSyncs,
  };
};

export const buildRuntimeConversationMessages = (
  conversation: ConversationMessage[],
  context: ChatContextSummary | null,
  tokenBudget = DEFAULT_CONVERSATION_TOKEN_BUDGET,
): ConversationMessage[] => {
  return buildRuntimeConversationContext(conversation, context, tokenBudget).recentMessages;
};
