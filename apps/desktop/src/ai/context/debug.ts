import type {
  ConversationMessage,
} from "./protocol/context";
import type {
  PromptKnowledgeReference,
} from "./protocol/prompt";

export type ContextDebugPayload = {
  label: string;
  content: string;
  sourceLabel?: string;
  sourceDescription?: string;
};

export type ContextTraceStepType =
  | "input"
  | "file"
  | "context"
  | "rag"
  | "request"
  | "response"
  | "error";

export type ContextTraceStepStatus =
  | "pending"
  | "running"
  | "done"
  | "error";

export type ContextTraceStep = {
  id: string;
  type: ContextTraceStepType;
  label: string;
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
  status?: ContextTraceStepStatus;
  content?: string;
  metadata?: Record<string, unknown>;
  payloads?: ContextDebugPayload[];
};

export type ContextTraceTurn = {
  id: string;
  status: "running" | "done" | "error";
  createdAt: number;
  updatedAt: number;
  chatId: string | null;
  userMessageId: string;
  assistantMessageId?: string | null;
  userText: string;
  referencedFilePaths: string[];
  activeFilePath?: string | null;
  engineId?: string | null;
  contextWindow?: number | null;
  conversationSummary?: string;
  steps: ContextTraceStep[];
};

export type ContextDebugSnapshot = {
  id: string;
  turnId: string;
  chatId: string | null;
  updatedAt: number;
  engineId: string | null;
  contextWindow: number | null;
  activeFilePath?: string | null;
  referencedFilePaths: string[];
  activeSkillNames: string[];
  selectedAgentId?: string | null;
  selectedAgentName?: string | null;
  conversationSummary: string;
  runtimeMessages: ConversationMessage[];
  knowledgeMatches: PromptKnowledgeReference[];
  systemPrompt: string;
  payloads: ContextDebugPayload[];
};
