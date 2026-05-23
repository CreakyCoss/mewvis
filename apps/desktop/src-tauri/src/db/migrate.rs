use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

use super::{
    config_db::config_db_path,
    id::{is_record_id, new_record_id},
};

const LEGACY_DEFAULT_GROUP_IDS: [&str; 3] = ["default", "nc_default", "000000000000000000000001"];

pub fn default_config_db_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("HOME").map_err(|error| format!("无法获取用户主目录：{error}"))?;
    let config_dir = PathBuf::from(home_dir).join(".novel-claw");

    fs::create_dir_all(&config_dir).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(config_dir.join("config.db"))
}

pub fn migrate_config_database(app: &AppHandle) -> Result<(), String> {
    migrate_config_database_path(&config_db_path(app)?)
}

pub fn initialize_config_database(app: &AppHandle) -> Result<(), String> {
    initialize_config_database_path(&config_db_path(app)?)
}

pub fn initialize_config_database_path(db_path: &Path) -> Result<(), String> {
    let conn = open_config_database(db_path)?;
    create_config_schema(&conn)?;
    seed_default_group(&conn)?;
    Ok(())
}

pub fn migrate_config_database_path(db_path: &Path) -> Result<(), String> {
    let conn = open_config_database(db_path)?;
    create_config_schema(&conn)?;
    migrate_llm_provider_schema(&conn)?;
    migrate_default_group_ids(&conn)?;
    seed_default_group(&conn)?;
    normalize_config_record_ids(&conn)?;
    Ok(())
}

fn open_config_database(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    }

    Connection::open(db_path).map_err(|error| format!("无法打开配置数据库：{error}"))
}

pub fn migrate_workspace_database(workspace_path: &Path) -> Result<(), String> {
    fs::create_dir_all(workspace_path).map_err(|error| format!("无法创建工作区目录：{error}"))?;

    let db_path = workspace_path.join("workspace.db");
    let conn =
        Connection::open(db_path).map_err(|error| format!("无法创建工作区数据库：{error}"))?;
    conn.execute_batch("PRAGMA user_version = 1;")
        .map_err(|error| format!("工作区数据库初始化失败：{error}"))?;
    Ok(())
}

fn create_config_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS workspace_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            "order" INTEGER DEFAULT 0,
            is_default INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

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

        CREATE TABLE IF NOT EXISTS workspace_enabled_skills (
            workspace_id TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (workspace_id, skill_name),
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

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
    )
    .map_err(|error| format!("配置数据库初始化失败：{error}"))?;
    Ok(())
}

fn migrate_default_group_ids(conn: &Connection) -> Result<(), String> {
    let default_group_id = ensure_default_group(conn)?;
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|error| format!("无法准备默认分组迁移：{error}"))?;
    for legacy_id in LEGACY_DEFAULT_GROUP_IDS {
        move_workspace_group_id(conn, legacy_id, &default_group_id)?;
    }
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法恢复外键约束：{error}"))?;
    Ok(())
}

fn seed_default_group(conn: &Connection) -> Result<(), String> {
    let default_group_id = ensure_default_group(conn)?;
    normalize_default_group_flags(conn, &default_group_id)?;
    Ok(())
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

fn normalize_config_record_ids(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|error| format!("无法准备 ID 迁移：{error}"))?;

    normalize_workspace_group_ids(conn)?;
    normalize_workspace_ids(conn)?;
    normalize_llm_provider_ids(conn)?;
    normalize_provider_model_ids(conn)?;
    normalize_ai_agent_ids(conn)?;

    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| format!("无法恢复外键约束：{error}"))?;
    Ok(())
}

fn normalize_workspace_group_ids(conn: &Connection) -> Result<(), String> {
    for id in invalid_record_ids(conn, "workspace_groups")? {
        let new_id = new_record_id();
        move_workspace_group_id(conn, &id, &new_id)?;
    }
    Ok(())
}

fn normalize_workspace_ids(conn: &Connection) -> Result<(), String> {
    for id in invalid_record_ids(conn, "workspaces")? {
        conn.execute(
            "UPDATE workspaces SET id = ?1 WHERE id = ?2",
            params![new_record_id(), id],
        )
        .map_err(|error| format!("无法迁移工作区 ID：{error}"))?;
    }
    Ok(())
}

fn normalize_llm_provider_ids(conn: &Connection) -> Result<(), String> {
    for id in invalid_record_ids(conn, "llm_providers")? {
        let new_id = new_record_id();
        conn.execute(
            "UPDATE provider_models SET provider_id = ?1 WHERE provider_id = ?2",
            params![new_id, id],
        )
        .map_err(|error| format!("无法迁移 LLM 模型 Provider 引用：{error}"))?;
        conn.execute(
            "UPDATE llm_providers SET id = ?1 WHERE id = ?2",
            params![new_id, id],
        )
        .map_err(|error| format!("无法迁移 LLM Provider ID：{error}"))?;
    }
    Ok(())
}

