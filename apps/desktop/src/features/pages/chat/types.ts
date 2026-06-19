import type { AgentRuntimeAgentEvent } from "@/ai/agent-runtime/contracts";

export type {
  CreateWorkspaceVersionResult,
  WorkspaceFile,
  WorkspaceFileEntry,
  WorkspaceVersion,
  WorkspaceVersionBranch,
  WorkspaceVersionControlStatus,
  WorkspaceVersionControlStatusCounts,
  WorkspaceVersionFileContent,
  WorkspaceVersionFileDiff,
  WorkspaceVersionFileEntry,
  WorkspaceVersionFileStatus,
  WorkspaceVersionFileStatusKind,
} from "@/features/pages/workspace/files-api";

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
  mode?: "agent";
  status?: "loading" | "streaming" | "done" | "error";
  thinking?: string;
  agentEvents?: AgentRuntimeAgentEvent[];
  agentBlocks?: AgentMessageBlock[];
  agentAvatar?: string;
  agentName?: string;
  referencedFiles?: Array<{ path: string }>;
  bridgeMessageRecordId?: string | null;
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

export type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  isUnread?: boolean;
};
