import type { AgentRuntimeAgentQuestionInput } from "@/ai/agent-runtime/contracts";
import type { WorkspaceFileEntry } from "./types";

export type WorkspaceView = "chat" | "settings" | "skills" | "knowledge" | "tavern";
export type ModelSource = "direct" | "agent";
export type ChatMode = "chat" | "agent" | "collab";
export type ChatExecutionMode = "direct" | "agent";
export type CollaborationPhase = "idle" | "drafting" | "reviewing" | "revising";

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
