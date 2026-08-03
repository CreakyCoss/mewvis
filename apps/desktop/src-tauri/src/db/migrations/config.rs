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
    ConfigMigrationStep {
        target_version: 12,
        name: "add_skill_groups",
        run: add_skill_groups,
    },
    ConfigMigrationStep {
        target_version: 13,
        name: "drop_workspace_enabled_skills",
        run: drop_workspace_enabled_skills,
    },
    ConfigMigrationStep {
        target_version: 14,
        name: "add_skill_group_default_flag",
        run: add_skill_group_default_flag,
    },
    ConfigMigrationStep {
        target_version: 15,
        name: "add_skill_settings",
        run: add_skill_settings,
    },
    ConfigMigrationStep {
        target_version: 16,
        name: "drop_ai_agent_model_binding",
        run: drop_ai_agent_model_binding,
    },
    ConfigMigrationStep {
        target_version: 17,
        name: "add_skill_group_skill_disabled_flag",
        run: add_skill_group_skill_disabled_flag,
    },
    ConfigMigrationStep {
        target_version: 18,
        name: "normalize_skill_group_member_disabled_flag",
        run: normalize_skill_group_member_disabled_flag,
    },
    ConfigMigrationStep {
        target_version: 19,
        name: "add_agent_runtime_settings",
        run: add_agent_runtime_settings,
    },
    ConfigMigrationStep {
        target_version: 20,
        name: "add_story_registry",
        run: add_story_registry,
    },
    ConfigMigrationStep {
        target_version: 21,
        name: "clear_legacy_story_registry",
        run: clear_legacy_story_registry,
    },
    ConfigMigrationStep {
        target_version: 22,
        name: "remove_readonly_skill_group_members",
        run: remove_readonly_skill_group_members,
    },
    ConfigMigrationStep {
        target_version: 23,
        name: "bind_embedding_profiles_to_knowledge_collections",
        run: bind_embedding_profiles_to_knowledge_collections,
    },
];

fn add_story_registry(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS stories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            workspace_path TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("无法创建故事索引表：{error}"))
}

fn clear_legacy_story_registry(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM stories", [])
        .map_err(|error| format!("无法清理旧故事索引：{error}"))?;
    Ok(())
}

fn remove_readonly_skill_group_members(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM skill_settings WHERE key = 'readonly_skill_group_members'",
        [],
    )
    .map_err(|error| format!("无法删除旧版内置 Skill 分组成员设置：{error}"))?;
    Ok(())
}

fn bind_embedding_profiles_to_knowledge_collections(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "knowledge_collections")?;
    if !columns
        .iter()
        .any(|column| column == "embedding_profile_id")
    {
        conn.execute_batch(
            "ALTER TABLE knowledge_collections ADD COLUMN embedding_profile_id TEXT;",
        )
        .map_err(|error| format!("无法添加知识库 Embedding 绑定：{error}"))?;
    }

    conn.execute_batch(
        r#"
        UPDATE knowledge_collections
        SET embedding_profile_id = COALESCE(
            (
                SELECT id
                FROM embedding_profiles
                WHERE is_default = 1
                ORDER BY created_at ASC
                LIMIT 1
            ),
            (
                SELECT id
                FROM embedding_profiles
                ORDER BY created_at ASC
                LIMIT 1
            )
        )
        WHERE embedding_profile_id IS NULL;
        "#,
    )
    .map_err(|error| format!("无法迁移知识库 Embedding 绑定：{error}"))?;

    Ok(())
}

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

fn add_skill_groups(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS skill_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            "order" INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS skill_group_skills (
            group_id TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            disabled INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            PRIMARY KEY(group_id, skill_name),
            FOREIGN KEY(group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS skill_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("无法创建 Skill 分组配置表：{error}"))
}

fn drop_workspace_enabled_skills(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("DROP TABLE IF EXISTS workspace_enabled_skills;")
        .map_err(|error| format!("无法移除工作区 Skill 启用配置表：{error}"))
}

fn add_skill_group_default_flag(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "skill_groups")?;

    if columns.iter().any(|column| column == "is_default") {
        return Ok(());
    }

    conn.execute_batch("ALTER TABLE skill_groups ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;")
        .map_err(|error| format!("无法添加 Skill 默认分组标记：{error}"))
}

fn add_skill_group_skill_disabled_flag(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "skill_group_skills")?;

    if columns.iter().any(|column| column == "disabled") {
        return Ok(());
    }

    conn.execute_batch(
        "ALTER TABLE skill_group_skills ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;",
    )
    .map_err(|error| format!("无法添加 Skill 分组成员禁用标记：{error}"))
}

