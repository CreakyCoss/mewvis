use rusqlite::{params, params_from_iter, Connection};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

use crate::db::{
    config_db::{self, KnowledgeLibrary, KnowledgeSource, SaveKnowledgeSourceInput},
    id::new_record_id,
    paths::rag_index_db_path,
};
use crate::services::{
    embeddings::{self, ResolvedEmbeddingProfile},
    vector_store::{self, VectorEmbedding},
};

const INDEX_ID: &str = "global";
const INDEX_VERSION: i64 = 1;
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
const CHUNK_TARGET_CHARS: usize = 1200;
const CHUNK_OVERLAP_CHARS: usize = 160;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeIndexStatus {
    pub index_id: String,
    pub version: i64,
    pub status: String,
    pub updated_at: Option<i64>,
    pub source_fingerprint: Option<String>,
    pub document_count: i64,
    pub chunk_count: i64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildKnowledgeIndexResult {
    pub status: KnowledgeIndexStatus,
    pub source_results: Vec<KnowledgeSourceIndexResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSourceIndexResult {
    pub source_id: String,
    pub status: String,
    pub document_count: i64,
    pub chunk_count: i64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchMatch {
    pub id: String,
    pub source_id: String,
    pub chunk_id: Option<String>,
    pub source_type: String,
    pub content: String,
    pub path: Option<String>,
    pub title: Option<String>,
    pub score: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResult {
    pub matches: Vec<KnowledgeSearchMatch>,
    pub enabled_source_ids: Vec<String>,
}

struct IndexedDocument {
    path: Option<String>,
    title: String,
    content: String,
    size_bytes: i64,
    modified_at: Option<i64>,
}

struct DocumentChunk {
    index: usize,
    content: String,
    char_start: usize,
    char_end: usize,
}

#[derive(Debug, Clone)]
struct IndexedChunkForEmbedding {
    source_id: String,
    chunk_id: String,
    content: String,
}

struct IndexSourceOutcome {
    document_count: i64,
    chunk_count: i64,
    chunks: Vec<IndexedChunkForEmbedding>,
}

pub fn knowledge_index_status(app: &AppHandle) -> Result<KnowledgeIndexStatus, String> {
    let conn = open_index_connection(app)?;
    load_index_status(&conn)
}

pub fn mark_knowledge_index_stale(app: &AppHandle) -> Result<(), String> {
    let conn = open_index_connection(app)?;
    let (document_count, chunk_count) = index_counts(&conn)?;
    set_index_status(&conn, "stale", None, None, document_count, chunk_count)
}

pub fn delete_source_index(app: &AppHandle, source_id: &str) -> Result<(), String> {
    let conn = open_index_connection(app)?;
    clear_source_index(&conn, source_id)?;
    let (document_count, chunk_count) = index_counts(&conn)?;
    set_index_status(&conn, "stale", None, None, document_count, chunk_count)
}

pub fn import_knowledge_files(
    app: &AppHandle,
    paths: Vec<String>,
) -> Result<KnowledgeLibrary, String> {
    let settings = config_db::knowledge_settings(app)?;
    let storage_directory = settings
        .storage_directory
        .ok_or_else(|| "请先设置知识库目录".to_string())?;
    let storage_dir = PathBuf::from(storage_directory)
        .canonicalize()
        .map_err(|error| format!("无法定位知识库目录：{error}"))?;
    if !storage_dir.is_dir() {
        return Err("知识库目录不存在".to_string());
    }

    let source_paths = normalize_import_paths(paths)?;
    if source_paths.is_empty() {
        return config_db::knowledge_library(app);
    }

    let mut library = config_db::knowledge_library(app)?;
    for source_path in source_paths {
        let imported_path = import_knowledge_file(&storage_dir, &source_path)?;
        let title = imported_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("untitled")
            .to_string();
        library = config_db::save_knowledge_source(
            app,
            SaveKnowledgeSourceInput {
                id: None,
                kind: "file".to_string(),
                uri: imported_path.to_string_lossy().to_string(),
                title,
                description: None,
                enabled: true,
                include_patterns_json: None,
                exclude_patterns_json: None,
                metadata_json: Some(r#"{"imported":true}"#.to_string()),
            },
        )?;
    }

    mark_knowledge_index_stale(app)?;
    Ok(library)
}

pub fn rebuild_knowledge_index(
    app: &AppHandle,
    source_ids: Option<Vec<String>>,
) -> Result<RebuildKnowledgeIndexResult, String> {
    let library = config_db::knowledge_library(app)?;
    let selected_source_ids = source_ids.map(normalize_ids).filter(|ids| !ids.is_empty());
    let sources = library
        .sources
        .into_iter()
        .filter(|source| source.enabled)
        .filter(|source| match &selected_source_ids {
            Some(ids) => ids.contains(&source.id),
            None => true,
        })
        .collect::<Vec<_>>();

    let mut conn = open_index_connection(app)?;
    set_index_status(&conn, "building", None, None, 0, 0)?;

    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始重建知识库索引：{error}"))?;
    if selected_source_ids.is_none() {
        clear_all_index(&tx)?;
    } else if let Some(ids) = &selected_source_ids {
        for source_id in ids {
            clear_source_index(&tx, source_id)?;
        }
    }

    let mut source_results = Vec::new();
    let mut total_documents = 0;
    let mut total_chunks = 0;
    let mut chunks_for_embedding = Vec::new();
    let mut errors = Vec::new();

    for source in sources {
        match index_source(&tx, &source) {
            Ok(outcome) => {
                let document_count = outcome.document_count;
                let chunk_count = outcome.chunk_count;
                total_documents += document_count;
                total_chunks += chunk_count;
                chunks_for_embedding.extend(outcome.chunks);
                set_source_status(&tx, &source.id, "ready", document_count, chunk_count, None)?;
                source_results.push(KnowledgeSourceIndexResult {
                    source_id: source.id,
                    status: "ready".to_string(),
                    document_count,
                    chunk_count,
                    error: None,
                });
            }
            Err(error) => {
                errors.push(format!("{}: {error}", source.title));
                set_source_status(&tx, &source.id, "error", 0, 0, Some(&error))?;
                source_results.push(KnowledgeSourceIndexResult {
                    source_id: source.id,
                    status: "error".to_string(),
                    document_count: 0,
                    chunk_count: 0,
                    error: Some(error),
                });
            }
        }
    }

    let (document_count, chunk_count) = index_counts(&tx)?;
    let fingerprint = source_fingerprint(&source_results);
    let status = if errors.is_empty() { "ready" } else { "error" };
    set_index_status(
        &tx,
        status,
        Some(&fingerprint),
        (!errors.is_empty()).then(|| errors.join("\n")).as_deref(),
        document_count,
        chunk_count,
    )?;
    tx.commit()
        .map_err(|error| format!("无法提交知识库索引：{error}"))?;

    if errors.is_empty() {
        if let Err(error) = rebuild_vector_index(app, &mut conn, &chunks_for_embedding) {
            errors.push(format!("向量索引：{error}"));
            let (document_count, chunk_count) = index_counts(&conn)?;
            set_index_status(
                &conn,
                "ready",
                Some(&fingerprint),
                Some(&errors.join("\n")),
                document_count,
                chunk_count,
            )?;
        }
    }

    let status = knowledge_index_status(app)?;
    if status.document_count == 0 && total_documents > 0 {
        return Err("知识库索引重建后未能读取文档计数".to_string());
    }
    if status.chunk_count == 0 && total_chunks > 0 {
        return Err("知识库索引重建后未能读取 chunk 计数".to_string());
    }

    Ok(RebuildKnowledgeIndexResult {
        status,
        source_results,
    })
}

pub fn search_enabled_knowledge(
    app: &AppHandle,
    _workspace_id: &str,
    query: &str,
    max_results: usize,
    min_score: f64,
) -> Result<KnowledgeSearchResult, String> {
    let enabled_source_ids = config_db::enabled_knowledge_source_ids(app)?;
    if query.trim().is_empty() || enabled_source_ids.is_empty() {
        return Ok(KnowledgeSearchResult {
            matches: Vec::new(),
            enabled_source_ids,
        });
    }

    let conn = open_index_connection(app)?;
    let status = load_index_status(&conn)?;
    if status.status != "ready" {
        return Ok(KnowledgeSearchResult {
            matches: Vec::new(),
            enabled_source_ids,
        });
    }
    let max_results = max_results.clamp(1, 20);
    let fts_matches = search_fts(&conn, &enabled_source_ids, query, max_results, min_score)?;
    let vector_matches = search_vector(app, &conn, &enabled_source_ids, query, max_results)
        .unwrap_or_else(|_| Vec::new());
    let mut matches = merge_search_matches(fts_matches, vector_matches, max_results, min_score);

    if matches.is_empty() {
        matches = search_like(&conn, &enabled_source_ids, query, max_results, min_score)?;
    }

    Ok(KnowledgeSearchResult {
        matches,
        enabled_source_ids,
    })
}

fn open_index_connection(app: &AppHandle) -> Result<Connection, String> {
    let vector_store = vector_store::default_vector_store();
    vector_store.register();
    let db_path = rag_index_db_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建知识库索引目录：{error}"))?;
    }

    let conn = Connection::open(db_path).map_err(|error| format!("无法打开知识库索引：{error}"))?;
    initialize_index_schema(&conn)?;
    Ok(conn)
}

fn initialize_index_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS rag_index_state (
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
        );
        "#,
    )
    .map_err(|error| format!("无法初始化知识库索引结构：{error}"))?;
    vector_store::initialize_vector_metadata_schema(conn)?;

    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO rag_index_state (
            id, version, status, source_fingerprint, document_count, chunk_count, error, updated_at
        ) VALUES (?1, ?2, 'missing', NULL, 0, 0, NULL, ?3)
        ON CONFLICT(id) DO NOTHING
        "#,
        params![INDEX_ID, INDEX_VERSION, now],
    )
    .map_err(|error| format!("无法初始化知识库索引状态：{error}"))?;

    Ok(())
}

fn load_index_status(conn: &Connection) -> Result<KnowledgeIndexStatus, String> {
    conn.query_row(
        r#"
        SELECT id, version, status, updated_at, source_fingerprint, document_count, chunk_count, error
        FROM rag_index_state
        WHERE id = ?1
        "#,
        params![INDEX_ID],
        |row| {
            Ok(KnowledgeIndexStatus {
                index_id: row.get(0)?,
                version: row.get(1)?,
                status: row.get(2)?,
                updated_at: row.get(3)?,
                source_fingerprint: row.get(4)?,
                document_count: row.get(5)?,
                chunk_count: row.get(6)?,
                error: row.get(7)?,
            })
        },
    )
    .map_err(|error| format!("无法读取知识库索引状态：{error}"))
}

fn set_index_status(
    conn: &Connection,
    status: &str,
    source_fingerprint: Option<&str>,
    error: Option<&str>,
    document_count: i64,
    chunk_count: i64,
) -> Result<(), String> {
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO rag_index_state (
            id, version, status, source_fingerprint, document_count, chunk_count, error, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET
            version = excluded.version,
            status = excluded.status,
            source_fingerprint = excluded.source_fingerprint,
            document_count = excluded.document_count,
            chunk_count = excluded.chunk_count,
            error = excluded.error,
            updated_at = excluded.updated_at
        "#,
        params![
            INDEX_ID,
            INDEX_VERSION,
            status,
            source_fingerprint,
            document_count,
            chunk_count,
            error,
            now
        ],
    )
    .map_err(|error| format!("无法保存知识库索引状态：{error}"))?;
    Ok(())
}

fn set_source_status(
    conn: &Connection,
    source_id: &str,
    status: &str,
    document_count: i64,
    chunk_count: i64,
    error: Option<&str>,
) -> Result<(), String> {
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO rag_source_state (
            source_id, status, document_count, chunk_count, content_fingerprint, error, updated_at
        ) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6)
        ON CONFLICT(source_id) DO UPDATE SET
            status = excluded.status,
            document_count = excluded.document_count,
            chunk_count = excluded.chunk_count,
            error = excluded.error,
            updated_at = excluded.updated_at
        "#,
        params![source_id, status, document_count, chunk_count, error, now],
    )
    .map_err(|error| format!("无法保存知识源索引状态：{error}"))?;
    Ok(())
}

