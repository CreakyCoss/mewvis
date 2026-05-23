use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

use super::id::{is_record_id, new_record_id};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGroup {
    pub id: String,
    pub name: String,
    pub order: i64,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub is_pinned: bool,
    pub order: i64,
    pub group_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOverview {
    pub config_db_path: String,
    pub groups: Vec<WorkspaceGroup>,
    pub workspaces: Vec<Workspace>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProvider {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub models: Vec<ProviderModel>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub provider_id: String,
    pub model_id: String,
    pub model_name: String,
    pub is_enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmSettings {
    pub providers: Vec<LlmProvider>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillSettings {
    pub enabled_skill_names: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub group_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderModelInput {
    pub id: Option<String>,
    pub model_id: String,
    pub model_name: String,
    pub is_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub vendor: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub is_default: bool,
    pub models: Vec<SaveProviderModelInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmSettingsInput {
    pub providers: Vec<SaveLlmProviderInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkspaceSkillsInput {
    pub workspace_id: String,
    pub enabled_skill_names: Vec<String>,
}

pub fn config_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法获取用户主目录：{error}"))?
        .join(".novel-claw");

    fs::create_dir_all(&config_dir).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(config_dir.join("config.db"))
}

pub fn overview(app: &AppHandle) -> Result<WorkspaceOverview, String> {
    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;

    let groups = load_groups(&conn)?;
    let workspaces = load_workspaces(&conn)?;

    Ok(WorkspaceOverview {
        config_db_path: db_path.to_string_lossy().to_string(),
        groups,
        workspaces,
    })
}

pub fn llm_settings(app: &AppHandle) -> Result<LlmSettings, String> {
    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法启用外键约束：{error}"))?;

    Ok(LlmSettings {
        providers: load_llm_providers(&conn)?,
    })
}

pub fn workspace_skill_settings(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法启用外键约束：{error}"))?;

    ensure_workspace_exists(&conn, workspace_id)?;

    Ok(WorkspaceSkillSettings {
        enabled_skill_names: load_workspace_skill_names(&conn, workspace_id)?,
    })
}

pub fn save_workspace_skill_settings(
    app: &AppHandle,
    input: SaveWorkspaceSkillsInput,
) -> Result<WorkspaceSkillSettings, String> {
    let workspace_id = input.workspace_id.trim();
    if workspace_id.is_empty() {
        return Err("工作区 ID 不能为空".to_string());
    }

    let db_path = config_db_path(app)?;
    let mut conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法启用外键约束：{error}"))?;
    ensure_workspace_exists(&conn, workspace_id)?;

    let skill_names = normalize_skill_names(input.enabled_skill_names);
    let now = now_millis()?;
    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存工作区 Skills：{error}"))?;
    tx.execute(
        "DELETE FROM workspace_enabled_skills WHERE workspace_id = ?1",
        params![workspace_id],
    )
    .map_err(|error| format!("无法清空工作区 Skills：{error}"))?;

    for skill_name in skill_names {
        tx.execute(
            r#"
            INSERT INTO workspace_enabled_skills (workspace_id, skill_name, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            params![workspace_id, skill_name, now, now],
        )
        .map_err(|error| format!("无法保存工作区 Skill：{error}"))?;
    }

    tx.commit()
        .map_err(|error| format!("无法提交工作区 Skills：{error}"))?;

    workspace_skill_settings(app, workspace_id)
}

pub fn save_llm_settings(
    app: &AppHandle,
    input: SaveLlmSettingsInput,
) -> Result<LlmSettings, String> {
    validate_llm_settings(&input)?;

    let db_path = config_db_path(app)?;
    let mut conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法启用外键约束：{error}"))?;

    let tx = conn
        .transaction()
        .map_err(|error| format!("无法开始保存 LLM 设置：{error}"))?;
    tx.execute("DELETE FROM llm_providers", [])
        .map_err(|error| format!("无法清空 LLM Provider：{error}"))?;

    let now = now_millis()?;
    let default_index = input
        .providers
        .iter()
        .position(|provider| provider.is_default)
        .unwrap_or(0);

    for (provider_index, provider) in input.providers.iter().enumerate() {
        let provider_id = normalize_record_id(provider.id.as_deref());
        let name = provider.name.trim();
        let vendor = provider.vendor.trim();
        let provider_name = provider.provider.trim();
        let api_key = normalize_optional_text(provider.api_key.as_deref());
        let base_url = normalize_optional_text(provider.base_url.as_deref());
        let is_default = provider_index == default_index;

        tx.execute(
            r#"
            INSERT INTO llm_providers (
                id, name, vendor, provider, api_key, base_url, is_default, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                provider_id,
                name,
                vendor,
                provider_name,
                api_key,
                base_url,
                is_default as i64,
                now,
                now
            ],
        )
        .map_err(|error| format!("无法保存 LLM Provider：{error}"))?;

        for model in &provider.models {
            let model_id = normalize_record_id(model.id.as_deref());
            tx.execute(
                r#"
                INSERT INTO provider_models (
                    id, provider_id, model_id, model_name, is_enabled, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    model_id,
                    provider_id,
                    model.model_id.trim(),
                    model.model_name.trim(),
                    model.is_enabled as i64,
                    now,
                    now
                ],
            )
            .map_err(|error| format!("无法保存 LLM 模型：{error}"))?;
        }
    }

    tx.commit()
        .map_err(|error| format!("无法提交 LLM 设置：{error}"))?;

    llm_settings(app)
}

pub fn create_workspace(app: &AppHandle, input: CreateWorkspaceInput) -> Result<Workspace, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("工作区名称不能为空".to_string());
    }

    let workspace_path = PathBuf::from(input.path.trim());
    if workspace_path.as_os_str().is_empty() {
        return Err("请选择工作区目录".to_string());
    }

    fs::create_dir_all(&workspace_path).map_err(|error| format!("无法创建工作区目录：{error}"))?;
    super::migrate::migrate_workspace_database(&workspace_path)?;

    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;

    let now = now_millis()?;
    let id = new_record_id();
    let description = input.description.and_then(|value| {
        let trimmed = value.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    });
    let group_id = normalize_group_id(&conn, input.group_id)?;
    let next_order = next_workspace_order(&conn, group_id.as_deref())?;
    let path = workspace_path.to_string_lossy().to_string();

    conn.execute(
        r#"
        INSERT INTO workspaces (
            id, name, description, path, is_pinned, "order", group_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8)
        "#,
        params![id, name, description, path, next_order, group_id, now, now],
    )
    .map_err(|error| format!("无法保存工作区：{error}"))?;

    load_workspace(&conn, &id)?.ok_or_else(|| "工作区保存后未能读取".to_string())
}

fn load_groups(conn: &Connection) -> Result<Vec<WorkspaceGroup>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, "order", is_default, created_at, updated_at
            FROM workspace_groups
            ORDER BY is_default DESC, "order" ASC, created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取工作区分组：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(WorkspaceGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                order: row.get(2)?,
                is_default: row.get::<_, i64>(3)? == 1,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| format!("无法读取工作区分组：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析工作区分组：{error}"))
}

fn load_workspaces(conn: &Connection) -> Result<Vec<Workspace>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, description, path, is_pinned, "order", group_id, created_at, updated_at
            FROM workspaces
            ORDER BY is_pinned DESC, "order" ASC, created_at DESC
            "#,
        )
        .map_err(|error| format!("无法读取工作区：{error}"))?;

    let rows = statement
        .query_map([], workspace_from_row)
        .map_err(|error| format!("无法读取工作区：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析工作区：{error}"))
}

fn load_workspace(conn: &Connection, id: &str) -> Result<Option<Workspace>, String> {
    conn.query_row(
        r#"
        SELECT id, name, description, path, is_pinned, "order", group_id, created_at, updated_at
        FROM workspaces
        WHERE id = ?1
        "#,
        params![id],
        workspace_from_row,
    )
    .optional()
    .map_err(|error| format!("无法读取工作区：{error}"))
}

fn ensure_workspace_exists(conn: &Connection, workspace_id: &str) -> Result<(), String> {
    let exists = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id = ?1)",
            params![workspace_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("无法读取工作区：{error}"))?
        == 1;

    if exists {
        Ok(())
    } else {
        Err("工作区不存在".to_string())
    }
}

fn load_workspace_skill_names(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT skill_name
            FROM workspace_enabled_skills
            WHERE workspace_id = ?1
            ORDER BY created_at ASC, skill_name ASC
            "#,
        )
        .map_err(|error| format!("无法读取工作区 Skills：{error}"))?;

    let skill_names = statement
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取工作区 Skills：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析工作区 Skills：{error}"))?;

    Ok(skill_names)
}

