import { getKnowledgeIndexStatus, searchEnabledKnowledge } from "./api";

type KnowledgeRagIndexSnapshot = {
  indexId: string;
  version: number;
  status: "missing" | "building" | "ready" | "stale" | "error";
  updatedAt?: number | null;
  sourceFingerprint?: string | null;
  documentCount?: number | null;
  chunkCount?: number | null;
  metadata?: Record<string, unknown>;
};

type KnowledgeRagDocument = {
  id: string;
  sourceType: "document" | "conversation" | "memory" | "external";
  content: string;
  path?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
};

type KnowledgeRagMatch = KnowledgeRagDocument & {
  score?: number | null;
  chunkId?: string | null;
};

type KnowledgeRagQuery = {
  query: string;
  maxResults?: number;
  metadata?: Record<string, unknown>;
  workspaceId?: string | null;
};

type KnowledgeRagIndex = {
  id: string;
  version: number;
  getSnapshot(): Promise<KnowledgeRagIndexSnapshot | null> | KnowledgeRagIndexSnapshot | null;
  search(input: KnowledgeRagQuery): Promise<KnowledgeRagMatch[]>;
  upsert?(documents: KnowledgeRagDocument[]): Promise<void>;
  invalidate?(reason: "history_changed" | "source_changed" | "strategy_changed"): Promise<void>;
};

export const createGlobalKnowledgeRagIndex = (): KnowledgeRagIndex => ({
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
  search: async (input: KnowledgeRagQuery): Promise<KnowledgeRagMatch[]> => {
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
        origin: "rag",
        backend: "global-knowledge-library",
        retrieval: "hybrid-vector-fts",
        scope: "enabled_collections",
        sourceId: match.sourceId,
        sourceType: match.sourceType,
      },
    }));
  },
  upsert: async () => undefined,
  invalidate: async () => undefined,
});

const asString = (value: unknown) => (typeof value === "string" ? value : null);
