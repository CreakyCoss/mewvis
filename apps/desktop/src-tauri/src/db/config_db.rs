use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const DEFAULT_GROUP_ID: &str = "default";

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub group_id: Option<String>,
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

pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    migrate(&conn)?;
    seed_default_group(&conn)?;
    Ok(())
}

pub fn overview(app: &AppHandle) -> Result<WorkspaceOverview, String> {
    initialize(app)?;
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

pub fn create_workspace(app: &AppHandle, input: CreateWorkspaceInput) -> Result<Workspace, String> {
    initialize(app)?;

    let name = input.name.trim();
    if name.is_empty() {
        return Err("工作区名称不能为空".to_string());
    }

    let workspace_path = PathBuf::from(input.path.trim());
    if workspace_path.as_os_str().is_empty() {
        return Err("请选择工作区目录".to_string());
    }

    fs::create_dir_all(&workspace_path).map_err(|error| format!("无法创建工作区目录：{error}"))?;
    create_workspace_db(&workspace_path)?;

    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    migrate(&conn)?;
    seed_default_group(&conn)?;

    let now = now_millis()?;
    let id = format!("workspace-{now}");
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

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS workspace_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            "order" INTEGER DEFAULT 0,
            is_default INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            path TEXT NOT NULL,
            is_pinned INTEGER DEFAULT 0,
            "order" INTEGER DEFAULT 0,
            group_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (group_id) REFERENCES workspace_groups(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS llm_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            api_key TEXT,
            base_url TEXT,
            is_default INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_models (
            id TEXT PRIMARY KEY,
            provider_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            model_name TEXT NOT NULL,
            is_enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
            UNIQUE(provider_id, model_id)
        );
        "#,
    )
    .map_err(|error| format!("配置数据库迁移失败：{error}"))?;
    Ok(())
}

fn seed_default_group(conn: &Connection) -> Result<(), String> {
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO workspace_groups (id, name, "order", is_default, created_at, updated_at)
        VALUES (?1, '默认分组', 0, 1, ?2, ?3)
        ON CONFLICT(id) DO UPDATE SET is_default = 1
        "#,
        params![DEFAULT_GROUP_ID, now, now],
    )
    .map_err(|error| format!("默认分组初始化失败：{error}"))?;
    Ok(())
}

fn create_workspace_db(workspace_path: &Path) -> Result<(), String> {
    let db_path = workspace_path.join("workspace.db");
    let conn =
        Connection::open(db_path).map_err(|error| format!("无法创建工作区数据库：{error}"))?;
    conn.execute_batch("PRAGMA user_version = 1;")
        .map_err(|error| format!("工作区数据库初始化失败：{error}"))?;
    Ok(())
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
    let trimmed = group_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_GROUP_ID.to_string());

    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM workspace_groups WHERE id = ?1",
            params![trimmed],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("无法读取分组：{error}"))?;

    Ok(Some(exists.unwrap_or_else(|| DEFAULT_GROUP_ID.to_string())))
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
