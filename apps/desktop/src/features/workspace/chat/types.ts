import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";
import type {
  ChatContextSummary,
  ConversationMessage,
} from "@/ai/agent-context";

export type {
  AgentConversationSync,
  AgentConversationSyncMessage,
  AgentSessionStatus,
  ChatContextSummary,
  CleanupAgentSessionsResult,
  ConversationMessage,
} from "@/ai/agent-context";

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

export type WorkspaceVersionFileStatusKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "typechange"
  | "conflicted"
  | "untracked";

export type WorkspaceVersionFileStatus = {
  path: string;
  previousPath: string | null;
  status: WorkspaceVersionFileStatusKind;
  isStaged: boolean;
  isWorktree: boolean;
};

export type WorkspaceVersionBranch = {
  name: string;
  shortHead: string | null;
  isCurrent: boolean;
};

export type WorkspaceVersionControlStatusCounts = {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  typechange: number;
  conflicted: number;
  untracked: number;
};

export type WorkspaceVersionControlStatus = {
  isEnabled: boolean;
  provider: string | null;
  currentRef: string | null;
  head: string | null;
  branches: WorkspaceVersionBranch[];
  hasVersions: boolean;
  hasChanges: boolean;
  changedFileCount: number;
  counts: WorkspaceVersionControlStatusCounts;
  files: WorkspaceVersionFileStatus[];
};

export type WorkspaceVersionFileDiff = {
  path: string;
  patch: string;
  beforeContent: string;
  afterContent: string;
};

export type WorkspaceVersion = {
  id: string;
  shortId: string;
  summary: string;
  authorName: string;
  timestamp: number;
};

export type WorkspaceVersionFileEntry = {
  path: string;
  previousPath: string | null;
  status: WorkspaceVersionFileStatusKind;
  name: string;
  size: number;
};

export type WorkspaceVersionFileContent = {
  path: string;
  content: string;
  size: number;
};

export type CreateWorkspaceVersionResult = {
  version: WorkspaceVersion;
  status: WorkspaceVersionControlStatus;
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

export type ChatMessageCollaboration = {
  role: "supervisor" | "step";
  runId: string;
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  stepIndex: number;
  stepCount: number;
  phase: string;
  agentId: string;
  agentName: string;
  agentAvatar: string;
  providerName?: string | null;
  modelName?: string | null;
  planDecision?: "not_required" | "pending" | "approved" | "rejected";
  proposedStepIds?: string[];
  executedStepIds?: string[];
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
  collaboration?: ChatMessageCollaboration;
  referencedFiles?: Array<{ path: string }>;
};

export type ChatSessionMeta = {
  id: string;
  title: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isUnread?: boolean;
};

export type ChatTracePayload = {
  label: string;
  content: string;
  sourceLabel?: string;
  sourceDescription?: string;
};

export type ChatTraceStepStatus = "pending" | "running" | "done" | "error";

export type ChatTraceStep = {
  id: string;
  type:
    | "input"
    | "context"
    | "rag"
    | "request"
    | "stream"
    | "response"
    | "agent_event"
    | "error";
  label: string;
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
  status?: ChatTraceStepStatus;
  content?: string;
  metadata?: Record<string, unknown>;
  payloads?: ChatTracePayload[];
};

export type ChatTraceTurnStatus = "running" | "done" | "error";

export type ChatTraceTurn = {
  id: string;
  mode: "chat" | "agent" | "collab";
  status: ChatTraceTurnStatus;
  createdAt: number;
  updatedAt: number;
  userMessageId: string;
  assistantMessageId: string;
  userText: string;
  referencedFilePaths: string[];
  activeFilePath?: string | null;
  providerName?: string | null;
  modelName?: string | null;
  runtimeAgentId?: string | null;
  agentSessionId?: string | null;
  contextEngineId?: string | null;
  contextWindow?: number | null;
  conversationSummary?: string;
  steps: ChatTraceStep[];
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  conversation: ConversationMessage[];
  context?: ChatContextSummary | null;
  trace?: ChatTraceTurn[];
  isUnread?: boolean;
};
