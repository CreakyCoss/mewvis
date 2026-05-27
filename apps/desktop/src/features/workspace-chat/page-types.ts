import type { CodingAgentQuestionInput } from "@/agent-runtime/base";
import type { WorkspaceFileEntry } from "./types";

export type WorkspaceView = "chat" | "file" | "split";
export type ModelSource = "direct" | "agent";
export type ChatMode = "chat" | "agent" | "collab";
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

export type ResolvedFileReference = {
  path: string;
  content: string;
};

export type PendingAgentQuestion = {
  taskId: string;
  questionId: string;
  question: string;
  context?: string | null;
  input?: CodingAgentQuestionInput;
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
