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
};

export type ConversationSummaryFingerprint = {
  summarizedUntilIndex: number;
  contentHash: string;
};

export type ContextRagIndexSnapshot = {
  indexId: string;
  version: number;
  status: "missing" | "building" | "ready" | "stale" | "error";
  updatedAt?: number | null;
  sourceFingerprint?: string | null;
  documentCount?: number | null;
  chunkCount?: number | null;
  metadata?: Record<string, unknown>;
};

export type ContextMemoryLayerSnapshot = {
  layerId: string;
  kind: "conversation" | "workspace" | "agent" | "user" | "episodic" | "semantic";
  version: number;
  updatedAt: number;
  itemCount?: number | null;
  tokenCount?: number | null;
  sourceFingerprint?: string | null;
  metadata?: Record<string, unknown>;
};

export type ContextEngineState = {
  id: string;
  version: number;
  updatedAt: number;
  ragIndex?: ContextRagIndexSnapshot | null;
  memoryLayers?: ContextMemoryLayerSnapshot[];
  metadata?: Record<string, unknown>;
};

export type ChatContextSummary = {
  summary: string;
  summarizedUntilIndex: number;
  updatedAt: number;
  engine?: ContextEngineState | null;
  historyInvalidatedAt?: number | null;
  summaryFingerprint?: ConversationSummaryFingerprint | null;
  conversationFingerprint?: string | null;
  agentSyncs?: Record<string, AgentConversationSync>;
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
  tokenUsage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
  };
  tokenUsageMessageCount: number;
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

export type PromptAgentProfile = {
  id?: string;
  name: string;
  description?: string | null;
};

export type PromptWorkspaceContext = {
  name: string;
  path: string;
};

export type PromptSkillContext = {
  name: string;
  content: string;
  description?: string | null;
};

export type PromptWorkspaceFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};
