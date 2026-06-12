use rusqlite::Connection;

use super::version::{
    database_user_version, set_database_user_version, CONFIG_INITIAL_SCHEMA_VERSION,
    CONFIG_SCHEMA_VERSION,
};
use crate::db::{schema::validate_config_schema, sqlite::table_columns};

struct ConfigMigrationStep {
    target_version: i64,
    name: &'static str,
    run: fn(&Connection) -> Result<(), String>,
}

const CONFIG_MIGRATIONS: &[ConfigMigrationStep] = &[
    // Bump CONFIG_SCHEMA_VERSION only with a matching target_version step.
    ConfigMigrationStep {
        target_version: 4,
        name: "add_knowledge_library",
        run: add_knowledge_library,
    },
    ConfigMigrationStep {
        target_version: 5,
        name: "add_embedding_profile_base_url",
        run: add_embedding_profile_base_url,
    },
    ConfigMigrationStep {
        target_version: 6,
        name: "add_collaboration_workflows",
        run: add_collaboration_workflows,
    },
    ConfigMigrationStep {
        target_version: 7,
        name: "add_collaboration_workflow_steps",
        run: add_collaboration_workflow_steps,
    },
    ConfigMigrationStep {
        target_version: 8,
        name: "rename_llm_provider_runtime_columns",
        run: rename_llm_provider_runtime_columns,
    },
    ConfigMigrationStep {
        target_version: 9,
        name: "add_provider_model_one_million_context",
        run: add_provider_model_one_million_context,
    },
    ConfigMigrationStep {
        target_version: 10,
        name: "add_embedding_profile_api_key",
        run: add_embedding_profile_api_key,
    },
    ConfigMigrationStep {
        target_version: 11,
        name: "drop_embedding_profile_provider_id",
        run: drop_embedding_profile_provider_id,
    },
];

fn add_knowledge_library(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS knowledge_collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            color TEXT,
            "order" INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(name)
        );

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

        CREATE TABLE IF NOT EXISTS knowledge_collection_sources (
            collection_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(collection_id, source_id),
            FOREIGN KEY(collection_id) REFERENCES knowledge_collections(id) ON DELETE CASCADE,
            FOREIGN KEY(source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS knowledge_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

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
    )
    .map_err(|error| format!("无法创建知识库配置表：{error}"))
}

fn add_embedding_profile_base_url(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare("PRAGMA table_info(embedding_profiles)")
        .map_err(|error| format!("无法读取 Embedding 配置表结构：{error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取 Embedding 配置表字段：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 Embedding 配置表字段：{error}"))?;

    if columns.iter().any(|column| column == "base_url") {
        return Ok(());
    }

    conn.execute_batch("ALTER TABLE embedding_profiles ADD COLUMN base_url TEXT;")
        .map_err(|error| format!("无法添加 Embedding 地址配置：{error}"))
}

fn add_embedding_profile_api_key(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "embedding_profiles")?;

    if columns.iter().any(|column| column == "api_key") {
        return Ok(());
    }

    conn.execute_batch("ALTER TABLE embedding_profiles ADD COLUMN api_key TEXT;")
        .map_err(|error| format!("无法添加 Embedding API Key 配置：{error}"))
}

fn drop_embedding_profile_provider_id(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "embedding_profiles")?;

    if !columns.iter().any(|column| column == "provider_id") {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        CREATE TABLE embedding_profiles_next (
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

        INSERT INTO embedding_profiles_next (
            id, name, provider_kind, base_url, api_key, model_id,
            dimensions, batch_size, is_default, created_at, updated_at
        )
        SELECT
            id, name, provider_kind, base_url, api_key, model_id,
            dimensions, batch_size, is_default, created_at, updated_at
        FROM embedding_profiles;

        DROP TABLE embedding_profiles;
        ALTER TABLE embedding_profiles_next RENAME TO embedding_profiles;
        "#,
    )
    .map_err(|error| format!("无法移除 Embedding Provider 关联字段：{error}"))
}

fn add_collaboration_workflows(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
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
    )
    .map_err(|error| format!("无法创建协作流程配置表：{error}"))
}

fn add_collaboration_workflow_steps(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare("PRAGMA table_info(collaboration_workflows)")
        .map_err(|error| format!("无法读取协作流程配置表结构：{error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取协作流程配置表字段：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析协作流程配置表字段：{error}"))?;

    if columns.iter().any(|column| column == "steps_json") {
        return Ok(());
    }

    conn.execute_batch("ALTER TABLE collaboration_workflows ADD COLUMN steps_json TEXT;")
        .map_err(|error| format!("无法添加协作流程步骤配置：{error}"))
}

