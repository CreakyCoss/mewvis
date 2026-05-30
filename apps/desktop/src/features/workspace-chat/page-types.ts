import type { AgentRuntimeAgentQuestionInput } from "@/agent-runtime/contracts";
import type { WorkspaceFileEntry } from "./types";

export type WorkspaceView = "chat" | "settings";
export type ModelSource = "direct" | "agent";
export type ChatMode = "chat" | "agent" | "collab";
export type CollaborationPhase = "idle" | "drafting" | "reviewing" | "revising";
export type ContextWindowPreset = 200000 | 1000000;

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