fn load_llm_providers(conn: &Connection) -> Result<Vec<LlmProvider>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, vendor, provider, api_key, base_url, is_default, created_at, updated_at
            FROM llm_providers
            ORDER BY is_default DESC, created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取 LLM Provider：{error}"))?;

    let rows = statement
        .query_map([], |row| {
            Ok(LlmProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                vendor: row.get(2)?,
                provider: row.get(3)?,
                api_key: row.get(4)?,
                base_url: row.get(5)?,
                is_default: row.get::<_, i64>(6)? == 1,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                models: Vec::new(),
            })
        })
        .map_err(|error| format!("无法读取 LLM Provider：{error}"))?;

    let mut providers = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 LLM Provider：{error}"))?;

    for provider in &mut providers {
        provider.models = load_provider_models(conn, &provider.id)?;
    }

    Ok(providers)
}

fn load_provider_models(
    conn: &Connection,
    provider_id: &str,
) -> Result<Vec<ProviderModel>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, provider_id, model_id, model_name, is_enabled, created_at, updated_at
            FROM provider_models
            WHERE provider_id = ?1
            ORDER BY created_at ASC
            "#,
        )
        .map_err(|error| format!("无法读取 LLM 模型：{error}"))?;

    let rows = statement
        .query_map(params![provider_id], |row| {
            Ok(ProviderModel {
                id: row.get(0)?,
                provider_id: row.get(1)?,
                model_id: row.get(2)?,
                model_name: row.get(3)?,
                is_enabled: row.get::<_, i64>(4)? == 1,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|error| format!("无法读取 LLM 模型：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 LLM 模型：{error}"))
}

fn workspace_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        path: row.get(3)?,
        is_pinned: row.get::<_, i64>(4)? == 1,
        order: row.get(5)?,
        group_id: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn normalize_group_id(
    conn: &Connection,
    group_id: Option<String>,
) -> Result<Option<String>, String> {
    let default_group_id = load_default_group_id(conn)?;
    let Some(trimmed) = group_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(Some(default_group_id));
    };

    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM workspace_groups WHERE id = ?1",
            params![trimmed],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("无法读取分组：{error}"))?;

    Ok(Some(exists.unwrap_or(default_group_id)))
}