fn clear_all_index(conn: &Connection) -> Result<(), String> {
    vector_store::default_vector_store().clear_all(conn)?;
    conn.execute("DELETE FROM rag_chunks_fts", [])
        .map_err(|error| format!("无法清空知识库 FTS：{error}"))?;
    conn.execute("DELETE FROM rag_embeddings", [])
        .map_err(|error| format!("无法清空知识库向量：{error}"))?;
    conn.execute("DELETE FROM rag_chunks", [])
        .map_err(|error| format!("无法清空知识库 chunk：{error}"))?;
    conn.execute("DELETE FROM rag_documents", [])
        .map_err(|error| format!("无法清空知识库文档：{error}"))?;
    conn.execute("DELETE FROM rag_source_state", [])
        .map_err(|error| format!("无法清空知识源索引状态：{error}"))?;
    Ok(())
}

fn clear_source_index(conn: &Connection, source_id: &str) -> Result<(), String> {
    vector_store::default_vector_store().clear_source(conn, source_id)?;
    conn.execute(
        "DELETE FROM rag_chunks_fts WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|error| format!("无法清空知识源 FTS：{error}"))?;
    conn.execute(
        r#"
        DELETE FROM rag_embeddings
        WHERE chunk_id IN (SELECT id FROM rag_chunks WHERE source_id = ?1)
        "#,
        params![source_id],
    )
    .map_err(|error| format!("无法清空知识源向量：{error}"))?;
    conn.execute(
        "DELETE FROM rag_chunks WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|error| format!("无法清空知识源 chunk：{error}"))?;
    conn.execute(
        "DELETE FROM rag_documents WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|error| format!("无法清空知识源文档：{error}"))?;
    conn.execute(
        "DELETE FROM rag_source_state WHERE source_id = ?1",
        params![source_id],
    )
    .map_err(|error| format!("无法清空知识源索引状态：{error}"))?;
    Ok(())
}

fn index_source(conn: &Connection, source: &KnowledgeSource) -> Result<IndexSourceOutcome, String> {
    clear_source_index(conn, &source.id)?;
    let documents = discover_source_documents(source)?;
    if documents.is_empty() {
        return Ok(IndexSourceOutcome {
            document_count: 0,
            chunk_count: 0,
            chunks: Vec::new(),
        });
    }

    let now = now_millis()?;
    let mut document_count = 0;
    let mut chunk_count = 0;
    let mut chunks_for_embedding = Vec::new();

    for document in documents {
        let document_id = new_record_id();
        let content_hash = hash_string(&document.content);
        conn.execute(
            r#"
            INSERT INTO rag_documents (
                id, source_id, path, title, mime, size_bytes, modified_at,
                content_hash, metadata_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, 'text/plain', ?5, ?6, ?7, NULL, ?8, ?9)
            "#,
            params![
                document_id,
                source.id,
                document.path,
                document.title,
                document.size_bytes,
                document.modified_at,
                content_hash,
                now,
                now
            ],
        )
        .map_err(|error| format!("无法写入知识库文档：{error}"))?;
        document_count += 1;

        for chunk in chunk_document(&document.content) {
            let chunk_id = new_record_id();
            conn.execute(
                r#"
                INSERT INTO rag_chunks (
                    id, source_id, document_id, chunk_index, content, token_count,
                    char_start, char_end, line_start, line_end, content_hash, metadata_json,
                    created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?9, NULL, ?10)
                "#,
                params![
                    chunk_id,
                    source.id,
                    document_id,
                    chunk.index as i64,
                    chunk.content,
                    estimate_tokens(&chunk.content),
                    chunk.char_start as i64,
                    chunk.char_end as i64,
                    hash_string(&chunk.content),
                    now
                ],
            )
            .map_err(|error| format!("无法写入知识库 chunk：{error}"))?;
            conn.execute(
                r#"
                INSERT INTO rag_chunks_fts (chunk_id, source_id, title, path, content)
                VALUES (?1, ?2, ?3, ?4, ?5)
                "#,
                params![
                    chunk_id,
                    source.id,
                    document.title,
                    document.path,
                    chunk.content
                ],
            )
            .map_err(|error| format!("无法写入知识库 FTS：{error}"))?;
            chunks_for_embedding.push(IndexedChunkForEmbedding {
                source_id: source.id.clone(),
                chunk_id,
                content: chunk.content,
            });
            chunk_count += 1;
        }
    }

    Ok(IndexSourceOutcome {
        document_count,
        chunk_count,
        chunks: chunks_for_embedding,
    })
}

fn rebuild_vector_index(
    app: &AppHandle,
    conn: &mut Connection,
    chunks: &[IndexedChunkForEmbedding],
) -> Result<(), String> {
    let Some(profile) = embeddings::resolve_default_embedding_profile(app)? else {
        return Ok(());
    };
    if chunks.is_empty() {
        return Ok(());
    }

    let vector_store = vector_store::default_vector_store();
    vector_store.ensure_schema(conn, profile.profile.dimensions)?;
    let embedding_provider = embeddings::default_embedding_provider()?;
    let batch_size = effective_embedding_batch_size(&profile);

    for batch in chunks.chunks(batch_size) {
        let texts = batch
            .iter()
            .map(|chunk| chunk.content.clone())
            .collect::<Vec<_>>();
        let vectors = embedding_provider.embed_texts(&profile, &texts)?;
        let embeddings = batch
            .iter()
            .zip(vectors)
            .map(|(chunk, vector)| vector_embedding_from_chunk(&profile, chunk, vector))
            .collect::<Vec<_>>();
        let tx = conn
            .transaction()
            .map_err(|error| format!("无法开始写入向量索引：{error}"))?;
        vector_store.insert_embeddings(&tx, &embeddings)?;
        tx.commit()
            .map_err(|error| format!("无法提交向量索引：{error}"))?;
    }

    Ok(())
}

fn vector_embedding_from_chunk(
    profile: &ResolvedEmbeddingProfile,
    chunk: &IndexedChunkForEmbedding,
    vector: Vec<f32>,
) -> VectorEmbedding {
    VectorEmbedding {
        chunk_id: chunk.chunk_id.clone(),
        source_id: chunk.source_id.clone(),
        model_id: profile.profile.model_id.clone(),
        embedding_profile_id: profile.profile.id.clone(),
        dimensions: profile.profile.dimensions,
        vector,
    }
}

fn effective_embedding_batch_size(profile: &ResolvedEmbeddingProfile) -> usize {
    if profile.profile.provider_kind == "ollama" {
        return 1;
    }

    profile.profile.batch_size.clamp(1, 256) as usize
}

fn discover_source_documents(source: &KnowledgeSource) -> Result<Vec<IndexedDocument>, String> {
    match source.kind.as_str() {
        "file" => read_indexable_file(Path::new(&source.uri))
            .map(|document| document.into_iter().collect()),
        "directory" => discover_directory_documents(Path::new(&source.uri)),
        "manual" => Err("暂不支持手写知识源索引".to_string()),
        _ => Err("知识源类型不支持索引".to_string()),
    }
}

fn discover_directory_documents(root: &Path) -> Result<Vec<IndexedDocument>, String> {
    if !root.is_dir() {
        return Err("知识源目录不存在".to_string());
    }

    let mut documents = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path)
            .map_err(|error| format!("无法读取知识源目录 {}：{error}", path.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("无法读取知识源目录项：{error}"))?;
            let path = entry.path();
            if should_skip_path(&path) {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
            } else if let Some(document) = read_indexable_file(&path)? {
                documents.push(document);
            }
        }
    }

    documents.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(documents)
}

fn read_indexable_file(path: &Path) -> Result<Option<IndexedDocument>, String> {
    if should_skip_path(path) || !is_supported_text_path(path) {
        return Ok(None);
    }

    let metadata = fs::metadata(path)
        .map_err(|error| format!("无法读取知识源文件 {}：{error}", path.display()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Ok(None);
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("无法读取知识源文本 {}：{error}", path.display()))?;
    if content.trim().is_empty() {
        return Ok(None);
    }

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64);

    Ok(Some(IndexedDocument {
        path: Some(path.to_string_lossy().to_string()),
        title: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("untitled")
            .to_string(),
        content,
        size_bytes: metadata.len() as i64,
        modified_at,
    }))
}

fn normalize_import_paths(paths: Vec<String>) -> Result<Vec<PathBuf>, String> {
    let mut normalized = Vec::new();
    let mut seen = BTreeSet::new();

    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            continue;
        }

        let path = PathBuf::from(trimmed)
            .canonicalize()
            .map_err(|error| format!("无法定位待上传文件：{error}"))?;
        if !path.is_file() {
            return Err(format!("待上传路径不是文件：{}", path.display()));
        }
        if !is_supported_text_path(&path) {
            return Err(format!("暂不支持该文件类型：{}", path.display()));
        }

        let metadata =
            fs::metadata(&path).map_err(|error| format!("无法读取待上传文件：{error}"))?;
        if metadata.len() > MAX_FILE_BYTES {
            return Err(format!(
                "文件超过 {} MiB，暂不导入：{}",
                max_file_mib(),
                path.display()
            ));
        }

        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            normalized.push(path);
        }
    }

    Ok(normalized)
}

