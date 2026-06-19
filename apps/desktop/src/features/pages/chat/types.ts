import type {
  AgentRuntimeAgentEvent,
  AgentRuntimeAgentQuestionInput,
} from "@/ai/agent-runtime/contracts";
import type {
  ActiveReferenceToken as RuntimeActiveReferenceToken,
  FileReferenceMatch as RuntimeFileReferenceMatch,
} from "@/features/ai/runtime";
import type { WorkspaceFileEntry } from "@/features/pages/workspace/files-api";

export type ModelSource = "direct" | "agent";

export type ActiveReferenceToken = RuntimeActiveReferenceToken;
export type FileReferenceMatch = RuntimeFileReferenceMatch<WorkspaceFileEntry>;

export type PendingAgentQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  context?: string | null;
  input?: AgentRuntimeAgentQuestionInput;
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
