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

const GLOBAL_INDEX_ID: &str = "global";
const INDEX_VERSION: i64 = 3;
const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024;
const CHUNK_TARGET_CHARS: usize = 1200;
const CHUNK_OVERLAP_CHARS: usize = 160;
const MIN_VECTOR_RELEVANCE_SCORE: f64 = 0.55;

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
pub struct KnowledgeCollectionFile {
    pub name: String,
    pub relative_path: String,
    pub size_bytes: i64,
    pub modified_at: Option<i64>,
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
    title: String,
    content: String,
}

struct IndexSourceOutcome {
    document_count: i64,
    chunk_count: i64,
    chunks: Vec<IndexedChunkForEmbedding>,
}

struct EmbeddingSourceGroup {
    profile: ResolvedEmbeddingProfile,
    source_ids: BTreeSet<String>,
}

pub fn knowledge_index_status(
    app: &AppHandle,
    collection_id: Option<&str>,
) -> Result<KnowledgeIndexStatus, String> {
    let conn = open_index_connection(app)?;
    load_index_status(&conn, normalized_index_id(collection_id))
}

pub fn mark_knowledge_index_stale(app: &AppHandle) -> Result<(), String> {
    let conn = open_index_connection(app)?;
    conn.execute(
        "UPDATE rag_index_state SET status = 'stale', source_fingerprint = NULL, updated_at = ?1",
        params![now_millis()?],
    )
    .map_err(|error| format!("无法标记知识库索引待更新：{error}"))?;
    Ok(())
}

pub fn mark_collection_index_stale(app: &AppHandle, collection_id: &str) -> Result<(), String> {
    let conn = open_index_connection(app)?;
    let index_id = normalized_index_id(Some(collection_id));
    let current = load_index_status(&conn, index_id)?;
    set_index_status(
        &conn,
        index_id,
        "stale",
        None,
        None,
        current.document_count,
        current.chunk_count,
    )
}

pub fn delete_source_index(app: &AppHandle, source_id: &str) -> Result<(), String> {
    let conn = open_index_connection(app)?;
    clear_source_index(&conn, source_id)?;
    mark_knowledge_index_stale(app)
}

pub fn delete_collection_index(
    app: &AppHandle,
    collection_id: &str,
    source_ids: &[String],
) -> Result<(), String> {
    let conn = open_index_connection(app)?;
    for source_id in source_ids {
        clear_source_index(&conn, source_id)?;
    }
    conn.execute(
        "DELETE FROM rag_index_state WHERE id = ?1",
        params![collection_id],
    )
    .map_err(|error| format!("无法删除知识库索引状态：{error}"))?;
    Ok(())
}

