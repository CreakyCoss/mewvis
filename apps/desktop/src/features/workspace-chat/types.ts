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
