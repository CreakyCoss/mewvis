import { randomUUID } from "node:crypto";
import type {
  KnowledgeChunk,
  KnowledgeErrorInfo,
  KnowledgeJob,
  KnowledgeTextDocument,
} from "@mewvis/knowledge-sdk";
import type {
  KnowledgeEmbeddingProvider,
  PendingJob,
  ServiceLimits,
} from "../../types.js";
import { SqliteKnowledgeStore, type DocumentRow } from "./store.js";
import { abortable, normalized, vectorBytes } from "../../embeddings.js";
import {
  checkSignal,
  fail,
  json,
  now,
  safeError,
  yieldTask,
} from "../../util.js";
import { splitDocument, type Chunking } from "../../ingestion/text.js";

interface PreparedDocument {
  id: string;
  input: KnowledgeTextDocument;
  revision: string;
  chunks: KnowledgeChunk[];
  vectors: (Uint8Array | null)[];
}
type Outcome = NonNullable<KnowledgeJob["result"]>["documents"][number];
export const terminal = (state: KnowledgeJob["state"]) =>
  ["succeeded", "partially_succeeded", "failed", "cancelled"].includes(state);

/** Durable single-writer queue. All index changes and terminal success are published together. */
export class KnowledgeJobs {
  private running: Promise<void> | undefined;
  private scheduled: NodeJS.Immediate | undefined;
  private stopping = false;
  private active: { id: string; controller: AbortController } | undefined;
  fault: KnowledgeErrorInfo | undefined;
  constructor(
    private store: SqliteKnowledgeStore,
    private embedding: KnowledgeEmbeddingProvider | undefined,
    private chunking: Chunking,
    private limits: ServiceLimits,
  ) {}
  get signature() {
    return this.embedding?.signature ?? null;
  }
  wake() {
    if (this.stopping || this.running || this.scheduled || this.fault) return;
    this.scheduled = setImmediate(() => {
      this.scheduled = undefined;
      this.running = this.loop()
        .catch((error) => {
          this.fault = safeError(error);
        })
        .finally(() => {
          this.running = undefined;
          if (
            !this.stopping &&
            !this.fault &&
            this.store.one("SELECT 1 FROM kb_jobs WHERE state='queued' LIMIT 1")
          )
            this.wake();
        });
    });
  }
  async stop() {
    this.stopping = true;
    if (this.scheduled) {
      clearImmediate(this.scheduled);
      this.scheduled = undefined;
    }
    this.active?.controller.abort();
    await this.running;
  }
  cancel(baseId: string, id: string): KnowledgeJob {
    const job = this.store.job(baseId, id);
    if (terminal(job.state)) return job;
    const next: KnowledgeJob = {
      ...job,
      state: job.state === "queued" ? "cancelled" : "cancelling",
      updatedAt: now(),
    };
    this.store.saveJob(next);
    return next;
  }
  interrupt(id: string) {
    if (this.active?.id === id) this.active.controller.abort();
  }
  assertProfile(baseId: string) {
    const row = this.store.base(baseId);
    if (
      this.store.one(
        "SELECT 1 FROM kb_documents WHERE base_id=? LIMIT 1",
        baseId,
      ) &&
      row.embedding_signature !== this.signature
    )
      fail(
        "NOT_READY",
        "Embedding configuration changed; reindex the entire knowledge base before importing or reindexing selected documents",
      );
  }
  private async loop() {
    while (!this.stopping) {
      const next = this.store.claim();
      if (!next) return;
      const controller = new AbortController();
      this.active = { id: next.job.id, controller };
      try {
        await this.execute(next.job, next.payload, controller.signal);
      } catch (error) {
        this.store.transaction(() => {
          const current = this.store.job(next.job.knowledgeBaseId, next.job.id);
          if (current.state === "cancelling")
            this.store.saveJob({
              ...current,
              state: "cancelled",
              updatedAt: now(),
            });
          else if (this.stopping)
            this.store.saveJob({
              ...next.job,
              state: "queued",
              updatedAt: now(),
              progress: {
                ...next.job.progress,
                processed: 0,
                failed: 0,
                skipped: 0,
              },
            });
          else if (controller.signal.aborted)
            this.store.saveJob({
              ...current,
              state: "cancelled",
              updatedAt: now(),
            });
          else
            this.store.saveJob({
              ...current,
              state: "failed",
              error: safeError(error),
              updatedAt: now(),
            });
        });
      } finally {
        this.active = undefined;
      }
      await yieldTask();
    }
  }
  private async execute(
    job: KnowledgeJob,
    payload: PendingJob,
    signal: AbortSignal,
  ) {
    checkSignal(signal);
    this.store.base(job.knowledgeBaseId);
    if (
      payload.operation === "delete-base" ||
      payload.operation === "delete-documents"
    ) {
      this.store.transaction(() => {
        checkSignal(signal);
        const ids = payload.documentIds ?? [];
        if (payload.operation === "delete-base")
          this.store.run(
            "DELETE FROM kb_bases WHERE id=?",
            job.knowledgeBaseId,
          );
        else {
          for (const id of ids)
            this.store.run(
              "DELETE FROM kb_documents WHERE id=? AND base_id=?",
              id,
              job.knowledgeBaseId,
            );
          const base = this.store.base(job.knowledgeBaseId);
          const remains = !!this.store.one(
            "SELECT 1 FROM kb_documents WHERE base_id=? LIMIT 1",
            base.id,
          );
          this.store.publish(
            base.id,
            remains ? base.embedding_signature : null,
            remains ? base.dimensions : null,
          );
        }
        const total = payload.operation === "delete-base" ? 1 : ids.length;
        this.store.saveJob({
          ...job,
          state: "succeeded",
          progress: { total, processed: total, failed: 0, skipped: 0 },
          updatedAt: now(),
          result: {
            documents: ids.map((documentId) => ({
              documentId,
              status: "succeeded",
            })),
          },
        });
      });
      return;
    }
    if (payload.embeddingSignature !== this.signature)
      fail(
        "NOT_READY",
        "Queued job belongs to a different embedding configuration",
      );
    if (!payload.all) this.assertProfile(job.knowledgeBaseId);
    const base = this.store.base(job.knowledgeBaseId);
    const rows =
      payload.operation === "reindex"
        ? payload.all
          ? this.store.all<DocumentRow>(
              "SELECT * FROM kb_documents WHERE base_id=? ORDER BY id",
              base.id,
            )
          : payload.documentIds!.map((id) => this.store.document(base.id, id))
        : [];
    const inputs =
      payload.documents ??
      rows.map((row) => json<KnowledgeTextDocument>(row.input_json));
    const staged: PreparedDocument[] = [],
      outcomes: Outcome[] = [];
    let processed = 0,
      failed = 0,
      skipped = 0,
      bytes = 0;
    let dimensions =
      this.embedding?.dimensions ??
      (base.embedding_signature === this.signature
        ? (base.dimensions ?? undefined)
        : undefined);
    for (const [index, input] of inputs.entries()) {
      checkSignal(signal);
      const bytesBeforeDocument = bytes;
      let existing: DocumentRow | undefined;
      try {
        existing =
          payload.operation === "reindex"
            ? rows[index]
            : this.store.byExternalId(base.id, input.externalId);
        if (
          existing &&
          payload.operation === "import" &&
          payload.duplicatePolicy !== "replace"
        ) {
          if (payload.duplicatePolicy !== "skip")
            fail("CONFLICT", "Document external ID already exists");
          skipped++;
          outcomes.push({
            documentId: existing.id,
            ...(input.externalId ? { externalId: input.externalId } : {}),
            status: "skipped",
          });
        } else {
          const id = existing?.id ?? randomUUID();
          const prepared = splitDocument(input, base.id, id, this.chunking);
          if (
            !prepared.chunks.length ||
            prepared.chunks.length > this.limits.maxChunksPerBase
          )
            fail("INVALID_ARGUMENT", "Document produces too many chunks");
          const first = existing
            ? this.store.one<{ id: string }>(
                "SELECT id FROM kb_chunks WHERE document_id=? ORDER BY id LIMIT 1",
                id,
              )
            : undefined;
          if (
            payload.operation === "import" &&
            existing?.revision === prepared.revision &&
            first?.id === prepared.chunks[0]!.id
          ) {
            skipped++;
            outcomes.push({
              documentId: id,
              ...(input.externalId ? { externalId: input.externalId } : {}),
              status: "skipped",
            });
          } else {
            const vectors: (Uint8Array | null)[] = [];
            let documentDimensions = dimensions;
            for (
              let offset = 0;
              offset < prepared.chunks.length;
              offset += 32
            ) {
              checkSignal(signal);
              const batch = prepared.chunks.slice(offset, offset + 32);
              if (this.embedding) {
                const response = await abortable(
                  this.embedding.embed(
                    batch.map((chunk) => ({
                      title: chunk.title,
                      text: chunk.text,
                    })),
                    { purpose: "document", signal },
                  ),
                  signal,
                );
                if (
                  !Array.isArray(response) ||
                  response.length !== batch.length
                )
                  fail(
                    "INVALID_RESPONSE",
                    "Embedding response count is invalid",
                  );
                for (const raw of response) {
                  const vector = normalized(raw, documentDimensions);
                  documentDimensions ??= vector.length;
                  bytes += vector.byteLength;
                  if (bytes > 128 * 1024 * 1024)
                    fail(
                      "INVALID_ARGUMENT",
                      "Index staging exceeds 128 MiB; import a smaller batch",
                    );
                  vectors.push(vectorBytes(vector));
                }
              } else vectors.push(...batch.map(() => null));
              await yieldTask(signal);
            }
            dimensions = documentDimensions;
            staged.push({
              id,
              input,
              revision: prepared.revision,
              chunks: prepared.chunks,
              vectors,
            });
            outcomes.push({
              documentId: id,
              ...(input.externalId ? { externalId: input.externalId } : {}),
              status: "succeeded",
            });
          }
        }
      } catch (error) {
        bytes = bytesBeforeDocument;
        checkSignal(signal);
        failed++;
        outcomes.push({
          ...(existing ? { documentId: existing.id } : {}),
          ...(input.externalId ? { externalId: input.externalId } : {}),
          status: "failed",
          error: safeError(error),
        });
        if (payload.operation === "reindex") {
          this.store.transaction(() =>
            this.store.saveJob({
              ...job,
              progress: {
                total: inputs.length,
                processed: index + 1,
                failed,
                skipped,
              },
              updatedAt: now(),
            }),
          );
          throw error;
        }
      }
      processed++;
      this.store.transaction(() =>
        this.store.saveJob({
          ...job,
          progress: { total: inputs.length, processed, failed, skipped },
          updatedAt: now(),
        }),
      );
      await yieldTask(signal);
    }
    checkSignal(signal);
    this.store.transaction(() => {
      checkSignal(signal);
      this.store.base(base.id);
      const current = this.store.one<{ n: number }>(
        "SELECT COUNT(*) n FROM kb_chunks WHERE base_id=?",
        base.id,
      )!.n;
      const replaced = staged.reduce(
        (sum, doc) =>
          sum +
          this.store.one<{ n: number }>(
            "SELECT COUNT(*) n FROM kb_chunks WHERE document_id=?",
            doc.id,
          )!.n,
        0,
      );
      if (
        current -
          replaced +
          staged.reduce((sum, doc) => sum + doc.chunks.length, 0) >
        this.limits.maxChunksPerBase
      )
        fail("INVALID_ARGUMENT", "Knowledge base chunk limit exceeded");
      for (const doc of staged)
        this.store.putDocument(
          base.id,
          doc.id,
          doc.input,
          doc.revision,
          doc.chunks,
          doc.vectors,
        );
      if (staged.length || payload.all)
        this.store.publish(base.id, this.signature, dimensions ?? null);
      const successes = outcomes.filter(
        (outcome) => outcome.status === "succeeded",
      ).length;
      const state =
        failed === 0
          ? "succeeded"
          : successes || skipped
            ? "partially_succeeded"
            : "failed";
      this.store.saveJob({
        ...job,
        state,
        progress: { total: inputs.length, processed, failed, skipped },
        updatedAt: now(),
        ...(state === "failed"
          ? {
              error: outcomes.find((outcome) => outcome.error)?.error ?? {
                code: "INTERNAL_ERROR",
                message: "Import failed",
              },
            }
          : {}),
        result: { documents: outcomes },
      });
    });
  }
}
