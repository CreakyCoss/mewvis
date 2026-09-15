import { discover, chunkDocument } from "./documents.js";
import { embed } from "./embeddings.js";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs/promises";
import {
  RagDatabase,
  chunkSelect,
  textHash as hash,
} from "./storage/database.js";
import { recordId } from "../../shared/record-id.js";
import { setImmediate } from "node:timers/promises";
import { KnowledgeRepository } from "./repository.js";
import { Serial } from "../../shared/serial.js";
import {
  invalid,
  nonempty,
  type JsonObject,
  ServiceError,
} from "../../shared/validation.js";

export class KnowledgeIndex {
  private db: DatabaseSync;
  private storage: RagDatabase;
  private serial = new Serial();
  private generation = 0;
  private controller = new AbortController();
  constructor(
    private repo: KnowledgeRepository,
    dataDir: string,
  ) {
    this.storage = new RagDatabase(dataDir);
    this.db = this.storage.db;
  }
  cancel() {
    this.controller.abort();
    this.generation++;
  }
  close() {
    this.db.close();
  }
  stale(id?: string) {
    this.generation++;
    this.db
      .prepare(
        "UPDATE rag_index_state SET status='stale',source_fingerprint=NULL,updated_at=?" +
          (id ? " WHERE id=?" : ""),
      )
      .run(Date.now(), ...(id ? [id] : []));
  }
  status(id = "global"): any {
    return this.storage.status(id);
  }
  private saveStatus(value: any) {
    this.storage.saveStatus(value);
  }
  prune() {
    this.generation++;
    const library = this.repo.library(),
      collections = new Set(library.collections.map((c) => c.id)),
      sources = new Set(library.sources.map((s) => s.id));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of this.db
        .prepare(
          "SELECT source_id FROM rag_source_state UNION SELECT source_id FROM rag_chunks",
        )
        .all())
        if (!sources.has(row.source_id))
          this.storage.clearSource(String(row.source_id));
      for (const row of this.db.prepare("SELECT id FROM rag_index_state").all())
        if (row.id !== "global" && !collections.has(row.id))
          this.db.prepare("DELETE FROM rag_index_state WHERE id=?").run(row.id);
      this.stale();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  rebuild(i: JsonObject) {
    return this.serial.run(async () => {
      this.controller.signal.throwIfAborted();
      const collection = this.repo.collection(i.collectionId),
        profile = this.repo.profile(collection.embeddingProfileId);
      if (!collection.sourceIds.length) invalid("知识库没有来源");
      const generation = this.generation;
      const status = {
        ...this.status(collection.id),
        status: "building",
        updatedAt: Date.now(),
        error: null,
      };
      this.saveStatus(status);
      const documents: any[] = [],
        chunks: any[] = [],
        sourceResults: any[] = [];
      let count = 0,
        totalBytes = 0;
      try {
        for (const source of this.repo
          .library()
          .sources.filter(
            (s) => s.enabled && collection.sourceIds.includes(s.id),
          )) {
          let docs = 0,
            parts = 0;
          const start = chunks.length,
            documentStart = documents.length;
          try {
            if (source.kind === "manual") invalid("暂不支持手写知识源索引");
            for (const file of await discover(source.uri)) {
              totalBytes += file.sizeBytes;
              if (totalBytes > 256 * 1024 * 1024)
                invalid("单次索引文本超过 256 MiB");
              const content = new TextDecoder("utf-8", { fatal: true }).decode(
                await fs.readFile(file.path),
              );
              if (!content.trim()) continue;
              docs++;
              const documentId = recordId(undefined);
              documents.push({
                ...file,
                id: documentId,
                sourceId: source.id,
                content,
              });
              for (const chunk of chunkDocument(content)) {
                chunks.push({
                  id: recordId(undefined),
                  documentId,
                  sourceId: source.id,
                  path: file.path,
                  title: file.name,
                  ...chunk,
                });
                parts++;
                if (chunks.length > 50000) invalid("单次索引分块超过 50000");
              }
              await setImmediate();
            }
            sourceResults.push({
              sourceId: source.id,
              status: "ready",
              documentCount: docs,
              chunkCount: parts,
              error: null,
            });
            count += docs;
          } catch (error) {
            chunks.splice(start);
            documents.splice(documentStart);
            sourceResults.push({
              sourceId: source.id,
              status: "error",
              documentCount: 0,
              chunkCount: 0,
              error:
                error instanceof ServiceError
                  ? error.message
                  : "无法读取知识源文件",
            });
          }
        }
        let vectorError: string | null = null;
        try {
          if (sourceResults.every((r) => r.status === "ready"))
            for (
              let offset = 0;
              offset < chunks.length;
              offset += profile.batchSize
            ) {
              const batch = chunks.slice(offset, offset + profile.batchSize),
                vectors = await embed(
                  profile,
                  batch,
                  false,
                  this.controller.signal,
                );
              if (
                (offset + batch.length) * profile.dimensions * 8 >
                256 * 1024 * 1024
              )
                invalid("向量索引超过 256 MiB，请减少文件或向量维度");
              batch.forEach((c, n) => {
                c.vector = vectors[n];
              });
            }
        } catch (error) {
          vectorError =
            error instanceof ServiceError ? error.message : "向量服务请求失败";
        }
        if (generation !== this.generation)
          throw new ServiceError(
            409,
            "INDEX_CHANGED",
            "重建期间配置已更改，请重新索引",
          );
        this.db.exec("BEGIN IMMEDIATE");
        try {
          for (const sourceId of collection.sourceIds)
            this.storage.clearSource(sourceId);
          for (const d of documents)
            this.db
              .prepare(
                `INSERT INTO rag_documents
            (id,source_id,path,title,mime,size_bytes,modified_at,content_hash,metadata_json,created_at,updated_at)
            VALUES(?,?,?,?,'text/plain',?,?,?,NULL,?,?)`,
              )
              .run(
                d.id,
                d.sourceId,
                d.path,
                d.name,
                d.sizeBytes,
                d.modifiedAt,
                hash(d.content),
                Date.now(),
                Date.now(),
              );
          if (chunks.some((c) => c.vector)) this.storage.ensureProfile(profile);
          for (const c of chunks) {
            this.db
              .prepare(
                `INSERT INTO rag_chunks(id,source_id,document_id,chunk_index,content,token_count,char_start,char_end,line_start,line_end,content_hash,metadata_json,created_at)
              VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,NULL,?)`,
              )
              .run(
                c.id,
                c.sourceId,
                c.documentId,
                c.index,
                c.content,
                Math.max(1, Math.floor(Array.from(c.content).length / 3)),
                c.charStart,
                c.charEnd,
                hash(c.content),
                Date.now(),
              );
            this.db
              .prepare(
                "INSERT INTO rag_chunks_fts(chunk_id,source_id,title,path,content) VALUES(?,?,?,?,?)",
              )
              .run(c.id, c.sourceId, c.title, c.path, c.content);
            if (c.vector) this.storage.putVector(profile, c);
          }
          for (const r of sourceResults)
            this.db
              .prepare(
                `INSERT INTO rag_source_state(source_id,status,document_count,chunk_count,content_fingerprint,error,updated_at)
            VALUES(?,?,?,?,NULL,?,?)`,
              )
              .run(
                r.sourceId,
                r.status,
                r.documentCount,
                r.chunkCount,
                r.error,
                Date.now(),
              );
          const error =
            vectorError ||
            sourceResults
              .filter((r) => r.error)
              .map((r) => r.error)
              .join("\n") ||
            null;
          this.saveStatus({
            ...status,
            status: error ? "error" : "ready",
            updatedAt: Date.now(),
            error,
            documentCount: count,
            chunkCount: chunks.length,
            sourceFingerprint: hash(
              sourceResults
                .slice()
                .sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1))
                .map(
                  (r) =>
                    `${r.sourceId}=${r.status}:${r.documentCount}:${r.chunkCount}`,
                )
                .join("\n"),
            ),
          });
          this.db.exec("COMMIT");
        } catch (error) {
          this.db.exec("ROLLBACK");
          throw error;
        }
        return { status: this.status(collection.id), sourceResults };
      } catch (error) {
        this.saveStatus({
          ...status,
          status: "error",
          error:
            error instanceof ServiceError ? error.message : "知识库重建失败",
        });
        throw error;
      }
    });
  }
  async search(i: JsonObject) {
    const query =
      typeof i.query === "string" ? i.query.trim() : nonempty(i.query, "query");
    if (
      i.collectionIds != null &&
      (!Array.isArray(i.collectionIds) ||
        i.collectionIds.some((x) => typeof x !== "string"))
    )
      invalid("collectionIds 必须是字符串数组");
    const max = Math.max(1, Math.min(20, Number(i.maxResults ?? 8))),
      min = Number(i.minScore ?? 0);
    if (!Number.isFinite(max) || !Number.isFinite(min)) invalid("检索参数无效");
    const library = this.repo.library(),
      collections = library.collections.filter(
        (c) =>
          c.enabled &&
          (!i.collectionIds || (i.collectionIds as unknown[]).includes(c.id)),
      );
    const sources = new Set(
      library.sources
        .filter(
          (s) =>
            s.enabled && collections.some((c) => c.sourceIds.includes(s.id)),
        )
        .map((s) => s.id),
    );
    const enabledSourceIds = [...sources].sort();
    if (!query || !sources.size) return { matches: [], enabledSourceIds };
    const ranked = new Map<string, any>();
    const accept = (r: any, score: number) => {
      if (!sources.has(r.source_id) || score < min) return;
      const key = `${r.source_id}\0${r.path}\0${r.content}`;
      if (score <= (ranked.get(key)?.score ?? -1)) return;
      ranked.set(key, {
        id: r.id,
        sourceId: r.source_id,
        chunkId: r.id,
        sourceType: "global_knowledge",
        content: r.content,
        path: r.path,
        title: r.title,
        score,
      });
    };
    const terms = query
      .match(/[\p{L}\p{N}_]+/gu)
      ?.map((w) => '"' + w.replaceAll('"', '""') + '"')
      .join(" OR ");
    if (terms)
      for (const r of this.db
        .prepare(
          "SELECT c.*,d.path,d.title,bm25(rag_chunks_fts) AS rank FROM rag_chunks_fts JOIN rag_chunks c ON c.id=rag_chunks_fts.chunk_id JOIN rag_documents d ON d.id=c.document_id WHERE rag_chunks_fts MATCH ? ORDER BY rank LIMIT 1000",
        )
        .all(terms))
        accept(r, 1 / (1 + Math.abs(Number(r.rank))));
    for (const collection of collections) {
      const p = this.repo
        .profiles()
        .find((p) => p.id === collection.embeddingProfileId);
      if (!p) continue;
      if (
        !this.db
          .prepare(
            "SELECT 1 FROM rag_vector_state WHERE profile_id=? AND model_id=? AND dimensions=?",
          )
          .get(p.id, p.modelId, p.dimensions)
      )
        continue;
      try {
        const [q] = await embed(
          p,
          [{ content: query }],
          true,
          this.controller.signal,
        );
        for (const row of this.storage.vectorSearch(
          p,
          q,
          collection.sourceIds.filter((id: string) => sources.has(id)),
          Math.trunc(max),
        )) {
          const score = 1 / (1 + Math.max(0, Number(row.distance)));
          if (score >= 0.55) accept(row, score);
        }
      } catch {
        /* Text retrieval remains usable when a configured embedding endpoint is offline. */
      }
    }
    if (!ranked.size) {
      const escaped = query.replace(/[\\%_]/g, "\\$&");
      for (const r of this.db
        .prepare(chunkSelect + " WHERE c.content LIKE ? ESCAPE '\\' LIMIT 1000")
        .all(`%${escaped}%`))
        accept(r, 0.5);
    }
    return {
      matches: [...ranked.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.trunc(max)),
      enabledSourceIds,
    };
  }
}
