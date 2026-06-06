import type { AgentRuntimeAgentQuestionInput } from "@/ai/agent-runtime/contracts";
import type { ConversationMessage, WorkspaceFileEntry } from "./types";

export type WorkspaceView = "chat" | "settings" | "knowledge" | "tavern";
export type ModelSource = "direct" | "agent";
export type ChatMode = "chat" | "agent" | "collab";
export type ChatExecutionMode = "direct" | "agent";
export type CollaborationPhase = "idle" | "drafting" | "reviewing" | "revising";
export type ContextWindowPreset = "auto" | 1000000;

export type ContextDebugPayload = {
  label: string;
  content: string;
  sourceLabel?: string;
  sourceDescription?: string;
};

export type ContextDebugSnapshot = {
  id: string;
  updatedAt: number;
  mode: ChatMode;
  engineId: string;
  contextWindow: number;
  runtimeAgentId: string;
  agentSessionId?: string | null;
  providerName?: string | null;
  modelName?: string | null;
  activeFilePath?: string | null;
  referencedFilePaths: string[];
  enabledSkillNames: string[];
  conversationSummary: string;
  runtimeMessages: ConversationMessage[];
  payloads: ContextDebugPayload[];
};

export type FileReferenceMatch = {
  token: string;
  matches: WorkspaceFileEntry[];
};

export type FileTreeNode = {
  path: string;
  name: string;
  isDirectory: boolean;
  children: FileTreeNode[];
  entry?: WorkspaceFileEntry;
};

export type ResolvedFileReference = {
  path: string;
  content: string;
};

export type PendingAgentQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  context?: string | null;
  input?: AgentRuntimeAgentQuestionInput;
};

export type CollaborationPlanDecisionStep = {
  id: string;
  name: string;
  agentName: string;
};

export type CollaborationPlanDecisionRequest = {
  id: string;
  messageId: string;
  workflowName: string;
  reason: string;
  configuredSteps: CollaborationPlanDecisionStep[];
  proposedSteps: CollaborationPlanDecisionStep[];
};

export type ActiveReferenceToken = {
  start: number;
  end: number;
  query: string;
};

export type ComposerSubmitInput = {
  text: string;
  referencedFilePreviews: WorkspaceFileEntry[];
  unresolvedFileReferences: FileReferenceMatch[];
  ambiguousFileReferences: FileReferenceMatch[];
};