fn import_knowledge_file(storage_dir: &Path, source_path: &Path) -> Result<PathBuf, String> {
    if source_path.starts_with(storage_dir) {
        return Ok(source_path.to_path_buf());
    }

    let destination = unique_import_destination(storage_dir, source_path)?;
    fs::copy(source_path, &destination).map_err(|error| {
        format!(
            "无法复制知识文件 {} 到 {}：{error}",
            source_path.display(),
            destination.display()
        )
    })?;
    destination
        .canonicalize()
        .map_err(|error| format!("无法定位已导入文件：{error}"))
}

fn unique_import_destination(storage_dir: &Path, source_path: &Path) -> Result<PathBuf, String> {
    let file_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "待上传文件名无效".to_string())?;
    let first_candidate = storage_dir.join(file_name);
    if !first_candidate.exists() {
        return Ok(first_candidate);
    }

    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("knowledge");
    let extension = source_path.extension().and_then(|value| value.to_str());

    for index in 2..10_000 {
        let file_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        let candidate = storage_dir.join(file_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    let fallback_name = match extension {
        Some(extension) => format!("{stem}-{}.{}", new_record_id(), extension),
        None => format!("{stem}-{}", new_record_id()),
    };
    Ok(storage_dir.join(fallback_name))
}

fn chunk_document(content: &str) -> Vec<DocumentChunk> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_start = 0;
    let mut cursor = 0;

    for paragraph in split_paragraphs(content) {
        let paragraph_start = cursor;
        cursor += paragraph.chars().count() + 2;
        if current.is_empty() {
            current_start = paragraph_start;
        }

        if current.chars().count() + paragraph.chars().count() + 2 > CHUNK_TARGET_CHARS
            && !current.is_empty()
        {
            push_chunk(&mut chunks, &current, current_start);
            current = overlap_tail(&current);
            current_start = paragraph_start.saturating_sub(current.chars().count());
        }

        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(paragraph);
    }

    if !current.trim().is_empty() {
        push_chunk(&mut chunks, &current, current_start);
    }

    chunks
}

