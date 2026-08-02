use rusqlite::{params, Connection, OptionalExtension};
use std::{fs, path::PathBuf};
use tauri::AppHandle;

use super::{
    common::now_millis,
    connection::open_config_connection,
    inputs::{CreateWorkspaceInput, DeleteWorkspaceInput, UpdateWorkspaceInput},
    models::Workspace,
};
use crate::db::{id::new_record_id, paths::default_workspace_path};

const DEFAULT_WORKSPACE_NAME: &str = "默认工作区";
const DEFAULT_WORKSPACE_DESCRIPTION: &str = "用于未绑定具体工作区的会话";

pub fn list_workspaces(app: &AppHandle) -> Result<Vec<Workspace>, String> {
    let conn = open_config_connection(app)?;
    ensure_default_workspace(app, &conn)?;

    let default_path = default_workspace_path(app)?;
    Ok(mark_default_workspaces(
        load_workspaces(&conn)?,
        &default_path,
    ))
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
    if workspace_path == default_workspace_path(app)? {
        return Err("默认工作区由系统管理，不能作为普通工作区创建".to_string());
    }

    fs::create_dir_all(&workspace_path).map_err(|error| format!("无法创建工作区目录：{error}"))?;
    crate::db::setup::initialize_workspace_database(&workspace_path)?;

    let conn = open_config_connection(app)?;
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

pub fn update_workspace(app: &AppHandle, input: UpdateWorkspaceInput) -> Result<Workspace, String> {
    let id = input.id.trim();
    if id.is_empty() {
        return Err("工作区 ID 不能为空".to_string());
    }

    let name = input.name.trim();
    if name.is_empty() {
        return Err("工作区名称不能为空".to_string());
    }

    let workspace_path = PathBuf::from(input.path.trim());
    if workspace_path.as_os_str().is_empty() {
        return Err("请选择工作区目录".to_string());
    }

    let conn = open_config_connection(app)?;
    let current = load_workspace(&conn, id)?.ok_or_else(|| "工作区不存在".to_string())?;
    if PathBuf::from(&current.path) == default_workspace_path(app)? {
        return Err("默认工作区由系统管理，不能编辑".to_string());
    }
    crate::db::setup::initialize_workspace_database(&workspace_path)?;

    let now = now_millis()?;
    let description = input.description.and_then(|value| {
        let trimmed = value.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    });
    let group_id = normalize_group_id(&conn, input.group_id)?;
    let next_order = if current.group_id.as_deref() == group_id.as_deref() {
        current.order
    } else {
        next_workspace_order(&conn, group_id.as_deref())?
    };
    let path = workspace_path.to_string_lossy().to_string();

    conn.execute(
        r#"
        UPDATE workspaces
        SET name = ?1,
            description = ?2,
            path = ?3,
            "order" = ?4,
            group_id = ?5,
            updated_at = ?6
        WHERE id = ?7
        "#,
        params![name, description, path, next_order, group_id, now, id],
    )
    .map_err(|error| format!("无法保存工作区：{error}"))?;

    load_workspace(&conn, id)?.ok_or_else(|| "工作区保存后未能读取".to_string())
}

pub fn delete_workspace(app: &AppHandle, input: DeleteWorkspaceInput) -> Result<(), String> {
    let id = input.id.trim();
    if id.is_empty() {
        return Err("工作区 ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    let current = load_workspace(&conn, id)?.ok_or_else(|| "工作区不存在".to_string())?;
    if PathBuf::from(&current.path) == default_workspace_path(app)? {
        return Err("默认工作区由系统管理，不能删除".to_string());
    }

    conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])
        .map_err(|error| format!("无法删除工作区：{error}"))?;

    Ok(())
}

fn ensure_default_workspace(app: &AppHandle, conn: &Connection) -> Result<Workspace, String> {
    let workspace_path = default_workspace_path(app)?;
    fs::create_dir_all(&workspace_path)
        .map_err(|error| format!("无法创建默认工作区目录：{error}"))?;
    crate::db::setup::initialize_workspace_database(&workspace_path)?;

    let path = workspace_path.to_string_lossy().to_string();
    if let Some(workspace) = load_workspace_by_path(conn, &path)? {
        return Ok(workspace);
    }

    let now = now_millis()?;
    let id = new_record_id();
    let group_id = load_default_group_id(conn)?;
    let next_order = next_workspace_order(conn, Some(&group_id))?;

    conn.execute(
        r#"
        INSERT INTO workspaces (
            id, name, description, path, is_pinned, "order", group_id, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8)
        "#,
        params![
            id,
            DEFAULT_WORKSPACE_NAME,
            DEFAULT_WORKSPACE_DESCRIPTION,
            path,
            next_order,
            group_id,
            now,
            now
        ],
    )
    .map_err(|error| format!("无法保存默认工作区：{error}"))?;

    load_workspace(conn, &id)?.ok_or_else(|| "默认工作区保存后未能读取".to_string())
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

fn load_workspace_by_path(conn: &Connection, path: &str) -> Result<Option<Workspace>, String> {
    conn.query_row(
        r#"
        SELECT id, name, description, path, is_pinned, "order", group_id, created_at, updated_at
        FROM workspaces
        WHERE path = ?1
        ORDER BY created_at ASC
        LIMIT 1
        "#,
        params![path],
        workspace_from_row,
    )
    .optional()
    .map_err(|error| format!("无法读取默认工作区：{error}"))
}

fn workspace_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        path: row.get(3)?,
        is_default: false,
        is_pinned: row.get::<_, i64>(4)? == 1,
        order: row.get(5)?,
        group_id: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn mark_default_workspaces(
    mut workspaces: Vec<Workspace>,
    default_path: &PathBuf,
) -> Vec<Workspace> {
    for workspace in &mut workspaces {
        workspace.is_default = PathBuf::from(&workspace.path).as_path() == default_path.as_path();
    }

    workspaces
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
