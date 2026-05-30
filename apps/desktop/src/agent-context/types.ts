export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  metadata?: {
    agentExecutionSummary?: string;
    agentRunStatus?: "done" | "error";
    agentSessionId?: string | null;
  } | null;
};

export type AgentConversationSyncMessage = {
  id: string;
  role: "user" | "assistant";
  contentHash: string;
  timestamp: number;
};

export type AgentConversationSync = {
  sessionId: string;
  agentId?: string | null;
  syncedMessages: AgentConversationSyncMessage[];
  updatedAt: number;
  lastRunStatus: "done" | "error";
  lastSyncedMessageId?: string | null;
  invalidatedAt?: number | null;
  sessionFingerprint?: {
    latestSessionFile?: string | null;
    sessionFileCount: number;
    totalBytes: number;
    messageCount: number;
    compactionCount: number;
  } | null;
  // Backward compatibility for sessions saved before message-id based sync.
  syncedUntilIndex?: number;
};

export type ConversationSummaryFingerprint = {
  summarizedUntilIndex: number;
  contentHash: string;
};

export type ChatContextSummary = {
  summary: string;
  summarizedUntilIndex: number;
  updatedAt: number;
  historyInvalidatedAt?: number | null;
  summaryFingerprint?: ConversationSummaryFingerprint | null;
  conversationFingerprint?: string | null;
  agentSyncs?: Record<string, AgentConversationSync>;
  // Backward compatibility for sessions saved before per-agent sync.
  agentSync?: AgentConversationSync | null;
};

export type AgentSessionStatus = {
  exists: boolean;
  sessionDir: string;
  latestSessionFile?: string | null;
  sessionFileCount: number;
  totalBytes: number;
  messageCount: number;
  toolCallCount: number;
  activeMessageCount: number;
  activeToolCallCount: number;
  estimatedContextTokens: number;
  compactionCount: number;
  latestCompaction?: {
    summary: string;
    tokensBefore?: number | null;
    timestamp?: string | null;
  } | null;
};

export type CleanupAgentSessionsResult = {
  removedCount: number;
  removedBytes: number;
};

export type PromptFileReference = {
  path: string;
  content: string;
};

export type PromptWorkspaceFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};