pub fn list_knowledge_collection_files(
    app: &AppHandle,
    collection_id: &str,
) -> Result<Vec<KnowledgeCollectionFile>, String> {
    let library = config_db::knowledge_library(app)?;
    let collection = library
        .collections
        .iter()
        .find(|collection| collection.id == collection_id)
        .ok_or_else(|| "知识库不存在".to_string())?;
    let directory = collection
        .source_directory
        .as_deref()
        .ok_or_else(|| "知识库尚未设置目录".to_string())?;
    discover_collection_files(Path::new(directory))
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
    collection_id: &str,
) -> Result<RebuildKnowledgeIndexResult, String> {
    let library = config_db::knowledge_library(app)?;
    let collection = library
        .collections
        .iter()
        .find(|collection| collection.id == collection_id)
        .cloned()
        .ok_or_else(|| "知识库不存在".to_string())?;
    let profile_id = collection
        .embedding_profile_id
        .as_deref()
        .ok_or_else(|| "请先为知识库选择向量模型".to_string())?;
    let profile = config_db::embedding_profile(app, profile_id)?
        .ok_or_else(|| "知识库绑定的向量模型已失效，请先重新选择".to_string())?;
    let selected_source_ids = collection
        .source_ids
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if selected_source_ids.is_empty() {
        return Err("知识库目录尚未建立来源，请重新保存目录".to_string());
    }
    let embedding_groups = vec![EmbeddingSourceGroup {
        profile: ResolvedEmbeddingProfile { profile },
        source_ids: selected_source_ids.clone(),
    }];
    let sources = library
        .sources
        .into_iter()
        .filter(|source| source.enabled && selected_source_ids.contains(&source.id))
        .collect::<Vec<_>>();

    let mut conn = open_index_connection(app)?;
    set_index_status(&conn, collection_id, "building", None, None, 0, 0)?;

    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始重建知识库索引：{error}"))?;
    for source_id in &selected_source_ids {
        clear_source_index(&tx, source_id)?;
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

    let fingerprint = source_fingerprint(&source_results);
    let status = if errors.is_empty() { "ready" } else { "error" };
    set_index_status(
        &tx,
        collection_id,
        status,
        Some(&fingerprint),
        (!errors.is_empty()).then(|| errors.join("\n")).as_deref(),
        total_documents,
        total_chunks,
    )?;
    tx.commit()
        .map_err(|error| format!("无法提交知识库索引：{error}"))?;

    if errors.is_empty() {
        if let Err(error) =
            rebuild_vector_index(&mut conn, &chunks_for_embedding, &embedding_groups)
        {
            errors.push(format!("向量索引：{error}"));
            set_index_status(
                &conn,
                collection_id,
                "error",
                Some(&fingerprint),
                Some(&errors.join("\n")),
                total_documents,
                total_chunks,
            )?;
        }
    }

    let status = knowledge_index_status(app, Some(collection_id))?;
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
    collection_ids: Option<&[String]>,
    query: &str,
    max_results: usize,
    min_score: f64,
) -> Result<KnowledgeSearchResult, String> {
    let library = config_db::knowledge_library(app)?;
    let selected_collection_ids = collection_ids.map(|ids| ids.iter().collect::<BTreeSet<_>>());
    let embedding_groups = embedding_source_groups(app, &library, false, collection_ids)?;
    let enabled_source_ids = library
        .collections
        .iter()
        .filter(|collection| {
            collection.enabled
                && selected_collection_ids
                    .as_ref()
                    .map_or(true, |ids| ids.contains(&collection.id))
        })
        .flat_map(|collection| collection.source_ids.iter().cloned())
        .filter(|source_id| {
            library
                .sources
                .iter()
                .any(|source| source.id == *source_id && source.enabled)
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    if query.trim().is_empty() || enabled_source_ids.is_empty() {
        return Ok(KnowledgeSearchResult {
            matches: Vec::new(),
            enabled_source_ids,
        });
    }

    let conn = open_index_connection(app)?;
    let max_results = max_results.clamp(1, 20);
    let fts_matches = search_fts(&conn, &enabled_source_ids, query, max_results, min_score)?;
    let vector_matches =
        search_vector(&conn, &embedding_groups, query, max_results).unwrap_or_else(|_| Vec::new());
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
        params![GLOBAL_INDEX_ID, INDEX_VERSION, now],
    )
    .map_err(|error| format!("无法初始化知识库索引状态：{error}"))?;
    conn.execute(
        r#"
        UPDATE rag_index_state
        SET status = 'stale', source_fingerprint = NULL, updated_at = ?2
        WHERE version < ?1 AND status = 'ready'
        "#,
        params![INDEX_VERSION, now],
    )
    .map_err(|error| format!("无法标记旧版知识库索引待更新：{error}"))?;

    Ok(())
}

fn load_index_status(conn: &Connection, index_id: &str) -> Result<KnowledgeIndexStatus, String> {
    ensure_index_status(conn, index_id)?;
    conn.query_row(
        r#"
        SELECT id, version, status, updated_at, source_fingerprint, document_count, chunk_count, error
        FROM rag_index_state
        WHERE id = ?1
        "#,
        params![index_id],
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
    index_id: &str,
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
            index_id,
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

fn ensure_index_status(conn: &Connection, index_id: &str) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO rag_index_state (
            id, version, status, source_fingerprint, document_count, chunk_count, error, updated_at
        ) VALUES (?1, ?2, 'missing', NULL, 0, 0, NULL, ?3)
        ON CONFLICT(id) DO NOTHING
        "#,
        params![index_id, INDEX_VERSION, now_millis()?],
    )
    .map_err(|error| format!("无法初始化知识库索引状态：{error}"))?;
    Ok(())
}

fn normalized_index_id(collection_id: Option<&str>) -> &str {
    collection_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(GLOBAL_INDEX_ID)
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
                title: document.title.clone(),
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
    conn: &mut Connection,
    chunks: &[IndexedChunkForEmbedding],
    groups: &[EmbeddingSourceGroup],
) -> Result<(), String> {
    if chunks.is_empty() {
        return Ok(());
    }

    let vector_store = vector_store::default_vector_store();
    let embedding_provider = embeddings::default_embedding_provider()?;

    for group in groups {
        let profile = &group.profile;
        let profile_chunks = chunks
            .iter()
            .filter(|chunk| group.source_ids.contains(&chunk.source_id))
            .collect::<Vec<_>>();
        if profile_chunks.is_empty() {
            continue;
        }
        vector_store.ensure_schema(
            conn,
            &profile.profile.id,
            &profile.profile.model_id,
            profile.profile.dimensions,
        )?;
        let batch_size = effective_embedding_batch_size(profile);

        for batch in profile_chunks.chunks(batch_size) {
            let texts = batch
                .iter()
                .map(|chunk| {
                    embeddings::prepare_embedding_document(
                        &profile.profile.model_id,
                        &chunk.title,
                        &chunk.content,
                    )
                })
                .collect::<Vec<_>>();
            let vectors = embedding_provider.embed_texts(profile, &texts)?;
            let embeddings = batch
                .iter()
                .zip(vectors)
                .map(|(chunk, vector)| vector_embedding_from_chunk(profile, chunk, vector))
                .collect::<Vec<_>>();
            let tx = conn
                .transaction()
                .map_err(|error| format!("无法开始写入向量索引：{error}"))?;
            vector_store.insert_embeddings(&tx, &embeddings)?;
            tx.commit()
                .map_err(|error| format!("无法提交向量索引：{error}"))?;
        }
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

fn discover_collection_files(root: &Path) -> Result<Vec<KnowledgeCollectionFile>, String> {
    if !root.is_dir() {
        return Err("知识库目录不存在".to_string());
    }

    let mut files = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let entries = fs::read_dir(&path)
            .map_err(|error| format!("无法读取知识库目录 {}：{error}", path.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("无法读取知识库目录项：{error}"))?;
            let path = entry.path();
            if should_skip_path(&path) {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if !is_supported_text_path(&path) {
                continue;
            }
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("无法读取知识库文件 {}：{error}", path.display()))?;
            if metadata.len() > MAX_FILE_BYTES {
                continue;
            }
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as i64);
            files.push(KnowledgeCollectionFile {
                name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("untitled")
                    .to_string(),
                relative_path: path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string(),
                size_bytes: metadata.len() as i64,
                modified_at,
            });
        }
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
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
    let chars = content.chars().collect::<Vec<_>>();
    let mut chunks = Vec::new();
    let mut start = 0;

    while start < chars.len() {
        let hard_end = (start + CHUNK_TARGET_CHARS).min(chars.len());
        let end = if hard_end == chars.len() {
            hard_end
        } else {
            semantic_chunk_end(&chars, start, hard_end)
        };
        let raw = &chars[start..end];
        let leading_whitespace = raw.iter().take_while(|ch| ch.is_whitespace()).count();
        let trailing_whitespace = raw.iter().rev().take_while(|ch| ch.is_whitespace()).count();
        let content_start = start + leading_whitespace;
        let content_end = end.saturating_sub(trailing_whitespace);

        if content_start < content_end {
            let chunk_content = chars[content_start..content_end]
                .iter()
                .collect::<String>()
                .replace("\r\n", "\n")
                .replace('\r', "\n");
            chunks.push(DocumentChunk {
                index: chunks.len(),
                content: chunk_content,
                char_start: content_start,
                char_end: content_end,
            });
        }

        if end == chars.len() {
            break;
        }

        let next_start = end.saturating_sub(CHUNK_OVERLAP_CHARS);
        start = if next_start > start { next_start } else { end };
    }

    chunks
}

fn semantic_chunk_end(chars: &[char], start: usize, hard_end: usize) -> usize {
    let preferred_start = (start + CHUNK_TARGET_CHARS * 3 / 5).min(hard_end);

    for end in (preferred_start..=hard_end).rev() {
        if end > start && is_strong_chunk_boundary(chars[end - 1]) {
            return end;
        }
    }
    for end in (preferred_start..=hard_end).rev() {
        if end > start && chars[end - 1].is_whitespace() {
            return end;
        }
    }

    hard_end
}

fn is_strong_chunk_boundary(ch: char) -> bool {
    matches!(
        ch,
        '\n' | '\r' | '。' | '！' | '？' | '；' | '!' | '?' | ';'
    )
}

fn search_vector(
    conn: &Connection,
    groups: &[EmbeddingSourceGroup],
    query: &str,
    max_results: usize,
) -> Result<Vec<KnowledgeSearchMatch>, String> {
    let embedding_provider = embeddings::default_embedding_provider()?;
    let vector_store = vector_store::default_vector_store();
    let mut vector_hits_by_chunk = BTreeMap::new();
    for group in groups {
        let query_texts = vec![embeddings::prepare_embedding_query(
            &group.profile.profile.model_id,
            query,
        )];
        let query_embeddings = embedding_provider.embed_texts(&group.profile, &query_texts)?;
        let Some(query_vector) = query_embeddings.first() else {
            continue;
        };
        let source_ids = group.source_ids.iter().cloned().collect::<Vec<_>>();
        for hit in vector_store
            .search(
                conn,
                &group.profile.profile.id,
                &group.profile.profile.model_id,
                query_vector,
                &source_ids,
                max_results,
            )?
            .into_iter()
            .filter(|hit| hit.score >= MIN_VECTOR_RELEVANCE_SCORE)
        {
            vector_hits_by_chunk
                .entry(hit.chunk_id)
                .and_modify(|score: &mut f64| *score = score.max(hit.score))
                .or_insert(hit.score);
        }
    }
    let mut vector_hits = vector_hits_by_chunk.into_iter().collect::<Vec<_>>();
    vector_hits.sort_by(|left, right| right.1.total_cmp(&left.1));
    vector_hits.truncate(max_results);
    if vector_hits.is_empty() {
        return Ok(Vec::new());
    }

    let scores_by_chunk_id = vector_hits.iter().cloned().collect::<BTreeMap<_, _>>();
    let chunk_ids = vector_hits
        .iter()
        .map(|(chunk_id, _)| chunk_id.clone())
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

fn embedding_source_groups(
    app: &AppHandle,
    library: &KnowledgeLibrary,
    require_valid_bindings: bool,
    collection_ids: Option<&[String]>,
) -> Result<Vec<EmbeddingSourceGroup>, String> {
    let profiles = config_db::embedding_profiles(app)?;
    let profiles_by_id = profiles
        .into_iter()
        .map(|profile| (profile.id.clone(), profile))
        .collect::<BTreeMap<_, _>>();
    let enabled_source_ids = library
        .sources
        .iter()
        .filter(|source| source.enabled)
        .map(|source| source.id.clone())
        .collect::<BTreeSet<_>>();
    let mut source_ids_by_profile = BTreeMap::<String, BTreeSet<String>>::new();
    let mut invalid_collections = Vec::new();
    let selected_collection_ids = collection_ids.map(|ids| ids.iter().collect::<BTreeSet<_>>());

    for collection in library.collections.iter().filter(|collection| {
        collection.enabled
            && selected_collection_ids
                .as_ref()
                .map_or(true, |ids| ids.contains(&collection.id))
    }) {
        let Some(profile_id) = collection.embedding_profile_id.as_deref() else {
            invalid_collections.push(collection.name.clone());
            continue;
        };
        if !profiles_by_id.contains_key(profile_id) {
            invalid_collections.push(collection.name.clone());
            continue;
        }
        let profile_source_ids = source_ids_by_profile
            .entry(profile_id.to_string())
            .or_default();
        profile_source_ids.extend(
            collection
                .source_ids
                .iter()
                .filter(|source_id| enabled_source_ids.contains(*source_id))
                .cloned(),
        );
    }

    if require_valid_bindings && !invalid_collections.is_empty() {
        return Err(format!(
            "以下知识库的向量模型已失效，请先重新选择：{}",
            invalid_collections.join("、")
        ));
    }

    Ok(source_ids_by_profile
        .into_iter()
        .filter_map(|(profile_id, source_ids)| {
            let profile = profiles_by_id.get(&profile_id)?.clone();
            Some(EmbeddingSourceGroup {
                profile: ResolvedEmbeddingProfile { profile },
                source_ids,
            })
        })
        .collect())
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
        name == ".isle-claw"
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_index_schema_marks_ready_legacy_index_stale() {
        let conn = Connection::open_in_memory().expect("open in-memory index");
        initialize_index_schema(&conn).expect("initialize current index schema");
        conn.execute(
            r#"
            UPDATE rag_index_state
            SET version = ?1, status = 'ready', source_fingerprint = 'legacy'
            WHERE id = ?2
            "#,
            params![INDEX_VERSION - 1, GLOBAL_INDEX_ID],
        )
        .expect("seed legacy ready index");

        initialize_index_schema(&conn).expect("migrate legacy index state");

        let (status, fingerprint) = conn
            .query_row(
                "SELECT status, source_fingerprint FROM rag_index_state WHERE id = ?1",
                params![GLOBAL_INDEX_ID],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .expect("load migrated index state");
        assert_eq!(status, "stale");
        assert_eq!(fingerprint, None);
    }

    #[test]
    fn chunk_document_normalizes_windows_line_endings_and_splits_content() {
        let paragraph = format!(
            "这是一个用于测试 Windows 换行的段落。{}",
            "正文内容。".repeat(50)
        );
        let content = (0..20)
            .map(|index| format!("第 {index} 节\r\n{paragraph}"))
            .collect::<Vec<_>>()
            .join("\r\n\r\n");

        let chunks = chunk_document(&content);

        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|chunk| !chunk.content.contains('\r')));
        assert!(chunks
            .iter()
            .all(|chunk| chunk.content.chars().count() <= CHUNK_TARGET_CHARS));
    }

    #[test]
    fn chunk_document_forces_long_unbroken_content_under_limit() {
        let content = "长".repeat(CHUNK_TARGET_CHARS * 3);

        let chunks = chunk_document(&content);

        assert!(chunks.len() > 1);
        assert!(chunks
            .iter()
            .all(|chunk| chunk.content.chars().count() <= CHUNK_TARGET_CHARS));
        for pair in chunks.windows(2) {
            let left_tail = pair[0]
                .content
                .chars()
                .rev()
                .take(CHUNK_OVERLAP_CHARS)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<String>();
            let right_head = pair[1]
                .content
                .chars()
                .take(CHUNK_OVERLAP_CHARS)
                .collect::<String>();
            assert_eq!(left_tail, right_head);
        }
    }

    #[test]
    fn chunk_document_preserves_short_content_with_normalized_newlines() {
        let chunks = chunk_document("第一行\r\n第二行\r第三行");

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, "第一行\n第二行\n第三行");
    }
}
