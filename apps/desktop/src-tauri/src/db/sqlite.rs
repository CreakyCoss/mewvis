use rusqlite::Connection;

pub(crate) fn database_has_user_tables(conn: &Connection) -> Result<bool, String> {
    conn.query_row(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        )
        "#,
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value == 1)
    .map_err(|error| format!("无法读取数据库表结构：{error}"))
}

pub(crate) fn user_table_names(conn: &Connection) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            r#"
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name ASC
            "#,
        )
        .map_err(|error| format!("无法读取数据库表列表：{error}"))?;
    let table_names = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取数据库表列表：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析数据库表列表：{error}"))?;
    Ok(table_names)
}

pub(crate) fn table_columns(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(&format!(
            "PRAGMA table_info({})",
            quote_identifier(table_name)
        ))
        .map_err(|error| format!("无法读取表结构 {table_name}：{error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取表字段 {table_name}：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析表字段 {table_name}：{error}"))?;
    Ok(columns)
}

pub(crate) fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}