fn rename_llm_provider_runtime_columns(conn: &Connection) -> Result<(), String> {
    let mut columns = table_columns(conn, "llm_providers")?;

    if columns.iter().any(|column| column == "provider")
        && columns.iter().any(|column| column == "api_format")
        && columns.iter().any(|column| column == "api_endpoint")
    {
        return Ok(());
    }

    if columns.iter().any(|column| column == "provider")
        && !columns.iter().any(|column| column == "api_format")
    {
        conn.execute_batch("ALTER TABLE llm_providers RENAME COLUMN provider TO api_format;")
            .map_err(|error| format!("无法迁移 LLM API Format 字段：{error}"))?;
        columns = table_columns(conn, "llm_providers")?;
    }

    if columns.iter().any(|column| column == "vendor")
        && !columns.iter().any(|column| column == "provider")
    {
        conn.execute_batch("ALTER TABLE llm_providers RENAME COLUMN vendor TO provider;")
            .map_err(|error| format!("无法迁移 LLM Provider 字段：{error}"))?;
        columns = table_columns(conn, "llm_providers")?;
    }

    if !columns.iter().any(|column| column == "provider") {
        conn.execute_batch(
            "ALTER TABLE llm_providers ADD COLUMN provider TEXT NOT NULL DEFAULT '';",
        )
        .map_err(|error| format!("无法添加 LLM Provider 字段：{error}"))?;
        columns = table_columns(conn, "llm_providers")?;
    }

    if columns.iter().any(|column| column == "base_url")
        && !columns.iter().any(|column| column == "api_endpoint")
    {
        conn.execute_batch("ALTER TABLE llm_providers RENAME COLUMN base_url TO api_endpoint;")
            .map_err(|error| format!("无法迁移 LLM API Endpoint 字段：{error}"))?;
        columns = table_columns(conn, "llm_providers")?;
    }

    if !columns.iter().any(|column| column == "api_endpoint") {
        conn.execute_batch("ALTER TABLE llm_providers ADD COLUMN api_endpoint TEXT;")
            .map_err(|error| format!("无法添加 LLM API Endpoint 字段：{error}"))?;
    }

    Ok(())
}

fn add_provider_model_one_million_context(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "provider_models")?;

    if columns
        .iter()
        .any(|column| column == "is_one_million_context")
    {
        return Ok(());
    }

    conn.execute_batch(
        "ALTER TABLE provider_models ADD COLUMN is_one_million_context INTEGER DEFAULT 0;",
    )
    .map_err(|error| format!("无法添加 LLM 模型 1M 标记字段：{error}"))
}

pub(crate) fn run_config_migrations(
    conn: &Connection,
    is_new_database: bool,
) -> Result<(), String> {
    validate_config_migrations()?;

    let mut current_version = database_user_version(conn)?;
    if is_new_database {
        set_database_user_version(conn, CONFIG_SCHEMA_VERSION)?;
        validate_config_schema(conn)?;
        return Ok(());
    }
    if current_version == 0 {
        validate_config_schema(conn)?;
        set_database_user_version(conn, CONFIG_SCHEMA_VERSION)?;
        return Ok(());
    }
    if current_version > CONFIG_SCHEMA_VERSION {
        return Err(format!(
            "配置数据库版本 {current_version} 高于当前应用支持的版本 {CONFIG_SCHEMA_VERSION}"
        ));
    }

    for migration in CONFIG_MIGRATIONS {
        if current_version >= migration.target_version {
            continue;
        }

        run_config_migration_step(conn, current_version, migration)?;
        current_version = migration.target_version;
    }

    if current_version < CONFIG_SCHEMA_VERSION {
        return Err(format!(
            "配置数据库版本 {current_version} 低于目标版本 {CONFIG_SCHEMA_VERSION}，但没有可执行的迁移脚本"
        ));
    }

    validate_config_schema(conn)?;
    Ok(())
}

fn validate_config_migrations() -> Result<(), String> {
    let mut previous_version = CONFIG_INITIAL_SCHEMA_VERSION;
    for migration in CONFIG_MIGRATIONS {
        if migration.target_version <= previous_version {
            return Err(format!("配置数据库迁移版本必须递增：{}", migration.name));
        }

        if migration.target_version > CONFIG_SCHEMA_VERSION {
            return Err(format!(
                "配置数据库迁移版本超过目标版本：{} -> {}",
                migration.name, migration.target_version
            ));
        }

        previous_version = migration.target_version;
    }

    if previous_version != CONFIG_SCHEMA_VERSION {
        return Err(format!(
            "配置数据库目标版本为 {CONFIG_SCHEMA_VERSION}，但迁移列表只覆盖到 {previous_version}"
        ));
    }

    Ok(())
}