fn split_paragraphs(content: &str) -> Vec<&str> {
    let paragraphs = content
        .split("\n\n")
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if paragraphs.is_empty() {
        content
            .lines()
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .collect()
    } else {
        paragraphs
    }
}

fn push_chunk(chunks: &mut Vec<DocumentChunk>, content: &str, char_start: usize) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }

    let len = trimmed.chars().count();
    chunks.push(DocumentChunk {
        index: chunks.len(),
        content: trimmed.to_string(),
        char_start,
        char_end: char_start + len,
    });
}

fn overlap_tail(content: &str) -> String {
    let chars = content.chars().collect::<Vec<_>>();
    if chars.len() <= CHUNK_OVERLAP_CHARS {
        return content.trim().to_string();
    }

    chars[chars.len() - CHUNK_OVERLAP_CHARS..]
        .iter()
        .collect::<String>()
        .trim()
        .to_string()
}

fn search_vector(
    app: &AppHandle,
    conn: &Connection,
    source_ids: &[String],
    query: &str,
    max_results: usize,
) -> Result<Vec<KnowledgeSearchMatch>, String> {
    let Some(profile) = embeddings::resolve_default_embedding_profile(app)? else {
        return Ok(Vec::new());
    };
    let embedding_provider = embeddings::default_embedding_provider()?;
    let query_texts = vec![query.trim().to_string()];
    let query_embeddings = embedding_provider.embed_texts(&profile, &query_texts)?;
    let Some(query_vector) = query_embeddings.first() else {
        return Ok(Vec::new());
    };

    let vector_hits =
        vector_store::default_vector_store().search(conn, query_vector, source_ids, max_results)?;
    if vector_hits.is_empty() {
        return Ok(Vec::new());
    }

    let scores_by_chunk_id = vector_hits
        .iter()
        .map(|hit| (hit.chunk_id.clone(), hit.score))
        .collect::<BTreeMap<_, _>>();
    let chunk_ids = vector_hits
        .iter()
        .map(|hit| hit.chunk_id.clone())
        .collect::<Vec<_>>();
    let mut matches_by_id = load_matches_by_chunk_ids(conn, &chunk_ids)?;

    let matches = chunk_ids
        .into_iter()
        .filter_map(|chunk_id| {
            let mut item = matches_by_id.remove(&chunk_id)?;
            item.score = scores_by_chunk_id.get(&chunk_id).copied();
            Some(item)
        })
        .collect::<Vec<_>>();

    Ok(matches)
}

