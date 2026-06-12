use rusqlite::{params, Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use std::{collections::BTreeSet, path::PathBuf};
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::{
        SaveEmbeddingProfileInput, SaveKnowledgeCollectionInput, SaveKnowledgeSettingsInput,
        SaveKnowledgeSourceInput, SetKnowledgeCollectionSourcesInput,
    },
    models::{
        EmbeddingProfile, KnowledgeCollection, KnowledgeLibrary, KnowledgeSettings, KnowledgeSource,
    },
};

const KNOWLEDGE_SETTING_STORAGE_DIRECTORY: &str = "storageDirectory";

pub fn knowledge_library(app: &AppHandle) -> Result<KnowledgeLibrary, String> {
    let conn = open_config_connection(app)?;
    load_knowledge_library(&conn)
}

pub fn knowledge_settings(app: &AppHandle) -> Result<KnowledgeSettings, String> {
    let conn = open_config_connection(app)?;
    load_knowledge_settings(&conn)
}

pub fn embedding_profiles(app: &AppHandle) -> Result<Vec<EmbeddingProfile>, String> {
    let conn = open_config_connection(app)?;
    load_embedding_profiles(&conn)
}

pub fn default_embedding_profile(app: &AppHandle) -> Result<Option<EmbeddingProfile>, String> {
    let profiles = embedding_profiles(app)?;
    Ok(profiles
        .iter()
        .find(|profile| profile.is_default)
        .cloned()
        .or_else(|| profiles.first().cloned()))
}

pub fn save_embedding_profile(
    app: &AppHandle,
    input: SaveEmbeddingProfileInput,
) -> Result<Vec<EmbeddingProfile>, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("Embedding 配置名称不能为空".to_string());
    }
    let provider_kind = input.provider_kind.trim();
    if provider_kind.is_empty() {
        return Err("Embedding Provider 类型不能为空".to_string());
    }
    if !is_supported_embedding_provider_kind(provider_kind) {
        return Err(format!(
            "暂不支持该 Embedding Provider 类型：{provider_kind}，请使用 OpenAI-compatible Provider 或本地 Ollama"
        ));
    }
    let model_id = input.model_id.trim();
    if model_id.is_empty() {
        return Err("Embedding 模型 ID 不能为空".to_string());
    }
    if input.dimensions <= 0 {
        return Err("Embedding 维度必须大于 0".to_string());
    }

    let conn = open_config_connection(app)?;
    let id = normalize_record_id(input.id.as_deref());
    let now = now_millis()?;
    let batch_size = input.batch_size.unwrap_or(32).clamp(1, 256);
    let api_key = if provider_kind == "ollama" {
        None
    } else {
        normalize_optional_text(input.api_key.as_deref())
    };

    if input.is_default {
        conn.execute("UPDATE embedding_profiles SET is_default = 0", [])
            .map_err(|error| format!("无法更新默认 Embedding 配置：{error}"))?;
    }

    conn.execute(
        r#"
        INSERT INTO embedding_profiles (
            id, name, provider_kind, base_url, api_key, model_id,
            dimensions, batch_size, is_default, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            provider_kind = excluded.provider_kind,
            base_url = excluded.base_url,
            api_key = excluded.api_key,
            model_id = excluded.model_id,
            dimensions = excluded.dimensions,
            batch_size = excluded.batch_size,
            is_default = excluded.is_default,
            updated_at = excluded.updated_at
        "#,
        params![
            id,
            name,
            provider_kind,
            normalize_optional_text(input.base_url.as_deref()),
            api_key,
            model_id,
            input.dimensions,
            batch_size,
            input.is_default as i64,
            now,
            now
        ],
    )
    .map_err(|error| format!("无法保存 Embedding 配置：{error}"))?;

    ensure_one_default_embedding_profile(&conn)?;
    load_embedding_profiles(&conn)
}

