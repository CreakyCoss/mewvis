use rusqlite::Connection;
use std::{fs, path::Path};
use tauri::AppHandle;

use super::defaults::seed_config_defaults;
use crate::db::{
    migrations::{database_user_version, run_config_migrations, CONFIG_SCHEMA_VERSION},
    paths::config_db_path,
    rebuild::{
        replace_sqlite_database_files, restore_matching_tables,
        snapshot_sqlite_database_for_rebuild, DatabaseRestoreReport,
    },
    schema::create_config_schema,
    sqlite::database_has_user_tables,
};

pub use crate::db::paths::default_config_db_path;

// 非开发环境下，版本一致的配置库走快速路径，避免每次启动重复执行建表、迁移和 schema 校验。
const ENABLE_RELEASE_CONFIG_DATABASE_FAST_PATH: bool = true;

// 快速路径仍保留默认数据修复，成本很低，也能避免默认分组缺失导致基础 UI 不可用。
const SEED_CONFIG_DEFAULTS_ON_FAST_PATH: bool = true;

pub fn initialize_config_database(app: &AppHandle) -> Result<(), String> {
    initialize_config_database_path(&config_db_path(app)?)
}

pub fn initialize_config_database_path(db_path: &Path) -> Result<(), String> {
    let conn = open_config_database(db_path)?;
    if should_use_config_database_fast_path(&conn)? {
        if SEED_CONFIG_DEFAULTS_ON_FAST_PATH {
            seed_config_defaults(&conn)?;
        }
        return Ok(());
    }

    let is_new_database = !database_has_user_tables(&conn)?;
    create_config_schema(&conn)?;
    run_config_migrations(&conn, is_new_database)?;
    seed_config_defaults(&conn)
}

fn should_use_config_database_fast_path(conn: &Connection) -> Result<bool, String> {
    // 开发环境保持完整初始化流程，方便尽早发现 schema、迁移或 seed 逻辑问题。
    if cfg!(debug_assertions) || !ENABLE_RELEASE_CONFIG_DATABASE_FAST_PATH {
        return Ok(false);
    }

    Ok(database_user_version(conn)? == CONFIG_SCHEMA_VERSION)
}

pub fn rebuild_config_database_path(db_path: &Path) -> Result<DatabaseRestoreReport, String> {
    let (snapshot, snapshot_warnings) = snapshot_sqlite_database_for_rebuild(db_path);

    let (mut report, replace_warnings) = replace_sqlite_database_files(db_path, || {
        initialize_config_database_path(db_path)?;

        let conn = open_config_database(db_path)?;
        let report = restore_matching_tables(&conn, &snapshot)?;
        run_config_migrations(&conn, false)?;
        seed_config_defaults(&conn)?;
        Ok(report)
    })?;
    report.warnings.extend(snapshot_warnings);
    report.warnings.extend(replace_warnings);
    Ok(report)
}