fn normalize_provider_model_ids(conn: &Connection) -> Result<(), String> {
    for id in invalid_record_ids(conn, "provider_models")? {
        conn.execute(
            "UPDATE provider_models SET id = ?1 WHERE id = ?2",
            params![new_record_id(), id],
        )
        .map_err(|error| format!("无法迁移 LLM 模型 ID：{error}"))?;
    }
    Ok(())
}

fn normalize_ai_agent_ids(conn: &Connection) -> Result<(), String> {
    for id in invalid_record_ids(conn, "ai_agents")? {
        conn.execute(
            "UPDATE ai_agents SET id = ?1 WHERE id = ?2",
            params![new_record_id(), id],
        )
        .map_err(|error| format!("无法迁移 Agent ID：{error}"))?;
    }
    Ok(())
}

fn move_workspace_group_id(conn: &Connection, old_id: &str, new_id: &str) -> Result<(), String> {
    if old_id == new_id {
        return Ok(());
    }

    conn.execute(
        "UPDATE workspaces SET group_id = ?1 WHERE group_id = ?2",
        params![new_id, old_id],
    )
    .map_err(|error| format!("无法迁移工作区分组引用：{error}"))?;

    let target_exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM workspace_groups WHERE id = ?1)",
            params![new_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("无法读取工作区分组：{error}"))?
        == 1;

    if target_exists {
        conn.execute(
            "DELETE FROM workspace_groups WHERE id = ?1",
            params![old_id],
        )
        .map_err(|error| format!("无法清理旧工作区分组：{error}"))?;
    } else {
        conn.execute(
            "UPDATE workspace_groups SET id = ?1 WHERE id = ?2",
            params![new_id, old_id],
        )
        .map_err(|error| format!("无法迁移工作区分组 ID：{error}"))?;
    }

    Ok(())
}

fn invalid_record_ids(conn: &Connection, table_name: &str) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(&format!("SELECT id FROM {table_name}"))
        .map_err(|error| format!("无法读取表记录 ID：{error}"))?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("无法读取表记录 ID：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析表记录 ID：{error}"))?;

    Ok(ids
        .into_iter()
        .filter(|id| !is_record_id(id))
        .collect::<Vec<_>>())
}

fn ensure_column(
    conn: &Connection,
    table_name: &str,
    column_name: &str,
    column_definition: &str,
) -> Result<(), String> {
    if column_exists(conn, table_name, column_name)? {
        return Ok(());
    }

    conn.execute(
        &format!("ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"),
        [],
    )
    .map_err(|error| format!("无法添加表字段：{error}"))?;

    Ok(())
}

fn column_exists(conn: &Connection, table_name: &str, column_name: &str) -> Result<bool, String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table_name})"))
        .map_err(|error| format!("无法读取表结构：{error}"))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取表字段：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析表字段：{error}"))?;

    Ok(columns.iter().any(|column| column == column_name))
}

fn migrate_llm_provider_schema(conn: &Connection) -> Result<(), String> {
    ensure_column(conn, "llm_providers", "vendor", "TEXT NOT NULL DEFAULT ''")?;

    conn.execute(
        r#"
        UPDATE llm_providers
        SET vendor = provider
        WHERE vendor = ''
        "#,
        [],
    )
    .map_err(|error| format!("无法迁移 LLM 供应商字段：{error}"))?;

    if column_exists(conn, "llm_providers", "provider_type")? {
        rebuild_llm_provider_tables(conn)?;
    }

    Ok(())
}

fn rebuild_llm_provider_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = OFF;

        DROP TABLE IF EXISTS provider_models_rebuild;
        DROP TABLE IF EXISTS llm_providers_rebuild;

        CREATE TABLE llm_providers_rebuild (
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

        INSERT INTO llm_providers_rebuild (
            id, name, vendor, provider, api_key, base_url, is_default, created_at, updated_at
        )
        SELECT
            id,
            name,
            COALESCE(NULLIF(vendor, ''), provider),
            COALESCE(NULLIF(provider_type, ''), provider),
            api_key,
            base_url,
            is_default,
            created_at,
            updated_at
        FROM llm_providers;

        CREATE TABLE provider_models_rebuild (
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

        INSERT INTO provider_models_rebuild (
            id, provider_id, model_id, model_name, is_enabled, created_at, updated_at
        )
        SELECT id, provider_id, model_id, model_name, is_enabled, created_at, updated_at
        FROM provider_models;

        DROP TABLE provider_models;
        DROP TABLE llm_providers;

        ALTER TABLE llm_providers_rebuild RENAME TO llm_providers;
        ALTER TABLE provider_models_rebuild RENAME TO provider_models;

        PRAGMA foreign_keys = ON;
        "#,
    )
    .map_err(|error| format!("无法重建 LLM Provider 表：{error}"))?;

    Ok(())
}

fn now_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}
