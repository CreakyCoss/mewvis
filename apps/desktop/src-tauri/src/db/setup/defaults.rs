use rusqlite::{params, Connection, OptionalExtension};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::id::new_record_id;

pub(super) fn seed_config_defaults(conn: &Connection) -> Result<(), String> {
    let default_group_id = ensure_default_group(conn)?;
    normalize_default_group_flags(conn, &default_group_id)
}

fn ensure_default_group(conn: &Connection) -> Result<String, String> {
    if let Some(id) = existing_default_group_id(conn)? {
        return Ok(id);
    }

    let id = new_record_id();
    let now = now_millis()?;
    conn.execute(
        r#"
        INSERT INTO workspace_groups (id, name, "order", is_default, created_at, updated_at)
        VALUES (?1, '默认分组', 0, 1, ?2, ?3)
        "#,
        params![id, now, now],
    )
    .map_err(|error| format!("默认分组初始化失败：{error}"))?;
    Ok(id)
}

fn existing_default_group_id(conn: &Connection) -> Result<Option<String>, String> {
    let explicit_default = conn
        .query_row(
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
        .map_err(|error| format!("无法读取默认分组：{error}"))?;

    if explicit_default.is_some() {
        return Ok(explicit_default);
    }

    conn.query_row(
        r#"
        SELECT id
        FROM workspace_groups
        WHERE name = '默认分组'
        ORDER BY "order" ASC, created_at ASC
        LIMIT 1
        "#,
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(|error| format!("无法读取默认分组：{error}"))
}

fn normalize_default_group_flags(conn: &Connection, default_group_id: &str) -> Result<(), String> {
    let now = now_millis()?;
    conn.execute(
        "UPDATE workspace_groups SET is_default = 1, updated_at = ?2 WHERE id = ?1",
        params![default_group_id, now],
    )
    .map_err(|error| format!("无法设置默认分组：{error}"))?;
    conn.execute(
        "UPDATE workspace_groups SET is_default = 0 WHERE id <> ?1 AND is_default = 1",
        params![default_group_id],
    )
    .map_err(|error| format!("无法规范默认分组标记：{error}"))?;
    Ok(())
}

fn now_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}
