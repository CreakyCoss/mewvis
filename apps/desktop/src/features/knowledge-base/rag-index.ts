import type {
  ContextRagIndex,
  ContextRagMatch,
  ContextRagQuery,
} from "@/ai/agent-context";
import { getKnowledgeIndexStatus, searchEnabledKnowledge } from "./api";

type KnowledgeRagQuery = ContextRagQuery & {
  workspaceId?: string | null;
};

export const createGlobalKnowledgeRagIndex = (): ContextRagIndex => ({
  id: "global-knowledge-enabled-collections",
  version: 1,
  getSnapshot: async () => {
    const status = await getKnowledgeIndexStatus();
    return {
      indexId: status.indexId,
      version: status.version,
      status: status.status,
      updatedAt: status.updatedAt,
      sourceFingerprint: status.sourceFingerprint,
      documentCount: status.documentCount,
      chunkCount: status.chunkCount,
      metadata: {
        scope: "enabled_collections",
        backend: "global-knowledge-library",
        error: status.error,
      },
    };
  },
  search: async (input: KnowledgeRagQuery): Promise<ContextRagMatch[]> => {
    const workspaceId = input.workspaceId ?? asString(input.metadata?.workspaceId);
    if (!input.query.trim()) {
      return [];
    }

    const result = await searchEnabledKnowledge({
      workspaceId,
      query: input.query,
      maxResults: input.maxResults,
    });

    return result.matches.map((match) => ({
      id: match.id,
      sourceType: "external",
      content: match.content,
      path: match.path,
      title: match.title,
      score: match.score,
      chunkId: match.chunkId,
      metadata: {
        sourceId: match.sourceId,
        sourceType: match.sourceType,
      },
    }));
  },
  upsert: async () => undefined,
  invalidate: async () => undefined,
});

const asString = (value: unknown) =>
  typeof value === "string" ? value : null;
