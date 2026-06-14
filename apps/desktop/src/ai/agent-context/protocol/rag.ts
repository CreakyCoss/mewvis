import type { ConversationMessage } from "./context";
import type { PromptFileReference } from "./prompt";

export type ContextRagIndexSnapshot = {
  indexId: string;
  version: number;
  status: "missing" | "building" | "ready" | "stale" | "error";
  updatedAt?: number | null;
  sourceFingerprint?: string | null;
  documentCount?: number | null;
  chunkCount?: number | null;
  metadata?: Record<string, unknown>;
};

export type ContextRagSourceType =
  | "document"
  | "conversation"
  | "memory"
  | "external";

export type ContextRagDocument = {
  id: string;
  sourceType: ContextRagSourceType;
  content: string;
  path?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
};

export type ContextRagQuery = {
  query: string;
  conversation: ConversationMessage[];
  references?: PromptFileReference[];
  maxResults?: number;
  metadata?: Record<string, unknown>;
};

export type ContextRagMatch = ContextRagDocument & {
  score?: number | null;
  chunkId?: string | null;
};

export type ContextRagIndex = {
  id: string;
  version: number;
  getSnapshot(): Promise<ContextRagIndexSnapshot | null> | ContextRagIndexSnapshot | null;
  search(input: ContextRagQuery): Promise<ContextRagMatch[]>;
  upsert?(documents: ContextRagDocument[]): Promise<void>;
  invalidate?(reason: "history_changed" | "source_changed" | "strategy_changed"): Promise<void>;
};
