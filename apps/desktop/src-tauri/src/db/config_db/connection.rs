use rusqlite::Connection;
use tauri::AppHandle;

use crate::db::paths::config_db_path;

pub(super) fn open_config_connection(app: &AppHandle) -> Result<Connection, String> {
    let db_path = config_db_path(app)?;
    let conn =
        Connection::open(&db_path).map_err(|error| format!("无法打开配置数据库：{error}"))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法启用外键约束：{error}"))?;
    Ok(conn)
}
