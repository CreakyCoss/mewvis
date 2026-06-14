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
