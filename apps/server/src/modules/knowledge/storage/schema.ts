// Matches Rust knowledge.rs and vector_store.rs; checked by interoperability tests.
export const ragSchema = `CREATE TABLE IF NOT EXISTS rag_index_state (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    status TEXT NOT NULL,
    source_fingerprint TEXT,
    document_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rag_source_state (
    source_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    document_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    content_fingerprint TEXT,
    error TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    path TEXT,
    title TEXT,
    mime TEXT,
    size_bytes INTEGER,
    modified_at INTEGER,
    content_hash TEXT NOT NULL,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    char_start INTEGER,
    char_end INTEGER,
    line_start INTEGER,
    line_end INTEGER,
    content_hash TEXT NOT NULL,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS rag_embeddings (
    chunk_id TEXT NOT NULL,
    embedding_profile_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    vector BLOB NOT NULL,
    vector_norm REAL NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(chunk_id, embedding_profile_id, model_id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts
USING fts5(chunk_id UNINDEXED, source_id UNINDEXED, title, path, content);

CREATE TABLE IF NOT EXISTS rag_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0,
    source_ids_json TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);`;
export const vectorSchema = `CREATE TABLE IF NOT EXISTS rag_vector_entries (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    chunk_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    embedding_profile_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    backend TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(chunk_id, embedding_profile_id, model_id)
);

CREATE TABLE IF NOT EXISTS rag_vector_state (
    profile_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    table_name TEXT NOT NULL UNIQUE,
    backend TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);`;
