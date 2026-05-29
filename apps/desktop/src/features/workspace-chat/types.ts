import type { AgentRuntimeAgentEvent } from "@/agent-runtime/contracts";

export type WorkspaceFileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number | null;
  updatedAt: number | null;
};

export type WorkspaceFile = {
  path: string;
  content: string;
  updatedAt: number | null;
};

export type AgentMessageBlock =
  | {
    id: string;
    type: "thinking";
    content: string;
    isCollapsed?: boolean;
  }
  | {
    id: string;
    type: "text";
    content: string;
  }
  | {
    id: string;
    type: "tool";
    toolName: string;
    status: "running" | "done" | "error";
    events: AgentRuntimeAgentEvent[];
    isCollapsed?: boolean;
  };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  mode?: "chat" | "agent" | "collab";
  status?: "loading" | "streaming" | "done" | "error";
  thinking?: string;
  agentEvents?: AgentRuntimeAgentEvent[];
  agentBlocks?: AgentMessageBlock[];
  agentAvatar?: string;
  agentName?: string;
  referencedFiles?: Array<{ path: string }>;
};

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
  syncedMessages: AgentConversationSyncMessage[];
  updatedAt: number;
  lastRunStatus: "done" | "error";
  lastSyncedMessageId?: string | null;
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

export type ChatContextSummary = {
  summary: string;
  summarizedUntilIndex: number;
  updatedAt: number;
  agentSync?: AgentConversationSync | null;
};

export type ChatSessionMeta = {
  id: string;
  title: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  conversation: ConversationMessage[];
  context?: ChatContextSummary | null;
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
