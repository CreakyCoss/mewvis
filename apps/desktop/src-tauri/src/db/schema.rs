use rusqlite::Connection;
use std::collections::BTreeSet;

use super::sqlite::table_columns;

struct DatabaseTableSchema {
    name: &'static str,
    columns: &'static [&'static str],
    create_sql: &'static str,
}

const CONFIG_TABLE_SCHEMAS: &[DatabaseTableSchema] = &[
    DatabaseTableSchema {
        name: "workspace_groups",
        columns: &[
            "id",
            "name",
            "order",
            "is_default",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS workspace_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                "order" INTEGER DEFAULT 0,
                is_default INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "workspaces",
        columns: &[
            "id",
            "name",
            "description",
            "path",
            "is_pinned",
            "order",
            "group_id",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
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
        "#,
    },
    DatabaseTableSchema {
        name: "llm_providers",
        columns: &[
            "id",
            "name",
            "vendor",
            "provider",
            "api_key",
            "base_url",
            "is_default",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS llm_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                vendor TEXT NOT NULL DEFAULT '',
                provider TEXT NOT NULL,
                api_key TEXT,
                base_url TEXT,
                is_default INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "provider_models",
        columns: &[
            "id",
            "provider_id",
            "model_id",
            "model_name",
            "is_enabled",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
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
    },
    DatabaseTableSchema {
        name: "workspace_enabled_skills",
        columns: &["workspace_id", "skill_name", "created_at", "updated_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS workspace_enabled_skills (
                workspace_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (workspace_id, skill_name),
                FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
            );
        "#,
    },
    DatabaseTableSchema {
        name: "ai_agents",
        columns: &[
            "id",
            "name",
            "avatar",
            "description",
            "provider_id",
            "model_id",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS ai_agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar TEXT NOT NULL,
                description TEXT,
                provider_id TEXT NOT NULL,
                model_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
                FOREIGN KEY (model_id) REFERENCES provider_models(id) ON DELETE CASCADE
            );
        "#,
    },
];

const WORKSPACE_TABLE_SCHEMAS: &[DatabaseTableSchema] = &[];

pub(crate) fn create_config_schema(conn: &Connection) -> Result<(), String> {
    create_database_schema(conn, "配置数据库", CONFIG_TABLE_SCHEMAS)
}

pub(crate) fn create_workspace_schema(conn: &Connection) -> Result<(), String> {
    create_database_schema(conn, "工作区数据库", WORKSPACE_TABLE_SCHEMAS)
}

pub(crate) fn validate_config_schema(conn: &Connection) -> Result<(), String> {
    validate_database_schema(conn, "配置数据库", CONFIG_TABLE_SCHEMAS)
}

pub(crate) fn validate_workspace_schema(conn: &Connection) -> Result<(), String> {
    validate_database_schema(conn, "工作区数据库", WORKSPACE_TABLE_SCHEMAS)
}

fn create_database_schema(
    conn: &Connection,
    database_label: &str,
    tables: &[DatabaseTableSchema],
) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("{database_label}启用外键失败：{error}"))?;

    for table in tables {
        conn.execute_batch(table.create_sql)
            .map_err(|error| format!("{database_label}初始化表 {} 失败：{error}", table.name))?;
    }

    Ok(())
}

fn validate_database_schema(
    conn: &Connection,
    database_label: &str,
    tables: &[DatabaseTableSchema],
) -> Result<(), String> {
    for table in tables {
        validate_table_columns(conn, database_label, table)?;
    }

    Ok(())
}

fn validate_table_columns(
    conn: &Connection,
    database_label: &str,
    table: &DatabaseTableSchema,
) -> Result<(), String> {
    let actual_columns = table_columns(conn, table.name)?;
    if actual_columns.is_empty() {
        return Err(format!(
            "{database_label}结构校验失败，缺少表 {}。请备份后删除数据库并重启应用重建",
            table.name
        ));
    }

    let expected = table.columns.iter().copied().collect::<BTreeSet<_>>();
    let actual = actual_columns
        .iter()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();

    let missing = expected
        .difference(&actual)
        .copied()
        .collect::<Vec<_>>()
        .join(", ");
    let extra = actual
        .difference(&expected)
        .copied()
        .collect::<Vec<_>>()
        .join(", ");

    if missing.is_empty() && extra.is_empty() {
        return Ok(());
    }

    let mut details = Vec::new();
    if !missing.is_empty() {
        details.push(format!("缺少字段 {missing}"));
    }
    if !extra.is_empty() {
        details.push(format!("多余字段 {extra}"));
    }

    Err(format!(
        "{database_label}结构校验失败，表 {} 字段不一致：{}。请备份后删除数据库并重启应用重建",
        table.name,
        details.join("；")
    ))
}
