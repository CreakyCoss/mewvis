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
        name: "stories",
        columns: &["id", "name", "workspace_path", "created_at", "updated_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS stories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                workspace_path TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "llm_providers",
        columns: &[
            "id",
            "name",
            "provider",
            "api_format",
            "api_key",
            "api_endpoint",
            "is_default",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS llm_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider TEXT NOT NULL DEFAULT '',
                api_format TEXT NOT NULL,
                api_key TEXT,
                api_endpoint TEXT,
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
            "is_one_million_context",
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
                is_one_million_context INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
                UNIQUE(provider_id, model_id)
            );
        "#,
    },
    DatabaseTableSchema {
        name: "skill_groups",
        columns: &[
            "id",
            "name",
            "description",
            "order",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS skill_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                "order" INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "skill_settings",
        columns: &["key", "value", "updated_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS skill_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "skill_group_skills",
        columns: &["group_id", "skill_name", "disabled", "created_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS skill_group_skills (
                group_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                disabled INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(group_id, skill_name),
                FOREIGN KEY(group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
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
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS ai_agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "collaboration_workflows",
        columns: &[
            "id",
            "name",
            "description",
            "writer_agent_id",
            "reviewer_agent_id",
            "draft_instruction",
            "review_instruction",
            "revise_instruction",
            "steps_json",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS collaboration_workflows (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                writer_agent_id TEXT NOT NULL,
                reviewer_agent_id TEXT NOT NULL,
                draft_instruction TEXT,
                review_instruction TEXT,
                revise_instruction TEXT,
                steps_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "agent_runtime_settings",
        columns: &["key", "value_json", "updated_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS agent_runtime_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "knowledge_collections",
        columns: &[
            "id",
            "name",
            "description",
            "color",
            "order",
            "enabled",
            "embedding_profile_id",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS knowledge_collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT,
                "order" INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                embedding_profile_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(name)
            );
        "#,
    },
    DatabaseTableSchema {
        name: "knowledge_sources",
        columns: &[
            "id",
            "kind",
            "uri",
            "title",
            "description",
            "enabled",
            "include_patterns_json",
            "exclude_patterns_json",
            "metadata_json",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS knowledge_sources (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                uri TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                include_patterns_json TEXT,
                exclude_patterns_json TEXT,
                metadata_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(kind, uri)
            );
        "#,
    },
    DatabaseTableSchema {
        name: "knowledge_collection_sources",
        columns: &["collection_id", "source_id", "created_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS knowledge_collection_sources (
                collection_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(collection_id, source_id),
                FOREIGN KEY(collection_id) REFERENCES knowledge_collections(id) ON DELETE CASCADE,
                FOREIGN KEY(source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
            );
        "#,
    },
    DatabaseTableSchema {
        name: "knowledge_settings",
        columns: &["key", "value_json", "updated_at"],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS knowledge_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        "#,
    },
    DatabaseTableSchema {
        name: "embedding_profiles",
        columns: &[
            "id",
            "name",
            "provider_kind",
            "base_url",
            "api_key",
            "model_id",
            "dimensions",
            "batch_size",
            "is_default",
            "created_at",
            "updated_at",
        ],
        create_sql: r#"
            CREATE TABLE IF NOT EXISTS embedding_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider_kind TEXT NOT NULL,
                base_url TEXT,
                api_key TEXT,
                model_id TEXT NOT NULL,
                dimensions INTEGER NOT NULL,
                batch_size INTEGER NOT NULL DEFAULT 64,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
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
