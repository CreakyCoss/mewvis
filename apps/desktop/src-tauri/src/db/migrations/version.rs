use rusqlite::Connection;

// Current config schema was already stamped as version 3 during development.
// Keep that as the baseline; future config migrations start at version 4.
pub(super) const CONFIG_INITIAL_SCHEMA_VERSION: i64 = 3;
pub(crate) const CONFIG_SCHEMA_VERSION: i64 = 3;
pub(super) const WORKSPACE_INITIAL_SCHEMA_VERSION: i64 = 1;
pub(crate) const WORKSPACE_SCHEMA_VERSION: i64 = 1;

pub(crate) fn database_user_version(conn: &Connection) -> Result<i64, String> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| format!("无法读取数据库版本：{error}"))
}

pub(super) fn set_database_user_version(conn: &Connection, version: i64) -> Result<(), String> {
    conn.execute_batch(&format!("PRAGMA user_version = {version};"))
        .map_err(|error| format!("无法写入数据库版本：{error}"))
}
