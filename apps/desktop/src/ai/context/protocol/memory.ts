import type { ConversationMessage } from "./context";

export type ContextMemoryLayerSnapshot = {
  layerId: string;
  kind: "conversation" | "document" | "agent" | "user" | "episodic" | "semantic";
  version: number;
  updatedAt: number;
  itemCount?: number | null;
  tokenCount?: number | null;
  sourceFingerprint?: string | null;
  metadata?: Record<string, unknown>;
};

export type MemoryBackedRuntimeContextStats = {
  contextWindow: number;
  historyTokenBudget: number;
  historyTokensBefore: number;
  historyTokensAfter: number;
  summarizedMessageCount: number;
};

export type MemoryBackedRuntimeContextUpdate = {
  memory: string;
  summarizedMessageIds: string[];
  updatedAt: number;
};

export type PrepareMemoryBackedRuntimeContextInput<TState, TMessage> = {
  state: TState;
  messages: TMessage[];
  runtimeMessages: ConversationMessage[];
  currentMemory: string;
  summarizedMessageIds?: string[];
  contextWindow: number;
  maxTokens: number;
  staticTokens: number;
  minRecentHistoryTokens?: number;
  maxMemoryChars?: number;
  overflowNotice?: string;
  getMessageId: (message: TMessage) => string;
  summarizeMessages: (input: {
    previousMemory: string;
    messages: TMessage[];
  }) => Promise<string> | string;
  applyMemoryUpdate: (
    state: TState,
    update: MemoryBackedRuntimeContextUpdate,
  ) => TState;
};

export type PreparedMemoryBackedRuntimeContext<TState, TMessage> = {
  state: TState;
  messages: TMessage[];
  didCompress: boolean;
  warning?: string;
  stats: MemoryBackedRuntimeContextStats;
};