fn load_matches_by_chunk_ids(
    conn: &Connection,
    chunk_ids: &[String],
) -> Result<BTreeMap<String, KnowledgeSearchMatch>, String> {
    if chunk_ids.is_empty() {
        return Ok(BTreeMap::new());
    }

    let placeholders = placeholders(chunk_ids.len());
    let sql = format!(
        r#"
        SELECT
            chunks.id,
            chunks.source_id,
            chunks.content,
            documents.path,
            documents.title
        FROM rag_chunks AS chunks
        JOIN rag_documents AS documents ON documents.id = chunks.document_id
        WHERE chunks.id IN ({placeholders})
        "#
    );
    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("无法准备知识库向量回表：{error}"))?;
    let rows = statement
        .query_map(params_from_iter(chunk_ids.to_vec()), |row| {
            let chunk_id = row.get::<_, String>(0)?;
            Ok((
                chunk_id.clone(),
                KnowledgeSearchMatch {
                    id: chunk_id.clone(),
                    source_id: row.get(1)?,
                    chunk_id: Some(chunk_id),
                    source_type: "global_knowledge".to_string(),
                    content: row.get(2)?,
                    path: row.get(3)?,
                    title: row.get(4)?,
                    score: None,
                },
            ))
        })
        .map_err(|error| format!("无法执行知识库向量回表：{error}"))?;

    rows.collect::<Result<BTreeMap<_, _>, _>>()
        .map_err(|error| format!("无法解析知识库向量回表：{error}"))
}