fn normalize_skill_group_member_disabled_flag(conn: &Connection) -> Result<(), String> {
    add_skill_group_skill_disabled_flag(conn)?;
    drop_skill_group_disabled_flag(conn)
}

fn drop_skill_group_disabled_flag(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "skill_groups")?;

    if !columns.iter().any(|column| column == "disabled") {
        return Ok(());
    }

    conn.execute_batch("ALTER TABLE skill_groups DROP COLUMN disabled;")
        .map_err(|error| format!("无法移除 Skill 分组禁用标记：{error}"))
}

fn add_skill_settings(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS skill_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("无法创建 Skill 设置表：{error}"))?;

    let columns = table_columns(conn, "skill_groups")?;
    if !columns.iter().any(|column| column == "is_default") {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = OFF;

        CREATE TABLE skill_groups_next (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            "order" INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        INSERT INTO skill_groups_next (
            id, name, description, "order", created_at, updated_at
        )
        SELECT
            id, name, description, "order", created_at, updated_at
        FROM skill_groups;

        DROP TABLE skill_groups;
        ALTER TABLE skill_groups_next RENAME TO skill_groups;

        PRAGMA foreign_keys = ON;
        "#,
    )
    .map_err(|error| format!("无法移除 Skill 分组默认标记：{error}"))
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

fn drop_ai_agent_model_binding(conn: &Connection) -> Result<(), String> {
    let columns = table_columns(conn, "ai_agents")?;

    if !columns.iter().any(|column| column == "provider_id")
        && !columns.iter().any(|column| column == "model_id")
    {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = OFF;

        CREATE TABLE ai_agents_next (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            avatar TEXT NOT NULL,
            description TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        INSERT INTO ai_agents_next (
            id, name, avatar, description, created_at, updated_at
        )
        SELECT
            id, name, avatar, description, created_at, updated_at
        FROM ai_agents;

        DROP TABLE ai_agents;
        ALTER TABLE ai_agents_next RENAME TO ai_agents;

        PRAGMA foreign_keys = ON;
        "#,
    )
    .map_err(|error| format!("无法移除角色模型绑定字段：{error}"))
}

fn add_agent_runtime_settings(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS agent_runtime_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|error| format!("无法创建 Agent Runtime 设置表：{error}"))
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
        clear_legacy_story_registry(conn)?;
        remove_readonly_skill_group_members(conn)?;
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

    #[test]
    fn drop_ai_agent_model_binding_preserves_agent_profile_data() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE ai_agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar TEXT NOT NULL,
                description TEXT,
                provider_id TEXT NOT NULL,
                model_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            INSERT INTO ai_agents (
                id, name, avatar, description, provider_id, model_id, created_at, updated_at
            ) VALUES (
                'agent-1', '策划师', 'avatar-1', '负责长篇策划',
                'provider-1', 'model-1', 1, 2
            );
            "#,
        )
        .expect("create old agent table");

        drop_ai_agent_model_binding(&conn).expect("drop agent model binding columns");

        let columns = table_columns(&conn, "ai_agents").expect("read columns");
        assert!(!columns.iter().any(|column| column == "provider_id"));
        assert!(!columns.iter().any(|column| column == "model_id"));

        let (name, avatar, description): (String, String, Option<String>) = conn
            .query_row(
                "SELECT name, avatar, description FROM ai_agents WHERE id = ?1",
                params!["agent-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read migrated agent");

        assert_eq!(name, "策划师");
        assert_eq!(avatar, "avatar-1");
        assert_eq!(description.as_deref(), Some("负责长篇策划"));
    }

    #[test]
    fn add_skill_group_skill_disabled_flag_defaults_existing_members_to_enabled() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE skill_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                "order" INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            INSERT INTO skill_groups (
                id, name, description, "order", created_at, updated_at
            ) VALUES (
                'group-1', '命理分析', NULL, 0, 1, 2
            );

            CREATE TABLE skill_group_skills (
                group_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(group_id, skill_name),
                FOREIGN KEY(group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
            );

            INSERT INTO skill_group_skills (
                group_id, skill_name, created_at
            ) VALUES (
                'group-1', 'bazi', 3
            );
            "#,
        )
        .expect("create old skill group member table");

        add_skill_group_skill_disabled_flag(&conn).expect("add disabled column");

        let columns = table_columns(&conn, "skill_group_skills").expect("read columns");
        assert!(columns.iter().any(|column| column == "disabled"));

        let disabled: i64 = conn
            .query_row(
                "SELECT disabled FROM skill_group_skills WHERE group_id = ?1 AND skill_name = ?2",
                params!["group-1", "bazi"],
                |row| row.get(0),
            )
            .expect("read disabled flag");

        assert_eq!(disabled, 0);
    }

    #[test]
    fn normalize_skill_group_member_disabled_flag_removes_group_level_flag() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE skill_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                disabled INTEGER NOT NULL DEFAULT 0,
                "order" INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE skill_group_skills (
                group_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY(group_id, skill_name),
                FOREIGN KEY(group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
            );

            INSERT INTO skill_groups (
                id, name, description, disabled, "order", created_at, updated_at
            ) VALUES (
                'group-1', '命理分析', NULL, 1, 0, 1, 2
            );
            INSERT INTO skill_group_skills (
                group_id, skill_name, created_at
            ) VALUES (
                'group-1', 'bazi', 3
            );
            "#,
        )
        .expect("create bad skill group schema");

        normalize_skill_group_member_disabled_flag(&conn).expect("normalize disabled flags");

        let group_columns = table_columns(&conn, "skill_groups").expect("read group columns");
        assert!(!group_columns.iter().any(|column| column == "disabled"));

        let member_columns =
            table_columns(&conn, "skill_group_skills").expect("read member columns");
        assert!(member_columns.iter().any(|column| column == "disabled"));

        let disabled: i64 = conn
            .query_row(
                "SELECT disabled FROM skill_group_skills WHERE group_id = ?1 AND skill_name = ?2",
                params!["group-1", "bazi"],
                |row| row.get(0),
            )
            .expect("read member disabled flag");

        assert_eq!(disabled, 0);
    }

    #[test]
    fn add_agent_runtime_settings_creates_settings_table() {
        let conn = Connection::open_in_memory().expect("open database");

        add_agent_runtime_settings(&conn).expect("create agent runtime settings");

        let columns = table_columns(&conn, "agent_runtime_settings").expect("read columns");
        assert_eq!(columns, vec!["key", "value_json", "updated_at"]);
    }

    #[test]
    fn clear_legacy_story_registry_removes_story_rows() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE stories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                workspace_path TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            INSERT INTO stories (id, name, workspace_path, created_at, updated_at)
            VALUES ('story-1', '旧故事', '/tmp/legacy-story', 1, 1);
            "#,
        )
        .expect("create story registry");

        clear_legacy_story_registry(&conn).expect("clear legacy story registry");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM stories", [], |row| row.get(0))
            .expect("count story records");
        assert_eq!(count, 0);
    }

    #[test]
    fn remove_readonly_skill_group_members_deletes_legacy_setting() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE skill_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            INSERT INTO skill_settings (key, value, updated_at)
            VALUES ('readonly_skill_group_members', '[]', 1);
            INSERT INTO skill_settings (key, value, updated_at)
            VALUES ('default_group_id', 'all', 1);
            "#,
        )
        .expect("create skill settings");

        remove_readonly_skill_group_members(&conn).expect("remove legacy setting");

        let legacy_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM skill_settings WHERE key = 'readonly_skill_group_members'",
                [],
                |row| row.get(0),
            )
            .expect("count legacy settings");
        let default_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM skill_settings WHERE key = 'default_group_id'",
                [],
                |row| row.get(0),
            )
            .expect("count default settings");

        assert_eq!(legacy_count, 0);
        assert_eq!(default_count, 1);
    }

    #[test]
    fn embedding_binding_migration_preserves_explicit_ids_after_profile_deletion() {
        let conn = Connection::open_in_memory().expect("open database");
        conn.execute_batch(
            r#"
            CREATE TABLE knowledge_collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT,
                "order" INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE embedding_profiles (
                id TEXT PRIMARY KEY,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            INSERT INTO embedding_profiles (id, is_default, created_at)
            VALUES ('embedding-1', 1, 1);
            INSERT INTO knowledge_collections (
                id, name, description, color, "order", enabled, created_at, updated_at
            ) VALUES ('knowledge-1', '文档库', NULL, NULL, 0, 1, 1, 1);
            "#,
        )
        .expect("create legacy knowledge tables");

        bind_embedding_profiles_to_knowledge_collections(&conn).expect("migrate bindings");
        let binding: Option<String> = conn
            .query_row(
                "SELECT embedding_profile_id FROM knowledge_collections WHERE id = 'knowledge-1'",
                [],
                |row| row.get(0),
            )
            .expect("read migrated binding");
        assert_eq!(binding.as_deref(), Some("embedding-1"));

        conn.execute(
            "DELETE FROM embedding_profiles WHERE id = 'embedding-1'",
            [],
        )
        .expect("delete embedding profile");
        let preserved_binding: Option<String> = conn
            .query_row(
                "SELECT embedding_profile_id FROM knowledge_collections WHERE id = 'knowledge-1'",
                [],
                |row| row.get(0),
            )
            .expect("read preserved binding");
        assert_eq!(preserved_binding.as_deref(), Some("embedding-1"));
    }
}