fn load_default_group_id(conn: &Connection) -> Result<String, String> {
    conn.query_row(
        r#"
        SELECT id
        FROM workspace_groups
        WHERE is_default = 1
        ORDER BY "order" ASC, created_at ASC
        LIMIT 1
        "#,
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| format!("无法读取默认分组：{error}"))?
    .ok_or_else(|| "默认分组不存在，请先初始化配置数据库".to_string())
}

fn validate_llm_settings(input: &SaveLlmSettingsInput) -> Result<(), String> {
    for provider in &input.providers {
        if provider.name.trim().is_empty() {
            return Err("Provider 名称不能为空".to_string());
        }

        if provider.vendor.trim().is_empty() {
            return Err("供应商不能为空".to_string());
        }

        if provider.provider.trim().is_empty() {
            return Err("Provider 类型不能为空".to_string());
        }

        for model in &provider.models {
            if model.model_id.trim().is_empty() {
                return Err("模型 ID 不能为空".to_string());
            }

            if model.model_name.trim().is_empty() {
                return Err("模型名称不能为空".to_string());
            }
        }
    }

    Ok(())
}

fn normalize_record_id(id: Option<&str>) -> String {
    id.map(str::trim)
        .filter(|value| is_record_id(value))
        .map(ToOwned::to_owned)
        .unwrap_or_else(new_record_id)
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_skill_names(skill_names: Vec<String>) -> Vec<String> {
    skill_names
        .into_iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn next_workspace_order(conn: &Connection, group_id: Option<&str>) -> Result<i64, String> {
    let max_order: Option<i64> = conn
        .query_row(
            r#"SELECT MAX("order") FROM workspaces WHERE group_id IS ?1"#,
            params![group_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("无法计算工作区排序：{error}"))?;

    Ok(max_order.unwrap_or(-1) + 1)
}

fn now_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}