fn merge_search_matches(
    fts_matches: Vec<KnowledgeSearchMatch>,
    vector_matches: Vec<KnowledgeSearchMatch>,
    max_results: usize,
    min_score: f64,
) -> Vec<KnowledgeSearchMatch> {
    if vector_matches.is_empty() {
        return fts_matches
            .into_iter()
            .filter(|item| item.score.unwrap_or(0.0) >= min_score)
            .take(max_results)
            .collect();
    }
    if fts_matches.is_empty() {
        return vector_matches
            .into_iter()
            .filter(|item| item.score.unwrap_or(0.0) >= min_score)
            .take(max_results)
            .collect();
    }

    let mut items = BTreeMap::<String, KnowledgeSearchMatch>::new();
    let mut scores = BTreeMap::<String, f64>::new();
    add_ranked_matches(&mut items, &mut scores, fts_matches, 1.0);
    add_ranked_matches(&mut items, &mut scores, vector_matches, 1.15);

    let mut merged = items.into_values().collect::<Vec<_>>();
    merged.sort_by(|left, right| {
        let left_score = scores.get(&left.id).copied().unwrap_or(0.0);
        let right_score = scores.get(&right.id).copied().unwrap_or(0.0);
        right_score.total_cmp(&left_score)
    });

    merged
        .into_iter()
        .map(|mut item| {
            item.score = scores.get(&item.id).copied();
            item
        })
        .filter(|item| item.score.unwrap_or(0.0) >= min_score)
        .take(max_results)
        .collect()
}

