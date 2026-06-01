import type {
  ContextRagIndexSnapshot,
  ConversationMessage,
  PromptFileReference,
} from "../core/types";

export type ContextRagSourceType =
  | "workspace_file"
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
  invalidate?(reason: "history_changed" | "workspace_changed" | "strategy_changed"): Promise<void>;
};

export const createPlaceholderRagIndex = (
  id = "workspace-rag",
): ContextRagIndex => ({
  id,
  version: 1,
  getSnapshot: () => ({
    indexId: id,
    version: 1,
    status: "missing",
    updatedAt: null,
    documentCount: 0,
    chunkCount: 0,
  }),
  search: async () => [],
  upsert: async () => undefined,
  invalidate: async () => undefined,
});
