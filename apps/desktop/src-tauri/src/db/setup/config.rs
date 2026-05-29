use rusqlite::Connection;
use std::{fs, path::Path};
use tauri::AppHandle;

use super::defaults::seed_config_defaults;
use crate::db::{
    migrations::run_config_migrations,
    paths::config_db_path,
    rebuild::{
        replace_sqlite_database_files, restore_matching_tables,
        snapshot_sqlite_database_for_rebuild, DatabaseRestoreReport,
    },
    schema::create_config_schema,
    sqlite::database_has_user_tables,
};

pub use crate::db::paths::default_config_db_path;

pub fn initialize_config_database(app: &AppHandle) -> Result<(), String> {
    initialize_config_database_path(&config_db_path(app)?)
}

pub fn initialize_config_database_path(db_path: &Path) -> Result<(), String> {
    let conn = open_config_database(db_path)?;
    let is_new_database = !database_has_user_tables(&conn)?;
    create_config_schema(&conn)?;
    run_config_migrations(&conn, is_new_database)?;
    seed_config_defaults(&conn)
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
                id, name, vendor, provider, api_key, base_url, is_default, created_at, updated_at
            ) VALUES (?1, 'Test Provider', 'openai', 'openai-compatible', NULL, NULL, 1, 1, 1)
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
        assert_eq!(user_version, 3);

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

        assert_eq!(user_version, 3);
        assert_eq!(default_group_count, 1);

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
            INSERT INTO workspace_enabled_skills (
                workspace_id, skill_name, created_at, updated_at
            ) VALUES ('missing-workspace', 'test-skill', 1, 1)
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
                FROM workspace_enabled_skills
                WHERE workspace_id = 'missing-workspace' AND skill_name = 'test-skill'
                "#,
                [],
                |row| row.get(0),
            )
            .expect("read restored invalid row");

        assert_eq!(count, 1);

        remove_temp_config_db(&db_path);
    }

    fn temp_config_db_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("novel-claw-test-{}.db", Uuid::now_v7().simple()))
    }

    fn remove_temp_config_db(db_path: &Path) {
        let _ = fs::remove_file(db_path);
        let _ = fs::remove_file(db_path.with_extension("db-shm"));
        let _ = fs::remove_file(db_path.with_extension("db-wal"));
        let _ = fs::remove_file(db_path.with_extension("db-journal"));
    }
}