fn add_ranked_matches(
    items: &mut BTreeMap<String, KnowledgeSearchMatch>,
    scores: &mut BTreeMap<String, f64>,
    matches: Vec<KnowledgeSearchMatch>,
    weight: f64,
) {
    const RRF_K: f64 = 60.0;
    for (rank, item) in matches.into_iter().enumerate() {
        let id = item.id.clone();
        items.entry(id.clone()).or_insert(item);
        let score = scores.entry(id).or_insert(0.0);
        *score += weight / (RRF_K + rank as f64 + 1.0);
    }
}

fn search_fts(
    conn: &Connection,
    source_ids: &[String],
    query: &str,
    max_results: usize,
    min_score: f64,
) -> Result<Vec<KnowledgeSearchMatch>, String> {
    let Some(fts_query) = build_fts_query(query) else {
        return Ok(Vec::new());
    };
    let placeholders = placeholders(source_ids.len());
    let sql = format!(
        r#"
        SELECT
            chunks.id,
            chunks.source_id,
            rag_chunks_fts.content,
            documents.path,
            documents.title,
            bm25(rag_chunks_fts) AS rank
        FROM rag_chunks_fts
        JOIN rag_chunks AS chunks ON chunks.id = rag_chunks_fts.chunk_id
        JOIN rag_documents AS documents ON documents.id = chunks.document_id
        WHERE rag_chunks_fts MATCH ?
          AND chunks.source_id IN ({placeholders})
        ORDER BY rank ASC
        LIMIT {max_results}
        "#
    );

    let mut params = vec![fts_query];
    params.extend(source_ids.iter().cloned());
    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("无法准备知识库检索：{error}"))?;
    let rows = statement
        .query_map(params_from_iter(params), |row| {
            let chunk_id = row.get::<_, String>(0)?;
            let rank = row.get::<_, f64>(5)?;
            let score = 1.0 / (1.0 + rank.abs());
            Ok(KnowledgeSearchMatch {
                id: chunk_id.clone(),
                source_id: row.get(1)?,
                chunk_id: Some(chunk_id),
                source_type: "global_knowledge".to_string(),
                content: row.get(2)?,
                path: row.get(3)?,
                title: row.get(4)?,
                score: Some(score),
            })
        })
        .map_err(|error| format!("无法执行知识库检索：{error}"))?;

    let matches = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析知识库检索结果：{error}"))?
        .into_iter()
        .filter(|item| item.score.unwrap_or(0.0) >= min_score)
        .collect();
    Ok(matches)
}

