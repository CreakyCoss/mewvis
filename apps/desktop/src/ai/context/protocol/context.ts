import type { ContextMemoryLayerSnapshot } from "./memory";
import type { ContextRagIndexSnapshot } from "./rag";

export type ConversationRole = "user" | "assistant";

export type ConversationRunStatus = "done" | "error";

export type ConversationMessageMetadata = {
  executionSummary?: string;
  runStatus?: ConversationRunStatus;
  runtimeSessionId?: string | null;
  collaboration?: Record<string, unknown>;
};

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  metadata?: ConversationMessageMetadata | null;
};

export type AgentConversationSyncMessage = {
  id: string;
  role: ConversationRole;
  contentHash: string;
  timestamp: number;
};

export type AgentSessionFingerprint = {
  latestSessionFile?: string | null;
  sessionFileCount: number;
  totalBytes: number;
  messageCount: number;
  compactionCount: number;
};

export type AgentSessionContextStatus = AgentSessionFingerprint & {
  exists: boolean;
};

export type AgentConversationSync = {
  sessionId: string;
  agentId?: string | null;
  syncedMessages: AgentConversationSyncMessage[];
  updatedAt: number;
  lastRunStatus: ConversationRunStatus;
  lastSyncedMessageId?: string | null;
  invalidatedAt?: number | null;
  sessionFingerprint?: AgentSessionFingerprint | null;
};

export type ConversationSummaryFingerprint = {
  summarizedUntilIndex: number;
  contentHash: string;
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
  syncStatus?: "fresh" | "stale";
  agentSessionId?: string | null;
};
