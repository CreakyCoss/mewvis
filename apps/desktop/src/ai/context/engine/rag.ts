import type { ContextRagIndex } from "../protocol/rag";

export type {
  ContextRagDocument,
  ContextRagIndex,
  ContextRagIndexSnapshot,
  ContextRagMatch,
  ContextRagQuery,
  ContextRagSourceType,
} from "../protocol/rag";

export const createPlaceholderRagIndex = (
  id = "context-rag",
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
