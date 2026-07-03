use rusqlite::{OptionalExtension, params};
use std::{fs, path::PathBuf};
use tauri::AppHandle;

use super::{
    common::now_millis,
    connection::open_config_connection,
    inputs::{CreateStoryRecordInput, DeleteStoryRecordInput, UpdateStoryRecordInput},
    models::StoryRecord,
};
use crate::db::id::new_record_id;

pub fn list_story_records(app: &AppHandle) -> Result<Vec<StoryRecord>, String> {
    let conn = open_config_connection(app)?;
    let mut statement = conn
        .prepare(
            r#"
            SELECT id, name, workspace_path, created_at, updated_at
            FROM stories
            ORDER BY updated_at DESC, created_at DESC
            "#,
        )
        .map_err(|error| format!("无法读取故事列表：{error}"))?;

    let rows = statement
        .query_map([], story_record_from_row)
        .map_err(|error| format!("无法读取故事列表：{error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析故事列表：{error}"))
}

pub fn create_story_record(
    app: &AppHandle,
    input: CreateStoryRecordInput,
) -> Result<StoryRecord, String> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err("故事名不能为空".to_string());
    }

    let workspace_path = normalize_story_workspace_path(&input.workspace_path)?;
    fs::create_dir_all(&workspace_path).map_err(|error| format!("无法创建故事工作区：{error}"))?;

    let conn = open_config_connection(app)?;
    let now = now_millis()?;
    let id = new_record_id();
    let path = workspace_path.to_string_lossy().to_string();

    conn.execute(
        r#"
        INSERT INTO stories (id, name, workspace_path, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![id, name, path, now, now],
    )
    .map_err(|error| format!("无法保存故事记录：{error}"))?;

    load_story_record(&conn, &id)?.ok_or_else(|| "故事记录保存后未能读取".to_string())
}

pub fn update_story_record(
    app: &AppHandle,
    input: UpdateStoryRecordInput,
) -> Result<StoryRecord, String> {
    let id = input.id.trim();
    if id.is_empty() {
        return Err("故事 ID 不能为空".to_string());
    }

    let name = input.name.trim();
    if name.is_empty() {
        return Err("故事名不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    let now = now_millis()?;
    conn.execute(
        r#"
        UPDATE stories
        SET name = ?1, updated_at = ?2
        WHERE id = ?3
        "#,
        params![name, now, id],
    )
    .map_err(|error| format!("无法更新故事记录：{error}"))?;

    load_story_record(&conn, id)?.ok_or_else(|| "故事记录不存在".to_string())
}

pub fn delete_story_record(app: &AppHandle, input: DeleteStoryRecordInput) -> Result<(), String> {
    let id = input.id.trim();
    if id.is_empty() {
        return Err("故事 ID 不能为空".to_string());
    }

    let conn = open_config_connection(app)?;
    let record = load_story_record(&conn, id)?.ok_or_else(|| "故事记录不存在".to_string())?;

    let workspace_path = PathBuf::from(record.workspace_path);
    if workspace_path.exists() {
        ensure_removable_story_workspace(&workspace_path)?;
        fs::remove_dir_all(&workspace_path)
            .map_err(|error| format!("无法删除故事工作区：{error}"))?;
    }

    conn.execute("DELETE FROM stories WHERE id = ?1", params![id])
        .map_err(|error| format!("无法删除故事记录：{error}"))?;

    Ok(())
}

fn load_story_record(conn: &rusqlite::Connection, id: &str) -> Result<Option<StoryRecord>, String> {
    conn.query_row(
        r#"
        SELECT id, name, workspace_path, created_at, updated_at
        FROM stories
        WHERE id = ?1
        "#,
        params![id],
        story_record_from_row,
    )
    .optional()
    .map_err(|error| format!("无法读取故事记录：{error}"))
}

fn story_record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoryRecord> {
    Ok(StoryRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        workspace_path: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn normalize_story_workspace_path(value: &str) -> Result<PathBuf, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("请选择故事工作区".to_string());
    }

    Ok(PathBuf::from(trimmed))
}

fn ensure_removable_story_workspace(path: &PathBuf) -> Result<(), String> {
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("无法定位故事工作区：{error}"))?;

    if canonical.parent().is_none() {
        return Err("不能删除文件系统根目录".to_string());
    }

    Ok(())
}
