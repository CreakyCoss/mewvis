import type { AgentClientAgentEvent, AskUserInput } from "@/agent-client/types";
import type { FileReferenceMatch as ContextFileReferenceMatch } from "@/features/ai/components/context-tools";
import type { WorkspaceFileEntry } from "@/api/workspace-files";

export type FileReferenceMatch = ContextFileReferenceMatch<WorkspaceFileEntry>;

export type PendingAgentQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  context?: string | null;
  input?: AskUserInput;
};

export type ComposerSubmitInput = {
  text: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: FileReferenceMatch[];
  ambiguousFileReferences: FileReferenceMatch[];
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
      events: AgentClientAgentEvent[];
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
  agentEvents?: AgentClientAgentEvent[];
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
