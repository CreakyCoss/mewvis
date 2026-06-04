use rusqlite::Connection;

use super::version::{
    database_user_version, set_database_user_version, CONFIG_INITIAL_SCHEMA_VERSION,
    CONFIG_SCHEMA_VERSION,
};
use crate::db::schema::validate_config_schema;

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
            provider_id TEXT,
            provider_kind TEXT NOT NULL,
            base_url TEXT,
            model_id TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            batch_size INTEGER NOT NULL DEFAULT 64,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(provider_id) REFERENCES llm_providers(id) ON DELETE SET NULL
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
