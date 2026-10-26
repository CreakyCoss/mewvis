import type {
  KnowledgeChunk,
  KnowledgeSearchHit,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  KnowledgeSearchTarget,
} from "@mewvis/knowledge-sdk";
import type { KnowledgeEmbeddingProvider, ServiceLimits } from "../../types.js";
import { SqliteKnowledgeStore, type BaseRow, type ChunkRow } from "./store.js";
import { abortable, cosine, normalized } from "../../embeddings.js";
import { checkSignal, fail, safeError, yieldTask } from "../../util.js";
import { matchQuery } from "../../ingestion/text.js";
import { metadataWhere } from "./filter.js";
import { reciprocalRankFusion } from "../../retrieval/ranking.js";

const hit = (
  chunk: KnowledgeChunk,
  value: number,
  kind: "relevance" | "similarity",
  higherIsBetter: boolean,
): KnowledgeSearchHit => {
  const { ordinal: _ordinal, ...evidence } = chunk;
  return {
    ...evidence,
    chunkId: chunk.id,
    score: { value, kind, higherIsBetter },
  };
};
export class KnowledgeRetriever {
  constructor(
    private store: SqliteKnowledgeStore,
    private embedding: KnowledgeEmbeddingProvider | undefined,
    private limits: ServiceLimits,
  ) {}
  async search(
    input: KnowledgeSearchInput,
    signal: AbortSignal,
  ): Promise<KnowledgeSearchResult> {
    const start = performance.now(),
      limit = input.limit ?? 8,
      mode = input.mode ?? "auto";
    if (limit > 100 || Array.from(input.query).length > 8192)
      fail(
        "INVALID_ARGUMENT",
        "Search exceeds configured result or query limits",
      );
    if ((mode === "vector" || mode === "hybrid") && !this.embedding)
      fail("NOT_SUPPORTED", "Vector retrieval requires an embedding provider");
    const predicate = metadataWhere(input.filter),
      terms = matchQuery(input.query),
      candidates = Math.min(500, Math.max(40, limit * 5));
    const targets: KnowledgeSearchTarget[] = [],
      bases: BaseRow[] = [];
    const warnings: KnowledgeSearchResult["diagnostics"]["warnings"][number][] =
      [];
    const recordFailure = (knowledgeBaseId: string, error: unknown) => {
      if (!input.allowPartial) throw error;
      targets.push({
        knowledgeBaseId,
        status: "error",
        error: safeError(error),
      });
    };
    for (const id of input.knowledgeBaseIds) {
      try {
        bases.push(this.store.base(id));
      } catch (error) {
        recordFailure(id, error);
      }
    }
    let queryVector: readonly number[] | undefined;
    const needsVector =
      mode !== "keyword" &&
      this.embedding &&
      (mode !== "auto" ||
        bases.some(
          (base) =>
            base.embedding_signature === this.embedding!.signature &&
            base.dimensions !== null,
        ));
    if (needsVector) {
      try {
        const response = await abortable(
          this.embedding!.embed([{ title: "", text: input.query }], {
            purpose: "query",
            signal,
          }),
          signal,
        );
        if (!Array.isArray(response) || response.length !== 1)
          fail("INVALID_RESPONSE", "Query embedding count is invalid");
        normalized(response[0]!, this.embedding!.dimensions);
        queryVector = response[0]!;
      } catch (error) {
        checkSignal(signal);
        if (mode !== "auto") throw error;
        warnings.push({
          code: "EMBEDDING_UNAVAILABLE",
          message: "Query embedding failed; keyword retrieval was used",
        });
      }
    }
    const keyword: KnowledgeSearchHit[] = [],
      vector: KnowledgeSearchHit[] = [];
    for (const initial of bases) {
      checkSignal(signal);
      try {
        const base = this.store.base(initial.id);
        const keywordRows =
          mode !== "vector" && terms
            ? this.store.all<ChunkRow>(
                `SELECT c.id,c.data_json,d.summary_json,NULL AS vector,bm25(kb_fts,0,0,3,1) rank FROM kb_fts JOIN kb_chunks c ON c.id=kb_fts.chunk_id JOIN kb_documents d ON d.id=c.document_id AND d.base_id=c.base_id WHERE kb_fts MATCH ? AND c.base_id=? AND (${predicate.sql}) ORDER BY rank,c.id LIMIT ?`,
                terms,
                base.id,
                ...predicate.params,
                candidates,
              )
            : [];
        let vectorHits: KnowledgeSearchHit[] = [];
        if (mode !== "keyword") {
          const exists = !!this.store.one(
            "SELECT 1 FROM kb_chunks WHERE base_id=? LIMIT 1",
            base.id,
          );
          const compatible =
            this.embedding &&
            base.embedding_signature === this.embedding.signature;
          if (exists && !compatible) {
            if (mode !== "auto")
              fail(
                "NOT_READY",
                "Knowledge base must be reindexed for the configured embedding model",
              );
            if (this.embedding || base.embedding_signature)
              warnings.push({
                code: "INDEX_CONFIGURATION_CHANGED",
                message:
                  "Vector index does not match the current embedding configuration; keyword retrieval was used",
                knowledgeBaseId: base.id,
              });
          } else if (exists && queryVector && base.dimensions !== null) {
            try {
              const q = normalized(queryVector, base.dimensions);
              const footprint = this.store.one<{
                n: number;
                bytes: number | null;
              }>(
                `SELECT COUNT(*) n,SUM(length(c.vector)+length(c.data_json)+length(d.summary_json)) bytes FROM kb_chunks c JOIN kb_documents d ON d.id=c.document_id AND d.base_id=c.base_id WHERE c.base_id=? AND c.vector IS NOT NULL AND (${predicate.sql})`,
                base.id,
                ...predicate.params,
              )!;
              if (
                footprint.n > this.limits.maxVectorSearchChunks ||
                (footprint.bytes ?? 0) > this.limits.maxVectorSearchBytes
              )
                fail(
                  "INVALID_ARGUMENT",
                  "Vector search scope exceeds configured limits; narrow the metadata filter",
                );
              // Scope and metadata are applied before scoring; never globally truncate then post-filter.
              const rows = this.store.all<ChunkRow>(
                `SELECT c.id,c.data_json,d.summary_json,c.vector FROM kb_chunks c JOIN kb_documents d ON d.id=c.document_id AND d.base_id=c.base_id WHERE c.base_id=? AND c.vector IS NOT NULL AND (${predicate.sql})`,
                base.id,
                ...predicate.params,
              );
              const scored: { row: ChunkRow; score: number }[] = [];
              for (const [i, row] of rows.entries()) {
                scored.push({ row, score: cosine(q, row.vector!) });
                if (i > 0 && i % 128 === 0) await yieldTask(signal);
              }
              vectorHits = scored
                .sort(
                  (a, b) =>
                    b.score - a.score || a.row.id.localeCompare(b.row.id),
                )
                .slice(0, candidates)
                .map(({ row, score }) =>
                  hit(this.store.chunkValue(row), score, "similarity", true),
                );
            } catch (error) {
              checkSignal(signal);
              if (mode !== "auto") throw error;
              warnings.push({
                code: "VECTOR_RETRIEVAL_UNAVAILABLE",
                message: "Vector retrieval failed; keyword retrieval was used",
                knowledgeBaseId: base.id,
              });
            }
          }
        }
        keyword.push(
          ...keywordRows.map((row) =>
            hit(
              this.store.chunkValue(row),
              Number(row.rank),
              "relevance",
              false,
            ),
          ),
        );
        vector.push(...vectorHits);
        targets.push({
          knowledgeBaseId: base.id,
          status: "ok",
          indexRevision: `${base.id}:${base.generation}`,
        });
      } catch (error) {
        checkSignal(signal);
        recordFailure(initial.id, error);
      }
    }
    checkSignal(signal);
    keyword.sort(
      (a, b) => a.score!.value - b.score!.value || a.id.localeCompare(b.id),
    );
    vector.sort(
      (a, b) => b.score!.value - a.score!.value || a.id.localeCompare(b.id),
    );
    const results =
      mode === "keyword"
        ? keyword
        : mode === "vector"
          ? vector
          : vector.length
            ? reciprocalRankFusion(keyword, vector)
            : keyword;
    return {
      hits: results.slice(0, limit),
      diagnostics: {
        status: targets.some((target) => target.status === "error")
          ? "partial"
          : "complete",
        elapsedMs: performance.now() - start,
        targets,
        warnings,
      },
    };
  }
}