fn search_like(
    conn: &Connection,
    source_ids: &[String],
    query: &str,
    max_results: usize,
    min_score: f64,
) -> Result<Vec<KnowledgeSearchMatch>, String> {
    let placeholders = placeholders(source_ids.len());
    let sql = format!(
        r#"
        SELECT
            chunks.id,
            chunks.source_id,
            chunks.content,
            documents.path,
            documents.title
        FROM rag_chunks AS chunks
        JOIN rag_documents AS documents ON documents.id = chunks.document_id
        WHERE chunks.source_id IN ({placeholders})
          AND (chunks.content LIKE ? OR documents.title LIKE ? OR documents.path LIKE ?)
        ORDER BY documents.updated_at DESC, chunks.chunk_index ASC
        LIMIT {max_results}
        "#
    );
    let pattern = format!("%{}%", query.trim());
    let mut params = source_ids.to_vec();
    params.push(pattern.clone());
    params.push(pattern.clone());
    params.push(pattern);

    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("无法准备知识库模糊检索：{error}"))?;
    let rows = statement
        .query_map(params_from_iter(params), |row| {
            let chunk_id = row.get::<_, String>(0)?;
            Ok(KnowledgeSearchMatch {
                id: chunk_id.clone(),
                source_id: row.get(1)?,
                chunk_id: Some(chunk_id),
                source_type: "global_knowledge".to_string(),
                content: row.get(2)?,
                path: row.get(3)?,
                title: row.get(4)?,
                score: Some(0.5),
            })
        })
        .map_err(|error| format!("无法执行知识库模糊检索：{error}"))?;

    Ok(rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析知识库模糊检索结果：{error}"))?
        .into_iter()
        .filter(|item| item.score.unwrap_or(0.0) >= min_score)
        .collect())
}

fn index_counts(conn: &Connection) -> Result<(i64, i64), String> {
    let document_count = conn
        .query_row("SELECT COUNT(*) FROM rag_documents", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| format!("无法统计知识库文档：{error}"))?;
    let chunk_count = conn
        .query_row("SELECT COUNT(*) FROM rag_chunks", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| format!("无法统计知识库 chunk：{error}"))?;
    Ok((document_count, chunk_count))
}

fn build_fts_query(query: &str) -> Option<String> {
    let tokens = query
        .split_whitespace()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>();

    if tokens.is_empty() {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(format!("\"{}\"", trimmed.replace('"', "\"\"")))
        }
    } else {
        Some(tokens.join(" OR "))
    }
}

fn placeholders(count: usize) -> String {
    (0..count).map(|_| "?").collect::<Vec<_>>().join(", ")
}

fn should_skip_path(path: &Path) -> bool {
    path.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name == ".novel-claw"
            || name == ".git"
            || name == "node_modules"
            || name == "dist"
            || name == "build"
            || (name.starts_with('.') && name != ".")
    })
}

fn is_supported_text_path(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };

    matches!(
        extension.to_ascii_lowercase().as_str(),
        "txt"
            | "md"
            | "markdown"
            | "json"
            | "csv"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "rs"
            | "toml"
            | "yaml"
            | "yml"
    )
}

fn estimate_tokens(content: &str) -> i64 {
    (content.chars().count() / 3).max(1) as i64
}

fn max_file_mib() -> u64 {
    MAX_FILE_BYTES / 1024 / 1024
}

fn normalize_ids(ids: Vec<String>) -> BTreeSet<String> {
    ids.into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect()
}

fn source_fingerprint(results: &[KnowledgeSourceIndexResult]) -> String {
    let mut parts = BTreeMap::new();
    for result in results {
        parts.insert(
            result.source_id.clone(),
            format!(
                "{}:{}:{}",
                result.status, result.document_count, result.chunk_count
            ),
        );
    }
    hash_string(
        &parts
            .into_iter()
            .map(|(key, value)| format!("{key}={value}"))
            .collect::<Vec<_>>()
            .join("\n"),
    )
}

fn hash_string(text: &str) -> String {
    let mut hash = 2166136261u32;
    for byte in text.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(16777619);
    }
    format!("{hash:08x}")
}

fn now_millis() -> Result<i64, String> {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}
