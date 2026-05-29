import type { AgentRuntimeAgentEvent } from "@/agent-runtime/contract";

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
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type ChatContextSummary = {
  summary: string;
  summarizedUntilIndex: number;
  updatedAt: number;
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
