import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { closeSync, mkdirSync, openSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { hostname } from "node:os";
import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type {
  KnowledgeBase,
  KnowledgeCapabilities,
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeDocumentSummary,
  KnowledgeJob,
  KnowledgePage,
  KnowledgePageInput,
  KnowledgeTextDocument,
} from "@mewvis/knowledge-sdk";
import type { PendingJob } from "../../types.js";
import { fail, hash, json, now } from "../../util.js";
import { tokens } from "../../ingestion/text.js";

export interface BaseRow {
  id: string;
  name: string;
  description: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  generation: number;
  embedding_signature: string | null;
  dimensions: number | null;
}
export interface DocumentRow {
  id: string;
  base_id: string;
  external_id: string | null;
  revision: string;
  input_json: string;
  summary_json: string;
  metadata_json: string;
}
export interface ChunkRow {
  id: string;
  data_json: string;
  summary_json: string;
  vector: Uint8Array | null;
  rank?: number;
}
export interface JobRow {
  id: string;
  base_id: string;
  kind: KnowledgeJob["kind"];
  state: KnowledgeJob["state"];
  job_json: string;
  payload_json: string;
  created_at: string;
}
const schema = `
CREATE TABLE kb_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE kb_bases(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,generation INTEGER NOT NULL DEFAULT 0,embedding_signature TEXT,dimensions INTEGER);
CREATE TABLE kb_documents(id TEXT PRIMARY KEY,base_id TEXT NOT NULL REFERENCES kb_bases(id) ON DELETE CASCADE,external_id TEXT,revision TEXT NOT NULL,input_json TEXT NOT NULL,summary_json TEXT NOT NULL,metadata_json TEXT NOT NULL,UNIQUE(base_id,external_id));
CREATE INDEX kb_documents_base ON kb_documents(base_id,id);
CREATE TABLE kb_chunks(id TEXT PRIMARY KEY,base_id TEXT NOT NULL REFERENCES kb_bases(id) ON DELETE CASCADE,document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,data_json TEXT NOT NULL,vector BLOB);
CREATE INDEX kb_chunks_base ON kb_chunks(base_id,id);
CREATE INDEX kb_chunks_document ON kb_chunks(document_id,id);
CREATE VIRTUAL TABLE kb_fts USING fts5(chunk_id UNINDEXED,base_id UNINDEXED,title_tokens,body_tokens);
CREATE TRIGGER kb_chunks_delete AFTER DELETE ON kb_chunks BEGIN DELETE FROM kb_fts WHERE chunk_id=old.id; END;
CREATE TABLE kb_jobs(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,base_id TEXT NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,job_json TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX kb_jobs_queue ON kb_jobs(state,created_at,id);
CREATE INDEX kb_jobs_base ON kb_jobs(base_id,id);
CREATE TABLE kb_receipts(subject_id TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,value_json TEXT NOT NULL,PRIMARY KEY(subject_id,key));
PRAGMA user_version=1;`;

/** A single owned database makes publishing documents, indexes and terminal jobs one atomic transaction. */
export class SqliteKnowledgeStore {
  readonly db: DatabaseSync;
  readonly serviceId: string;
  private readonly owner = randomUUID();
  private readonly cursorSecret: string;
  private owned = false;
  private closed = false;

  constructor(directory: string) {
    mkdirSync(resolve(directory), { recursive: true, mode: 0o700 });
    const filename = join(resolve(directory), "knowledge.sqlite");
    closeSync(openSync(filename, "a", 0o600));
    if (process.platform !== "win32") chmodSync(filename, 0o600);
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec(
        "PRAGMA foreign_keys=ON;PRAGMA busy_timeout=1000;PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;",
      );
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const version = this.one<{ user_version: number }>(
          "PRAGMA user_version",
        )!.user_version;
        if (version > 1)
          fail(
            "NOT_SUPPORTED",
            "Knowledge database schema is newer than this service",
          );
        if (version === 0) {
          if (
            this.one(
              "SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
            )
          )
            fail("CONFLICT", "Database is not an empty knowledge database");
          this.db.exec(schema);
          this.setMeta("service_id", randomUUID());
          this.setMeta("cursor_secret", randomBytes(32).toString("base64url"));
        }
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      this.serviceId =
        this.meta("service_id") ??
        fail("INTERNAL_ERROR", "Knowledge database identity is missing");
      this.cursorSecret =
        this.meta("cursor_secret") ??
        fail("INTERNAL_ERROR", "Knowledge database cursor key is missing");
      this.takeLease();
      this.transaction(() => {
        for (const row of this.all<JobRow>(
          "SELECT * FROM kb_jobs WHERE state IN ('running','cancelling')",
        )) {
          const job = json<KnowledgeJob>(row.job_json);
          this.saveJob({
            ...job,
            state: row.state === "cancelling" ? "cancelled" : "queued",
            progress: { ...job.progress, processed: 0, failed: 0, skipped: 0 },
            updatedAt: now(),
          });
        }
      });
    } catch (error) {
      this.release();
      this.db.close();
      throw error;
    }
  }
  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
  one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }
  run(sql: string, ...params: SQLInputValue[]) {
    return this.db.prepare(sql).run(...params);
  }
  private meta(key: string) {
    return this.one<{ value: string }>(
      "SELECT value FROM kb_meta WHERE key=?",
      key,
    )?.value;
  }
  private setMeta(key: string, value: string) {
    this.run(
      "INSERT INTO kb_meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      value,
    );
  }
  private takeLease() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.meta("lease_owner"),
        expires = Number(this.meta("lease_expires") ?? 0);
      let alive = true;
      if (this.meta("lease_host") === hostname()) {
        try {
          process.kill(Number(this.meta("lease_pid")), 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
        }
      }
      if (previous && expires > Date.now() && alive)
        fail(
          "CONFLICT",
          "Knowledge directory already has an active service instance",
        );
      this.setMeta("lease_owner", this.owner);
      this.setMeta("lease_pid", String(process.pid));
      this.setMeta("lease_host", hostname());
      this.setMeta("lease_expires", String(Date.now() + 30_000));
      this.db.exec("COMMIT");
      this.owned = true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  assertOwner() {
    if (this.closed || !this.owned || this.meta("lease_owner") !== this.owner)
      fail("UNAVAILABLE", "Knowledge storage ownership is unavailable");
  }
  heartbeat() {
    this.transaction(() =>
      this.setMeta("lease_expires", String(Date.now() + 30_000)),
    );
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.assertOwner();
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private release() {
    if (this.owned) {
      try {
        this.run(
          "DELETE FROM kb_meta WHERE key IN ('lease_owner','lease_expires','lease_pid','lease_host') AND EXISTS(SELECT 1 FROM kb_meta WHERE key='lease_owner' AND value=?)",
          this.owner,
        );
      } catch {
        /* Initialization may not have completed. */
      }
      this.owned = false;
    }
  }
  close() {
    if (!this.closed) {
      this.release();
      this.db.close();
      this.closed = true;
    }
  }

  base(id: string): BaseRow {
    return (
      this.one<BaseRow>("SELECT * FROM kb_bases WHERE id=?", id) ??
      fail("NOT_FOUND", "Knowledge base not found")
    );
  }
  document(baseId: string, id: string): DocumentRow {
    return (
      this.one<DocumentRow>(
        "SELECT * FROM kb_documents WHERE base_id=? AND id=?",
        baseId,
        id,
      ) ?? fail("NOT_FOUND", "Knowledge document not found")
    );
  }
  byExternalId(baseId: string, id?: string): DocumentRow | undefined {
    return id
      ? this.one<DocumentRow>(
          "SELECT * FROM kb_documents WHERE base_id=? AND external_id=?",
          baseId,
          id,
        )
      : undefined;
  }
  job(baseId: string, id: string): KnowledgeJob {
    const row = this.one<{ job_json: string }>(
      "SELECT job_json FROM kb_jobs WHERE base_id=? AND id=?",
      baseId,
      id,
    );
    return row
      ? json<KnowledgeJob>(row.job_json)
      : fail("NOT_FOUND", "Knowledge job not found");
  }
  saveJob(job: KnowledgeJob) {
    this.run(
      "UPDATE kb_jobs SET state=?,job_json=?,payload_json=CASE WHEN ? THEN '{}' ELSE payload_json END WHERE id=?",
      job.state,
      JSON.stringify(job),
      ["succeeded", "partially_succeeded", "failed", "cancelled"].includes(
        job.state,
      )
        ? 1
        : 0,
      job.id,
    );
  }
  enqueue(
    baseId: string,
    payload: PendingJob,
    total: number | null,
  ): KnowledgeJob {
    if (
      this.one<{ n: number }>(
        "SELECT COUNT(*) n FROM kb_jobs WHERE state IN ('queued','running','cancelling')",
      )!.n >= 1024
    )
      fail("RATE_LIMITED", "Knowledge task queue is full");
    const stamp = now(),
      job: KnowledgeJob = {
        id: randomUUID(),
        knowledgeBaseId: baseId,
        kind: payload.operation,
        state: "queued",
        progress: { total, processed: 0, failed: 0, skipped: 0 },
        createdAt: stamp,
        updatedAt: stamp,
      };
    this.run(
      "INSERT INTO kb_jobs(id,base_id,kind,state,job_json,payload_json,created_at) VALUES(?,?,?,?,?,?,?)",
      job.id,
      baseId,
      job.kind,
      job.state,
      JSON.stringify(job),
      JSON.stringify(payload),
      stamp,
    );
    return job;
  }
  claim(): { job: KnowledgeJob; payload: PendingJob } | undefined {
    return this.transaction(() => {
      const row = this.one<JobRow>(
        "SELECT * FROM kb_jobs WHERE state='queued' ORDER BY seq LIMIT 1",
      );
      if (!row) return undefined;
      const job = {
        ...json<KnowledgeJob>(row.job_json),
        state: "running" as const,
        updatedAt: now(),
      };
      this.saveJob(job);
      return { job, payload: json<PendingJob>(row.payload_json) };
    });
  }
  receipt<T>(
    subjectId: string,
    key: string | undefined,
    fingerprint: string,
    work: () => T,
  ): T {
    return this.transaction(() => {
      if (key) {
        const row = this.one<{ fingerprint: string; value_json: string }>(
          "SELECT * FROM kb_receipts WHERE subject_id=? AND key=?",
          subjectId,
          key,
        );
        if (row) {
          if (row.fingerprint !== fingerprint)
            fail(
              "CONFLICT",
              "Idempotency key was used for a different operation",
            );
          return json<T>(row.value_json);
        }
      }
      const value = work();
      if (key)
        this.run(
          "INSERT INTO kb_receipts VALUES(?,?,?,?)",
          subjectId,
          key,
          fingerprint,
          JSON.stringify(value),
        );
      return value;
    });
  }
  page<T>(
    table: "kb_bases" | "kb_documents" | "kb_chunks" | "kb_jobs",
    where: string,
    params: SQLInputValue[],
    input: KnowledgePageInput,
    scope: unknown,
    map: (row: Record<string, unknown>) => T,
  ): KnowledgePage<T> {
    const limit = input.limit ?? 20;
    if (limit > 100) fail("INVALID_ARGUMENT", "Page size exceeds 100");
    const scopeHash = hash(scope);
    let after = "";
    if (input.cursor) {
      try {
        const [body, signature, extra] = input.cursor.split(".");
        if (!body || !signature || extra) throw new Error();
        const actual = Buffer.from(signature, "base64url"),
          expected = createHmac("sha256", this.cursorSecret)
            .update(body)
            .digest();
        if (
          actual.length !== expected.length ||
          !timingSafeEqual(actual, expected)
        )
          throw new Error();
        const decoded = json<{ scope: string; after: string }>(
          Buffer.from(body, "base64url").toString("utf8"),
        );
        if (decoded.scope !== scopeHash || typeof decoded.after !== "string")
          throw new Error();
        after = decoded.after;
      } catch {
        fail(
          "INVALID_ARGUMENT",
          "Cursor does not belong to this operation or access scope",
        );
      }
    }
    const columns =
      table === "kb_documents"
        ? "id,summary_json"
        : table === "kb_chunks"
          ? "id,data_json"
          : table === "kb_jobs"
            ? "id,job_json"
            : "*";
    const rows = this.all<Record<string, unknown>>(
      `SELECT ${columns} FROM ${table} WHERE (${where}) AND id>? ORDER BY id LIMIT ?`,
      ...params,
      after,
      limit + 1,
    );
    const more = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    let nextCursor: string | null = null;
    if (more) {
      const body = Buffer.from(
        JSON.stringify({ scope: scopeHash, after: pageRows.at(-1)!.id }),
      ).toString("base64url");
      nextCursor = `${body}.${createHmac("sha256", this.cursorSecret).update(body).digest("base64url")}`;
    }
    return { items: pageRows.map(map), nextCursor };
  }
  baseValue(
    row: BaseRow,
    capabilities: KnowledgeCapabilities,
    signature: string | null,
  ): KnowledgeBase {
    const counts = this.one<{ docs: number; chunks: number }>(
      "SELECT (SELECT COUNT(*) FROM kb_documents WHERE base_id=?) docs,(SELECT COUNT(*) FROM kb_chunks WHERE base_id=?) chunks",
      row.id,
      row.id,
    )!;
    const active = this.one(
      "SELECT 1 FROM kb_jobs WHERE base_id=? AND state IN ('queued','running','cancelling') LIMIT 1",
      row.id,
    );
    return {
      id: row.id,
      name: row.name,
      ...(row.description !== null ? { description: row.description } : {}),
      metadata: json(row.metadata_json),
      state: active
        ? "indexing"
        : counts.docs === 0
          ? "empty"
          : row.embedding_signature !== signature
            ? "degraded"
            : "ready",
      documentCount: counts.docs,
      chunkCount: counts.chunks,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      capabilities,
    };
  }
  documentValue(row: DocumentRow): KnowledgeDocument {
    const input = json<KnowledgeTextDocument>(row.input_json);
    return {
      ...json<KnowledgeDocumentSummary>(row.summary_json),
      text: input.text,
      ...(input.locations ? { locations: input.locations } : {}),
    };
  }
  chunkValue(row: { data_json: string; summary_json: string }): KnowledgeChunk {
    const summary = json<KnowledgeDocumentSummary>(row.summary_json);
    return {
      ...json<KnowledgeChunk>(row.data_json),
      title: summary.title,
      ...(summary.source ? { source: summary.source } : {}),
      ...(summary.metadata ? { metadata: summary.metadata } : {}),
    };
  }
  putDocument(
    baseId: string,
    id: string,
    input: KnowledgeTextDocument,
    revision: string,
    chunks: readonly KnowledgeChunk[],
    vectors: readonly (Uint8Array | null)[],
  ) {
    const previous = this.one<{ summary_json: string }>(
      "SELECT summary_json FROM kb_documents WHERE id=? AND base_id=?",
      id,
      baseId,
    );
    const stamp = now(),
      old = previous
        ? json<KnowledgeDocumentSummary>(previous.summary_json)
        : undefined;
    const { text: _text, locations: _locations, ...details } = input;
    const summary: KnowledgeDocumentSummary = {
      ...details,
      id,
      knowledgeBaseId: baseId,
      state: "ready",
      revision,
      chunkCount: chunks.length,
      createdAt: old?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    this.run("DELETE FROM kb_chunks WHERE document_id=?", id);
    this.run(
      "INSERT INTO kb_documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET external_id=excluded.external_id,revision=excluded.revision,input_json=excluded.input_json,summary_json=excluded.summary_json,metadata_json=excluded.metadata_json",
      id,
      baseId,
      input.externalId ?? null,
      revision,
      JSON.stringify(input),
      JSON.stringify(summary),
      JSON.stringify(input.metadata ?? {}),
    );
    for (const [i, chunk] of chunks.entries()) {
      const {
        title: _title,
        source: _source,
        metadata: _metadata,
        ...stored
      } = chunk;
      this.run(
        "INSERT INTO kb_chunks VALUES(?,?,?,?,?)",
        chunk.id,
        baseId,
        id,
        JSON.stringify(stored),
        vectors[i] ?? null,
      );
      this.run(
        "INSERT INTO kb_fts VALUES(?,?,?,?)",
        chunk.id,
        baseId,
        tokens(chunk.title).join(" "),
        tokens(chunk.text).join(" "),
      );
    }
  }
  publish(baseId: string, signature: string | null, dimensions: number | null) {
    this.run(
      "UPDATE kb_bases SET generation=generation+1,updated_at=?,embedding_signature=?,dimensions=? WHERE id=?",
      now(),
      signature,
      dimensions,
      baseId,
    );
  }
}
