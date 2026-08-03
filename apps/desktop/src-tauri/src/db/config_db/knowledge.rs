use rusqlite::{params, Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use std::{collections::BTreeSet, path::PathBuf};
use tauri::AppHandle;

use super::{
    common::{normalize_optional_text, normalize_record_id, now_millis},
    connection::open_config_connection,
    inputs::{
        SaveEmbeddingProfileInput, SaveKnowledgeCollectionInput, SaveKnowledgeSettingsInput,
        SaveKnowledgeSourceInput, SetKnowledgeCollectionEmbeddingProfileInput,
        SetKnowledgeCollectionSourcesInput,
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

pub fn embedding_profile(
    app: &AppHandle,
    profile_id: &str,
) -> Result<Option<EmbeddingProfile>, String> {
    let id = profile_id.trim();
    if id.is_empty() {
        return Ok(None);
    }

    Ok(embedding_profiles(app)?
        .into_iter()
        .find(|profile| profile.id == id))
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

    conn.execute(
        r#"
        INSERT INTO embedding_profiles (
            id, name, provider_kind, base_url, api_key, model_id,
            dimensions, batch_size, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            provider_kind = excluded.provider_kind,
            base_url = excluded.base_url,
            api_key = excluded.api_key,
            model_id = excluded.model_id,
            dimensions = excluded.dimensions,
            batch_size = excluded.batch_size,
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
            now,
            now
        ],
    )
    .map_err(|error| format!("无法保存 Embedding 配置：{error}"))?;

    load_embedding_profiles(&conn)
}

pub fn delete_embedding_profile(
    app: &AppHandle,
    profile_id: &str,
) -> Result<Vec<EmbeddingProfile>, String> {
    let id = profile_id.trim();
    if id.is_empty() {
        return Err("Embedding 配置 ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    ensure_embedding_profile_exists(&conn, id)?;
    conn.execute("DELETE FROM embedding_profiles WHERE id = ?1", params![id])
        .map_err(|error| format!("无法删除 Embedding 配置：{error}"))?;
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

    let source_directory = normalize_knowledge_source_directory(input.source_directory.as_deref())?;
    let mut conn = open_config_connection(app)?;
    let id = normalize_record_id(input.id.as_deref());
    let now = now_millis()?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存知识库：{error}"))?;
    tx.execute(
        r#"
        INSERT INTO knowledge_collections (
            id, name, description, source_directory, color, "order", enabled,
            embedding_profile_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            source_directory = excluded.source_directory,
            color = excluded.color,
            "order" = excluded."order",
            enabled = excluded.enabled,
            embedding_profile_id = excluded.embedding_profile_id,
            updated_at = excluded.updated_at
        "#,
        params![
            id,
            name,
            normalize_optional_text(input.description.as_deref()),
            source_directory,
            normalize_optional_text(input.color.as_deref()),
            input.order.unwrap_or(0),
            input.enabled as i64,
            normalize_optional_text(input.embedding_profile_id.as_deref()),
            now,
            now
        ],
    )
    .map_err(|error| format!("无法保存知识库：{error}"))?;

    sync_collection_directory_source(&tx, &id, source_directory.as_deref(), now)?;
    tx.commit()
        .map_err(|error| format!("无法提交知识库：{error}"))?;

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
    let source_ids = collection_source_ids(&conn, id)?;
    conn.execute(
        "DELETE FROM knowledge_collections WHERE id = ?1",
        params![id],
    )
    .map_err(|error| format!("无法删除知识集合：{error}"))?;
    for source_id in source_ids {
        conn.execute(
            r#"
            DELETE FROM knowledge_sources
            WHERE id = ?1
              AND NOT EXISTS (
                  SELECT 1 FROM knowledge_collection_sources WHERE source_id = ?1
              )
            "#,
            params![source_id],
        )
        .map_err(|error| format!("无法清理知识库来源：{error}"))?;
    }
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

pub fn set_knowledge_collection_embedding_profile(
    app: &AppHandle,
    input: SetKnowledgeCollectionEmbeddingProfileInput,
) -> Result<KnowledgeLibrary, String> {
    let collection_id = input.collection_id.trim();
    if collection_id.is_empty() {
        return Err("知识库 ID 不能为空".to_string());
    }
    let embedding_profile_id = input.embedding_profile_id.trim();
    if embedding_profile_id.is_empty() {
        return Err("请选择向量模型".to_string());
    }

    let conn = open_config_connection(app)?;
    ensure_collection_exists(&conn, collection_id)?;
    ensure_embedding_profile_exists(&conn, embedding_profile_id)?;
    conn.execute(
        r#"
        UPDATE knowledge_collections
        SET embedding_profile_id = ?2, updated_at = ?3
        WHERE id = ?1
        "#,
        params![collection_id, embedding_profile_id, now_millis()?],
    )
    .map_err(|error| format!("无法切换知识库向量模型：{error}"))?;

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
                dimensions, batch_size,
                (
                    SELECT COUNT(*)
                    FROM knowledge_collections
                    WHERE embedding_profile_id = embedding_profiles.id
                ) AS knowledge_base_count,
                created_at, updated_at
            FROM embedding_profiles
            ORDER BY created_at ASC
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
                knowledge_base_count: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|error| format!("无法读取 Embedding 配置：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Embedding 配置：{error}"))
}

fn ensure_embedding_profile_exists(conn: &Connection, profile_id: &str) -> Result<(), String> {
    let exists = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM embedding_profiles WHERE id = ?1)",
            params![profile_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("无法读取 Embedding 配置：{error}"))?
        == 1;

    if exists {
        Ok(())
    } else {
        Err("Embedding 配置不存在".to_string())
    }
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
            SELECT
                id, name, description, source_directory, color, "order", enabled,
                embedding_profile_id, created_at, updated_at
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
                source_directory: row.get(3)?,
                color: row.get(4)?,
                order: row.get(5)?,
                enabled: row.get::<_, i64>(6)? == 1,
                embedding_profile_id: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
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

fn normalize_knowledge_source_directory(directory: Option<&str>) -> Result<Option<String>, String> {
    let Some(directory) = directory.map(str::trim).filter(|value| !value.is_empty()) else {
        return Err("请选择知识库目录".to_string());
    };

    let path = PathBuf::from(directory)
        .canonicalize()
        .map_err(|error| format!("无法定位知识库目录：{error}"))?;
    if !path.is_dir() {
        return Err("知识库目录必须是已存在的文件夹".to_string());
    }

    Ok(Some(path.to_string_lossy().to_string()))
}

fn sync_collection_directory_source(
    conn: &Connection,
    collection_id: &str,
    source_directory: Option<&str>,
    now: i64,
) -> Result<(), String> {
    let Some(source_directory) = source_directory else {
        return Ok(());
    };

    let existing_source = conn
        .query_row(
            r#"
            SELECT sources.id, sources.uri
            FROM knowledge_collection_sources AS links
            JOIN knowledge_sources AS sources ON sources.id = links.source_id
            WHERE links.collection_id = ?1 AND sources.kind = 'directory'
            ORDER BY links.created_at ASC
            LIMIT 1
            "#,
            params![collection_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| format!("无法读取知识库目录来源：{error}"))?;

    if existing_source
        .as_ref()
        .is_some_and(|(_, uri)| uri == source_directory)
    {
        return Ok(());
    }

    let conflicting_collection = conn
        .query_row(
            r#"
            SELECT collections.name
            FROM knowledge_sources AS sources
            JOIN knowledge_collection_sources AS links ON links.source_id = sources.id
            JOIN knowledge_collections AS collections ON collections.id = links.collection_id
            WHERE sources.kind = 'directory'
              AND sources.uri = ?1
              AND collections.id <> ?2
            LIMIT 1
            "#,
            params![source_directory, collection_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("无法校验知识库目录：{error}"))?;
    if let Some(name) = conflicting_collection {
        return Err(format!("该目录已被知识库“{name}”使用"));
    }

    let previous_source_ids = collection_source_ids(conn, collection_id)?;
    conn.execute(
        "DELETE FROM knowledge_collection_sources WHERE collection_id = ?1",
        params![collection_id],
    )
    .map_err(|error| format!("无法更新知识库目录来源：{error}"))?;

    let source_id = conn
        .query_row(
            "SELECT id FROM knowledge_sources WHERE kind = 'directory' AND uri = ?1 LIMIT 1",
            params![source_directory],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("无法读取知识库目录来源：{error}"))?
        .unwrap_or_else(|| normalize_record_id(None));
    let title = PathBuf::from(source_directory)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("知识库目录")
        .to_string();

    conn.execute(
        r#"
        INSERT INTO knowledge_sources (
            id, kind, uri, title, description, enabled,
            include_patterns_json, exclude_patterns_json, metadata_json,
            created_at, updated_at
        ) VALUES (?1, 'directory', ?2, ?3, NULL, 1, NULL, NULL, ?4, ?5, ?5)
        ON CONFLICT(id) DO UPDATE SET
            uri = excluded.uri,
            title = excluded.title,
            enabled = 1,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        "#,
        params![
            source_id,
            source_directory,
            title,
            format!(r#"{{"collectionId":"{collection_id}"}}"#),
            now
        ],
    )
    .map_err(|error| format!("无法保存知识库目录来源：{error}"))?;
    conn.execute(
        r#"
        INSERT INTO knowledge_collection_sources (collection_id, source_id, created_at)
        VALUES (?1, ?2, ?3)
        "#,
        params![collection_id, source_id, now],
    )
    .map_err(|error| format!("无法绑定知识库目录来源：{error}"))?;

    for previous_source_id in previous_source_ids {
        if previous_source_id == source_id {
            continue;
        }
        conn.execute(
            r#"
            DELETE FROM knowledge_sources
            WHERE id = ?1
              AND NOT EXISTS (
                  SELECT 1 FROM knowledge_collection_sources WHERE source_id = ?1
              )
            "#,
            params![previous_source_id],
        )
        .map_err(|error| format!("无法清理旧知识库来源：{error}"))?;
    }

    Ok(())
}

fn normalize_ids(ids: Vec<String>) -> Vec<String> {
    ids.into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}