fn open_config_database(db_path: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建配置目录：{error}"))?;
    }

    Connection::open(db_path).map_err(|error| format!("无法打开配置数据库：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::path::Path;
    use uuid::Uuid;

    #[test]
    fn rebuild_config_database_preserves_matching_table_data() {
        let db_path = temp_config_db_path();
        initialize_config_database_path(&db_path).expect("initialize config database");

        let conn = Connection::open(&db_path).expect("open config database");
        conn.execute(
            r#"
            INSERT INTO llm_providers (
                id, name, provider, api_format, api_key, api_endpoint, is_default, created_at, updated_at
            ) VALUES (?1, 'Test Provider', 'openai', 'openai-completions', NULL, NULL, 1, 1, 1)
            "#,
            params!["provider-1"],
        )
        .expect("insert provider");
        drop(conn);

        let report = rebuild_config_database_path(&db_path).expect("rebuild config database");
        assert!(report
            .restored_tables
            .contains(&"llm_providers".to_string()));
        assert!(report.warnings.is_empty());

        let conn = Connection::open(&db_path).expect("open rebuilt config database");
        let name: String = conn
            .query_row(
                "SELECT name FROM llm_providers WHERE id = ?1",
                params!["provider-1"],
                |row| row.get(0),
            )
            .expect("read restored provider");
        let user_version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");

        assert_eq!(name, "Test Provider");
        assert_eq!(user_version, CONFIG_SCHEMA_VERSION);

        remove_temp_config_db(&db_path);
    }

    #[test]
    fn rebuild_config_database_recreates_when_old_database_is_unreadable() {
        let db_path = temp_config_db_path();
        fs::write(&db_path, b"not a sqlite database").expect("write invalid database");

        let report = rebuild_config_database_path(&db_path).expect("rebuild config database");
        assert!(report.restored_tables.is_empty());
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("旧数据库无法读取")));

        let conn = Connection::open(&db_path).expect("open rebuilt config database");
        let user_version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user version");
        let default_group_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workspace_groups WHERE is_default = 1",
                [],
                |row| row.get(0),
            )
            .expect("read default group count");

        assert_eq!(user_version, CONFIG_SCHEMA_VERSION);
        assert_eq!(default_group_count, 1);

        remove_temp_config_db(&db_path);
    }

    #[test]
    fn rebuild_config_database_restores_table_when_new_columns_have_defaults() {
        let db_path = temp_config_db_path();
        let conn = Connection::open(&db_path).expect("open old config database");
        conn.execute_batch(
            r#"
            CREATE TABLE llm_providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                api_format TEXT NOT NULL,
                api_key TEXT,
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
                id, name, api_format, api_key, is_default, created_at, updated_at
            ) VALUES (?1, 'Old Provider', 'openai-completions', NULL, 1, 1, 1)
            "#,
            params!["provider-with-default-column"],
        )
        .expect("insert old provider");
        drop(conn);

        let report = rebuild_config_database_path(&db_path).expect("rebuild config database");
        assert!(report
            .restored_tables
            .contains(&"llm_providers".to_string()));
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("provider")));

        let conn = Connection::open(&db_path).expect("open rebuilt config database");
        let (name, provider, api_format, api_endpoint): (String, String, String, Option<String>) =
            conn.query_row(
                "SELECT name, provider, api_format, api_endpoint FROM llm_providers WHERE id = ?1",
                params!["provider-with-default-column"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read restored provider");

        assert_eq!(name, "Old Provider");
        assert_eq!(provider, "");
        assert_eq!(api_format, "openai-completions");
        assert_eq!(api_endpoint, None);

        remove_temp_config_db(&db_path);
    }

    #[test]
    fn rebuild_config_database_skips_table_when_only_id_matches() {
        let db_path = temp_config_db_path();
        let conn = Connection::open(&db_path).expect("open old config database");
        conn.execute_batch(
            r#"
            CREATE TABLE llm_providers (
                id TEXT PRIMARY KEY
            );
            "#,
        )
        .expect("create old provider table");
        conn.execute(
            "INSERT INTO llm_providers (id) VALUES (?1)",
            params!["provider-with-only-id"],
        )
        .expect("insert old provider");
        drop(conn);

        let report = rebuild_config_database_path(&db_path).expect("rebuild config database");
        assert!(report.skipped_tables.contains(&"llm_providers".to_string()));

        let conn = Connection::open(&db_path).expect("open rebuilt config database");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM llm_providers WHERE id = ?1",
                params!["provider-with-only-id"],
                |row| row.get(0),
            )
            .expect("read provider count");

        assert_eq!(count, 0);

        remove_temp_config_db(&db_path);
    }

    #[test]
    fn rebuild_config_database_restores_old_database_when_restore_fails() {
        let db_path = temp_config_db_path();
        initialize_config_database_path(&db_path).expect("initialize config database");

        let conn = Connection::open(&db_path).expect("open config database");
        conn.execute_batch("PRAGMA foreign_keys = OFF;")
            .expect("disable foreign keys");
        conn.execute(
            r#"
            INSERT INTO skill_group_skills (
                group_id, skill_name, created_at
            ) VALUES ('missing-group', 'test-skill', 1)
            "#,
            [],
        )
        .expect("insert invalid skill");
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .expect("enable foreign keys");
        drop(conn);

        let error = rebuild_config_database_path(&db_path).expect_err("rebuild should fail");
        assert!(error.contains("旧数据库已恢复"));

        let conn = Connection::open(&db_path).expect("open restored config database");
        let count: i64 = conn
            .query_row(
                r#"
                SELECT COUNT(*)
                FROM skill_group_skills
                WHERE group_id = 'missing-group' AND skill_name = 'test-skill'
                "#,
                [],
                |row| row.get(0),
            )
            .expect("read restored invalid row");

        assert_eq!(count, 1);

        remove_temp_config_db(&db_path);
    }

    fn temp_config_db_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "{}-test-{}.db",
            crate::product_config::bundle_name(),
            Uuid::now_v7().simple()
        ))
    }

    fn remove_temp_config_db(db_path: &Path) {
        let _ = fs::remove_file(db_path);
        let _ = fs::remove_file(db_path.with_extension("db-shm"));
        let _ = fs::remove_file(db_path.with_extension("db-wal"));
        let _ = fs::remove_file(db_path.with_extension("db-journal"));
    }
}