pub fn save_knowledge_settings(
    app: &AppHandle,
    input: SaveKnowledgeSettingsInput,
) -> Result<KnowledgeSettings, String> {
    let storage_directory = normalize_storage_directory(input.storage_directory.as_deref())?;
    let conn = open_config_connection(app)?;
    let now = now_millis()?;

    match storage_directory {
        Some(directory) => {
            save_knowledge_setting(&conn, KNOWLEDGE_SETTING_STORAGE_DIRECTORY, &directory, now)?
        }
        None => {
            conn.execute(
                "DELETE FROM knowledge_settings WHERE key = ?1",
                params![KNOWLEDGE_SETTING_STORAGE_DIRECTORY],
            )
            .map_err(|error| format!("无法清空知识库目录设置：{error}"))?;
        }
    }

    load_knowledge_settings(&conn)
}

pub fn save_knowledge_collection(
    app: &AppHandle,
    input: SaveKnowledgeCollectionInput,
) -> Result<KnowledgeLibrary, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("知识集合名称不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    let id = normalize_record_id(input.id.as_deref());
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO knowledge_collections (
            id, name, description, color, "order", enabled, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            color = excluded.color,
            "order" = excluded."order",
            enabled = excluded.enabled,
            updated_at = excluded.updated_at
        "#,
        params![
            id,
            name,
            normalize_optional_text(input.description.as_deref()),
            normalize_optional_text(input.color.as_deref()),
            input.order.unwrap_or(0),
            input.enabled as i64,
            now,
            now
        ],
    )
    .map_err(|error| format!("无法保存知识集合：{error}"))?;

    load_knowledge_library(&conn)
}

