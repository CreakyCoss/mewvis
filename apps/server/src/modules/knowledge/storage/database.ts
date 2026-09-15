import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { load } from "sqlite-vec";
import { ragSchema, vectorSchema } from "./schema.js";

export const textHash = (text: string) => {
  let value = 2166136261;
  for (const byte of Buffer.from(text))
    value = Math.imul(value ^ byte, 16777619) >>> 0;
  return value.toString(16).padStart(8, "0");
};
export const vectorTable = (id: string) =>
  "rag_vec_profile_" + Buffer.from(id).toString("hex");
export const chunkSelect =
  "SELECT c.*, d.path, d.title FROM rag_chunks c JOIN rag_documents d ON d.id=c.document_id";

/** The same FTS5/vec0 database that Rust reads and writes. No backend-specific index. */
export class RagDatabase {
  readonly db: DatabaseSync;
  constructor(dataDir: string) {
    mkdirSync(join(dataDir, "rag"), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, "rag", "index.sqlite"), {
      allowExtension: true,
    });
    try {
      load(this.db);
      this.db.enableLoadExtension(false);
      this.db.exec("PRAGMA busy_timeout=100");
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(ragSchema);
        const cols = this.db
          .prepare("PRAGMA table_info(rag_vector_state)")
          .all()
          .map((c) => c.name);
        if (
          cols.length &&
          ["profile_id", "model_id", "table_name"].some(
            (c) => !cols.includes(c),
          )
        ) {
          this.db.exec(
            "DROP TABLE IF EXISTS rag_vec_chunks; DROP TABLE IF EXISTS rag_vector_entries; DROP TABLE rag_vector_state; DELETE FROM rag_embeddings",
          );
        }
        this.db.exec(vectorSchema);
        this.status();
        this.db
          .prepare(
            "UPDATE rag_index_state SET status='stale',source_fingerprint=NULL,updated_at=? WHERE (version<>3 AND status='ready') OR status='building'",
          )
          .run(Date.now());
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  status(id = "global"): any {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO rag_index_state(id,version,status,updated_at) VALUES(?,3,'missing',?)",
      )
      .run(id, Date.now());
    const r = this.db
      .prepare("SELECT * FROM rag_index_state WHERE id=?")
      .get(id)!;
    return {
      indexId: r.id,
      version: r.version,
      status: r.status,
      updatedAt: r.updated_at,
      sourceFingerprint: r.source_fingerprint,
      documentCount: r.document_count,
      chunkCount: r.chunk_count,
      error: r.error,
    };
  }
  saveStatus(s: any) {
    this.db
      .prepare(
        `INSERT INTO rag_index_state(id,version,status,source_fingerprint,document_count,chunk_count,error,updated_at)
      VALUES(?,3,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,status=excluded.status,
      source_fingerprint=excluded.source_fingerprint,document_count=excluded.document_count,chunk_count=excluded.chunk_count,error=excluded.error,updated_at=excluded.updated_at`,
      )
      .run(
        s.indexId,
        s.status,
        s.sourceFingerprint,
        s.documentCount,
        s.chunkCount,
        s.error,
        s.updatedAt,
      );
  }
  tableExists(name: string) {
    return !!this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(name);
  }
  clearSource(id: string) {
    for (const e of this.db
      .prepare(
        "SELECT rowid,embedding_profile_id FROM rag_vector_entries WHERE source_id=?",
      )
      .all(id)) {
      const table = vectorTable(String(e.embedding_profile_id));
      if (this.tableExists(table))
        this.db
          .prepare(`DELETE FROM ${table} WHERE rowid=?`)
          .run(BigInt(String(e.rowid)));
    }
    this.db.prepare("DELETE FROM rag_vector_entries WHERE source_id=?").run(id);
    this.db
      .prepare(
        "DELETE FROM rag_embeddings WHERE chunk_id IN(SELECT id FROM rag_chunks WHERE source_id=?)",
      )
      .run(id);
    for (const table of [
      "rag_chunks_fts",
      "rag_chunks",
      "rag_documents",
      "rag_source_state",
    ])
      this.db.prepare(`DELETE FROM ${table} WHERE source_id=?`).run(id);
  }
  ensureProfile(p: any) {
    const table = vectorTable(p.id),
      state = this.db
        .prepare("SELECT * FROM rag_vector_state WHERE profile_id=?")
        .get(p.id);
    if (
      state?.model_id === p.modelId &&
      state?.dimensions === p.dimensions &&
      state?.table_name === table &&
      this.tableExists(table)
    )
      return;
    const old = String(state?.table_name ?? table);
    if (
      /^rag_vec_profile_(?:[a-fA-F0-9]{2})+$/.test(old) ||
      old === "rag_vec_chunks"
    )
      this.db.exec(`DROP TABLE IF EXISTS ${old}`);
    this.db
      .prepare("DELETE FROM rag_vector_entries WHERE embedding_profile_id=?")
      .run(p.id);
    this.db
      .prepare("DELETE FROM rag_embeddings WHERE embedding_profile_id=?")
      .run(p.id);
    if (!Number.isSafeInteger(p.dimensions) || p.dimensions <= 0)
      throw new Error("Embedding 维度无效");
    this.db.exec(
      `CREATE VIRTUAL TABLE ${table} USING vec0(source_id TEXT,chunk_id TEXT,embedding float[${p.dimensions}] distance_metric=cosine)`,
    );
    this.db
      .prepare(
        `INSERT INTO rag_vector_state(profile_id,model_id,table_name,backend,dimensions,updated_at) VALUES(?,?,?,'sqlite-vec',?,?)
      ON CONFLICT(profile_id) DO UPDATE SET model_id=excluded.model_id,table_name=excluded.table_name,backend=excluded.backend,dimensions=excluded.dimensions,updated_at=excluded.updated_at`,
      )
      .run(p.id, p.modelId, table, p.dimensions, Date.now());
  }
  putVector(p: any, c: any) {
    const vector = c.vector.map(Math.fround) as number[],
      blob = Buffer.alloc(vector.length * 4);
    vector.forEach((n, i) => blob.writeFloatLE(n, i * 4));
    this.db
      .prepare(
        `INSERT OR REPLACE INTO rag_embeddings(chunk_id,embedding_profile_id,model_id,dimensions,vector,vector_norm,created_at) VALUES(?,?,?,?,?,?,?)`,
      )
      .run(
        c.id,
        p.id,
        p.modelId,
        p.dimensions,
        blob,
        Math.hypot(...vector),
        Date.now(),
      );
    this.db
      .prepare(
        `INSERT INTO rag_vector_entries(chunk_id,source_id,embedding_profile_id,model_id,backend,dimensions,created_at) VALUES(?,?,?,?,'sqlite-vec',?,?)
      ON CONFLICT(chunk_id,embedding_profile_id,model_id) DO UPDATE SET source_id=excluded.source_id,backend=excluded.backend,dimensions=excluded.dimensions,created_at=excluded.created_at`,
      )
      .run(c.id, c.sourceId, p.id, p.modelId, p.dimensions, Date.now());
    const row = this.db
      .prepare(
        "SELECT rowid FROM rag_vector_entries WHERE chunk_id=? AND embedding_profile_id=? AND model_id=?",
      )
      .get(c.id, p.id, p.modelId)!;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ${vectorTable(p.id)}(rowid,source_id,chunk_id,embedding) VALUES(?,?,?,?)`,
      )
      .run(BigInt(String(row.rowid)), c.sourceId, c.id, JSON.stringify(vector));
  }
  vectorSearch(p: any, vector: number[], sources: string[], max: number) {
    const table = vectorTable(p.id),
      state = this.db
        .prepare("SELECT * FROM rag_vector_state WHERE profile_id=?")
        .get(p.id);
    if (
      !sources.length ||
      state?.model_id !== p.modelId ||
      state?.dimensions !== vector.length ||
      state?.table_name !== table ||
      !this.tableExists(table)
    )
      return [];
    return this.db
      .prepare(
        `WITH nearest AS(SELECT rowid,distance FROM ${table} WHERE embedding MATCH ? AND k=?)
      SELECT c.*,d.path,d.title,nearest.distance FROM nearest JOIN rag_vector_entries e ON e.rowid=nearest.rowid
      JOIN rag_chunks c ON c.id=e.chunk_id JOIN rag_documents d ON d.id=c.document_id
      WHERE e.embedding_profile_id=? AND e.model_id=? AND e.source_id IN (${sources.map(() => "?").join(",")}) ORDER BY nearest.distance ASC LIMIT ?`,
      )
      .all(
        JSON.stringify(vector.map(Math.fround)),
        BigInt(Math.min(max * 40, 800)),
        p.id,
        p.modelId,
        ...sources,
        max,
      );
  }
}