fn run_config_migration_step(
    conn: &Connection,
    current_version: i64,
    migration: &ConfigMigrationStep,
) -> Result<(), String> {
    conn.execute_batch("BEGIN IMMEDIATE;")
        .map_err(|error| format!("无法开始配置数据库迁移事务：{error}"))?;

    let result = (migration.run)(conn)
        .and_then(|_| set_database_user_version(conn, migration.target_version))
        .and_then(|_| {
            conn.execute_batch("COMMIT;")
                .map_err(|error| format!("无法提交配置数据库迁移事务：{error}"))
        });

    if let Err(error) = result {
        let _ = conn.execute_batch("ROLLBACK;");
        return Err(format!(
            "配置数据库迁移 {} -> {} ({}) 失败：{error}",
            current_version, migration.target_version, migration.name
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn rename_llm_provider_runtime_columns_preserves_existing_values() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE llm_providers (
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
        )
        .expect("create old provider table");
        conn.execute(
            r#"
            INSERT INTO llm_providers (
                id, name, vendor, provider, api_key, base_url, is_default, created_at, updated_at
            ) VALUES (?1, 'DeepSeek', 'deepseek', 'openai-completions', 'key', 'https://api.deepseek.com', 1, 1, 1)
            "#,
            params!["provider-1"],
        )
        .expect("insert old provider");

        rename_llm_provider_runtime_columns(&conn).expect("rename provider columns");

        let columns = table_columns(&conn, "llm_providers").expect("read columns");
        assert!(columns.iter().any(|column| column == "provider"));
        assert!(columns.iter().any(|column| column == "api_format"));
        assert!(columns.iter().any(|column| column == "api_endpoint"));
        assert!(!columns.iter().any(|column| column == "vendor"));
        assert!(!columns.iter().any(|column| column == "base_url"));

        let (provider, api_format, api_endpoint): (String, String, Option<String>) = conn
            .query_row(
                "SELECT provider, api_format, api_endpoint FROM llm_providers WHERE id = ?1",
                params!["provider-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read migrated provider");

        assert_eq!(provider, "deepseek");
        assert_eq!(api_format, "openai-completions");
        assert_eq!(api_endpoint.as_deref(), Some("https://api.deepseek.com"));
    }

    #[test]
    fn add_provider_model_one_million_context_defaults_to_false() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE provider_models (
                id TEXT PRIMARY KEY,
                provider_id TEXT NOT NULL,
                model_id TEXT NOT NULL,
                model_name TEXT NOT NULL,
                is_enabled INTEGER DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            INSERT INTO provider_models (
                id, provider_id, model_id, model_name, is_enabled, created_at, updated_at
            ) VALUES (
                'model-1', 'provider-1', 'gpt-4.1', 'GPT 4.1', 1, 1, 1
            );
            "#,
        )
        .expect("create old model table");

        add_provider_model_one_million_context(&conn).expect("add 1m column");

        let value: i64 = conn
            .query_row(
                "SELECT is_one_million_context FROM provider_models WHERE id = ?1",
                params!["model-1"],
                |row| row.get(0),
            )
            .expect("read 1m flag");

        assert_eq!(value, 0);
    }

    #[test]
    fn drop_embedding_profile_provider_id_preserves_profile_data() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE embedding_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider_id TEXT,
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

            INSERT INTO embedding_profiles (
                id, name, provider_id, provider_kind, base_url, api_key,
                model_id, dimensions, batch_size, is_default, created_at, updated_at
            ) VALUES (
                'embedding-1', 'Default Embedding', 'provider-1', 'openai-compatible',
                'https://api.example.com/v1', 'key', 'text-embedding-3-small',
                1536, 32, 1, 1, 2
            );
            "#,
        )
        .expect("create old embedding table");

        drop_embedding_profile_provider_id(&conn).expect("drop provider id column");

        let columns = table_columns(&conn, "embedding_profiles").expect("read columns");
        assert!(!columns.iter().any(|column| column == "provider_id"));
        assert!(columns.iter().any(|column| column == "api_key"));

        let (name, api_key, model_id): (String, Option<String>, String) = conn
            .query_row(
                "SELECT name, api_key, model_id FROM embedding_profiles WHERE id = ?1",
                params!["embedding-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read migrated embedding profile");

        assert_eq!(name, "Default Embedding");
        assert_eq!(api_key.as_deref(), Some("key"));
        assert_eq!(model_id, "text-embedding-3-small");
    }
}