pub fn delete_knowledge_collection(
    app: &AppHandle,
    collection_id: &str,
) -> Result<KnowledgeLibrary, String> {
    let id = collection_id.trim();
    if id.is_empty() {
        return Err("知识集合 ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    conn.execute(
        "DELETE FROM knowledge_collections WHERE id = ?1",
        params![id],
    )
    .map_err(|error| format!("无法删除知识集合：{error}"))?;
    load_knowledge_library(&conn)
}

pub fn save_knowledge_source(
    app: &AppHandle,
    input: SaveKnowledgeSourceInput,
) -> Result<KnowledgeLibrary, String> {
    let kind = normalize_source_kind(&input.kind)?;
    let uri = normalize_source_uri(&kind, &input.uri)?;
    let title = input.title.trim();
    if title.is_empty() {
        return Err("知识源标题不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    let id = normalize_record_id(input.id.as_deref());
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO knowledge_sources (
            id, kind, uri, title, description, enabled,
            include_patterns_json, exclude_patterns_json, metadata_json,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind,
            uri = excluded.uri,
            title = excluded.title,
            description = excluded.description,
            enabled = excluded.enabled,
            include_patterns_json = excluded.include_patterns_json,
            exclude_patterns_json = excluded.exclude_patterns_json,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        "#,
        params![
            id,
            kind,
            uri,
            title,
            normalize_optional_text(input.description.as_deref()),
            input.enabled as i64,
            normalize_optional_text(input.include_patterns_json.as_deref()),
            normalize_optional_text(input.exclude_patterns_json.as_deref()),
            normalize_optional_text(input.metadata_json.as_deref()),
            now,
            now
        ],
    )
    .map_err(|error| format!("无法保存知识源：{error}"))?;

    load_knowledge_library(&conn)
}

pub fn delete_knowledge_source(
    app: &AppHandle,
    source_id: &str,
) -> Result<KnowledgeLibrary, String> {
    let id = source_id.trim();
    if id.is_empty() {
        return Err("知识源 ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    conn.execute("DELETE FROM knowledge_sources WHERE id = ?1", params![id])
        .map_err(|error| format!("无法删除知识源：{error}"))?;
    load_knowledge_library(&conn)
}

pub fn set_knowledge_collection_sources(
    app: &AppHandle,
    input: SetKnowledgeCollectionSourcesInput,
) -> Result<KnowledgeLibrary, String> {
    let collection_id = input.collection_id.trim();
    if collection_id.is_empty() {
        return Err("知识集合 ID 不能为空".to_string());
    }

    let mut conn = open_config_connection(app)?;
    ensure_collection_exists(&conn, collection_id)?;

    let source_ids = normalize_ids(input.source_ids);
    for source_id in &source_ids {
        ensure_source_exists(&conn, source_id)?;
    }

    let now = now_millis()?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存知识集合来源：{error}"))?;
    tx.execute(
        "DELETE FROM knowledge_collection_sources WHERE collection_id = ?1",
        params![collection_id],
    )
    .map_err(|error| format!("无法清空知识集合来源：{error}"))?;

    for source_id in source_ids {
        tx.execute(
            r#"
            INSERT INTO knowledge_collection_sources (collection_id, source_id, created_at)
            VALUES (?1, ?2, ?3)
            "#,
            params![collection_id, source_id, now],
        )
        .map_err(|error| format!("无法保存知识集合来源：{error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("无法提交知识集合来源：{error}"))?;

    load_knowledge_library(&conn)
}

pub fn enabled_knowledge_source_ids(app: &AppHandle) -> Result<Vec<String>, String> {
    let conn = open_config_connection(app)?;
    resolve_enabled_knowledge_source_ids(&conn)
}

fn resolve_enabled_knowledge_source_ids(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT DISTINCT sources.id
            FROM knowledge_collection_sources AS links
            JOIN knowledge_collections AS collections ON collections.id = links.collection_id
            JOIN knowledge_sources AS sources ON sources.id = links.source_id
            WHERE collections.enabled = 1 AND sources.enabled = 1
            ORDER BY sources.created_at ASC, sources.title ASC
            "#,
        )
        .map_err(|error| format!("无法读取启用知识集合来源：{error}"))?;

    let source_ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取启用知识集合来源：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析启用知识集合来源：{error}"))?;

    Ok(source_ids)
}

fn load_knowledge_library(conn: &Connection) -> Result<KnowledgeLibrary, String> {
    let sources = load_knowledge_sources(conn)?;
    let collections = load_knowledge_collections(conn)?;
    Ok(KnowledgeLibrary {
        collections,
        sources,
    })
}

fn load_knowledge_settings(conn: &Connection) -> Result<KnowledgeSettings, String> {
    Ok(KnowledgeSettings {
        storage_directory: load_knowledge_setting(conn, KNOWLEDGE_SETTING_STORAGE_DIRECTORY)?,
    })
}

fn load_embedding_profiles(conn: &Connection) -> Result<Vec<EmbeddingProfile>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT
                id, name, provider_kind, base_url, api_key, model_id,
                dimensions, batch_size, is_default, created_at, updated_at
            FROM embedding_profiles
            ORDER BY is_default DESC, created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取 Embedding 配置：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(EmbeddingProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                provider_kind: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                model_id: row.get(5)?,
                dimensions: row.get(6)?,
                batch_size: row.get(7)?,
                is_default: row.get::<_, i64>(8)? == 1,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| format!("无法读取 Embedding 配置：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Embedding 配置：{error}"))
}

fn ensure_one_default_embedding_profile(conn: &Connection) -> Result<(), String> {
    let has_default = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM embedding_profiles WHERE is_default = 1)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("无法读取默认 Embedding 配置：{error}"))?
        == 1;
    if has_default {
        return Ok(());
    }

    conn.execute(
        r#"
        UPDATE embedding_profiles
        SET is_default = 1
        WHERE id = (
            SELECT id FROM embedding_profiles ORDER BY created_at ASC LIMIT 1
        )
        "#,
        [],
    )
    .map_err(|error| format!("无法设置默认 Embedding 配置：{error}"))?;
    Ok(())
}

fn is_supported_embedding_provider_kind(provider_kind: &str) -> bool {
    matches!(
        provider_kind,
        "openai" | "openai-compatible" | "openai-responses" | "openai-completions" | "ollama"
    )
}

fn load_knowledge_setting<T: DeserializeOwned>(
    conn: &Connection,
    key: &str,
) -> Result<Option<T>, String> {
    let value = conn
        .query_row(
            "SELECT value_json FROM knowledge_settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("无法读取知识库设置：{error}"))?;

    value
        .map(|raw| serde_json::from_str::<T>(&raw))
        .transpose()
        .map_err(|error| format!("无法解析知识库设置：{error}"))
}

fn save_knowledge_setting<T: serde::Serialize>(
    conn: &Connection,
    key: &str,
    value: &T,
    now: i64,
) -> Result<(), String> {
    let value_json =
        serde_json::to_string(value).map_err(|error| format!("无法序列化知识库设置：{error}"))?;
    conn.execute(
        r#"
        INSERT INTO knowledge_settings (key, value_json, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
        "#,
        params![key, value_json, now],
    )
    .map_err(|error| format!("无法保存知识库设置：{error}"))?;

    Ok(())
}

fn load_knowledge_collections(conn: &Connection) -> Result<Vec<KnowledgeCollection>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, description, color, "order", enabled, created_at, updated_at
            FROM knowledge_collections
            ORDER BY "order" ASC, created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取知识集合：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            let id = row.get::<_, String>(0)?;
            Ok(KnowledgeCollection {
                source_ids: Vec::new(),
                id,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                order: row.get(4)?,
                enabled: row.get::<_, i64>(5)? == 1,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("无法读取知识集合：{error}"))?;

    let mut collections = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析知识集合：{error}"))?;

    for collection in &mut collections {
        collection.source_ids = collection_source_ids(conn, &collection.id)?;
    }

    Ok(collections)
}

fn load_knowledge_sources(conn: &Connection) -> Result<Vec<KnowledgeSource>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT
                id, kind, uri, title, description, enabled,
                include_patterns_json, exclude_patterns_json, metadata_json,
                created_at, updated_at
            FROM knowledge_sources
            ORDER BY created_at ASC, title ASC
            "#,
        )
        .map_err(|error| format!("无法读取知识源：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(KnowledgeSource {
                id: row.get(0)?,
                kind: row.get(1)?,
                uri: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                enabled: row.get::<_, i64>(5)? == 1,
                include_patterns_json: row.get(6)?,
                exclude_patterns_json: row.get(7)?,
                metadata_json: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| format!("无法读取知识源：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析知识源：{error}"))
}

fn collection_source_ids(conn: &Connection, collection_id: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT source_id
            FROM knowledge_collection_sources
            WHERE collection_id = ?1
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取知识集合来源：{error}"))?;

    let source_ids = statement
        .query_map(params![collection_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取知识集合来源：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析知识集合来源：{error}"))?;

    Ok(source_ids)
}

fn ensure_collection_exists(conn: &Connection, collection_id: &str) -> Result<(), String> {
    let exists = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM knowledge_collections WHERE id = ?1)",
            params![collection_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("无法读取知识集合：{error}"))?
        == 1;

    if exists {
        Ok(())
    } else {
        Err("知识集合不存在".to_string())
    }
}

fn ensure_source_exists(conn: &Connection, source_id: &str) -> Result<(), String> {
    let exists = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM knowledge_sources WHERE id = ?1)",
            params![source_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("无法读取知识源：{error}"))?
        == 1;

    if exists {
        Ok(())
    } else {
        Err("知识源不存在".to_string())
    }
}

fn normalize_source_kind(kind: &str) -> Result<String, String> {
    match kind.trim() {
        "file" => Ok("file".to_string()),
        "directory" => Ok("directory".to_string()),
        "manual" => Ok("manual".to_string()),
        _ => Err("知识源类型必须是 file、directory 或 manual".to_string()),
    }
}

fn normalize_source_uri(kind: &str, uri: &str) -> Result<String, String> {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
        return Err("知识源路径不能为空".to_string());
    }

    if kind == "manual" {
        return Ok(trimmed.to_string());
    }

    let path = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|error| format!("无法定位知识源路径：{error}"))?;
    if kind == "file" && !path.is_file() {
        return Err("知识源路径必须是文件".to_string());
    }
    if kind == "directory" && !path.is_dir() {
        return Err("知识源路径必须是目录".to_string());
    }

    Ok(path.to_string_lossy().to_string())
}

fn normalize_storage_directory(directory: Option<&str>) -> Result<Option<String>, String> {
    let Some(directory) = directory.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    let path = PathBuf::from(directory);
    std::fs::create_dir_all(&path).map_err(|error| format!("无法创建知识库目录：{error}"))?;
    let path = path
        .canonicalize()
        .map_err(|error| format!("无法定位知识库目录：{error}"))?;
    if !path.is_dir() {
        return Err("知识库目录必须是文件夹".to_string());
    }

    Ok(Some(path.to_string_lossy().to_string()))
}

fn normalize_ids(ids: Vec<String>) -> Vec<String> {
    ids.into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
