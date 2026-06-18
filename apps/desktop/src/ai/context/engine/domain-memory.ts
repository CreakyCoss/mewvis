import type {
  PreparedMemoryBackedRuntimeContext,
  PrepareMemoryBackedRuntimeContextInput,
} from "../protocol/memory";
import {
  countConversationTokens,
  createConversationTokenBudget,
  findConversationTailStartByTokenBudget,
  SUMMARY_TARGET_RATIO,
  SUMMARY_TRIGGER_RATIO,
} from "../core/token-budget";

export const DEFAULT_MEMORY_CONTEXT_MIN_RECENT_HISTORY_TOKENS = 1600;
export const DEFAULT_MEMORY_CONTEXT_MAX_MEMORY_CHARS = 12000;

export type {
  MemoryBackedRuntimeContextStats,
  MemoryBackedRuntimeContextUpdate,
  PreparedMemoryBackedRuntimeContext,
  PrepareMemoryBackedRuntimeContextInput,
} from "../protocol/memory";

export const limitMemoryText = ({
  memory,
  maxChars = DEFAULT_MEMORY_CONTEXT_MAX_MEMORY_CHARS,
  overflowNotice,
}: {
  memory: string;
  maxChars?: number;
  overflowNotice?: string;
}) => {
  const trimmed = memory.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return [
    overflowNotice,
    trimmed.slice(-maxChars),
  ].filter(Boolean).join("\n");
};

export const resolveMemoryBackedHistoryBudget = ({
  contextWindow,
  maxTokens,
  staticTokens,
  minRecentHistoryTokens = DEFAULT_MEMORY_CONTEXT_MIN_RECENT_HISTORY_TOKENS,
}: {
  contextWindow: number;
  maxTokens: number;
  staticTokens: number;
  minRecentHistoryTokens?: number;
}) => {
  const baseBudget = createConversationTokenBudget({
    contextWindow,
    maxTokens,
  });
  const staticAwareBudget = Math.floor(Math.max(
    minRecentHistoryTokens,
    (contextWindow - staticTokens - maxTokens - 4096) * 0.55,
  ));

  return Math.max(
    minRecentHistoryTokens,
    Math.min(baseBudget, staticAwareBudget),
  );
};

export const prepareMemoryBackedRuntimeContext = async <TState, TMessage>({
  state,
  messages,
  runtimeMessages,
  currentMemory,
  summarizedMessageIds,
  contextWindow,
  maxTokens,
  staticTokens,
  minRecentHistoryTokens,
  maxMemoryChars,
  overflowNotice,
  getMessageId,
  summarizeMessages,
  applyMemoryUpdate,
}: PrepareMemoryBackedRuntimeContextInput<TState, TMessage>): Promise<
  PreparedMemoryBackedRuntimeContext<TState, TMessage>
> => {
  const historyTokenBudget = resolveMemoryBackedHistoryBudget({
    contextWindow,
    maxTokens,
    staticTokens,
    minRecentHistoryTokens,
  });
  const historyTokensBefore = countConversationTokens(runtimeMessages);
  const triggerTokens = Math.floor(historyTokenBudget * SUMMARY_TRIGGER_RATIO);

  if (historyTokensBefore <= triggerTokens) {
    return {
      state,
      messages,
      didCompress: false,
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter: historyTokensBefore,
        summarizedMessageCount: 0,
      },
    };
  }

  const targetTokens = Math.floor(historyTokenBudget * SUMMARY_TARGET_RATIO);
  const tailStart = findConversationTailStartByTokenBudget(runtimeMessages, targetTokens);
  const recentMessages = messages.slice(tailStart);
  const alreadySummarizedIds = new Set(summarizedMessageIds ?? []);
  const messagesToSummarize = messages
    .slice(0, tailStart)
    .filter((message) => !alreadySummarizedIds.has(getMessageId(message)));

  const recentRuntimeMessages = runtimeMessages.slice(tailStart);
  const historyTokensAfter = countConversationTokens(recentRuntimeMessages);

  if (messagesToSummarize.length === 0) {
    return {
      state,
      messages: recentMessages,
      didCompress: false,
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter,
        summarizedMessageCount: 0,
      },
    };
  }

  try {
    const memory = limitMemoryText({
      memory: await Promise.resolve(summarizeMessages({
        previousMemory: currentMemory,
        messages: messagesToSummarize,
      })),
      maxChars: maxMemoryChars,
      overflowNotice,
    });
    const nextSummarizedMessageIds = [
      ...alreadySummarizedIds,
      ...messagesToSummarize.map(getMessageId),
    ];
    const updatedAt = Date.now();

    return {
      state: applyMemoryUpdate(state, {
        memory,
        summarizedMessageIds: nextSummarizedMessageIds,
        updatedAt,
      }),
      messages: recentMessages,
      didCompress: true,
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter,
        summarizedMessageCount: messagesToSummarize.length,
      },
    };
  } catch (caught) {
    return {
      state,
      messages: recentMessages,
      didCompress: false,
      warning: caught instanceof Error ? caught.message : String(caught),
      stats: {
        contextWindow,
        historyTokenBudget,
        historyTokensBefore,
        historyTokensAfter,
        summarizedMessageCount: 0,
      },
    };
  }
};
