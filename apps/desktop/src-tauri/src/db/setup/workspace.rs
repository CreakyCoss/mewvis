use rusqlite::Connection;
use std::{fs, path::Path};

use crate::db::{
    migrations::{database_user_version, run_workspace_migrations, WORKSPACE_SCHEMA_VERSION},
    rebuild::{
        replace_sqlite_database_files, restore_matching_tables,
        snapshot_sqlite_database_for_rebuild, DatabaseRestoreReport,
    },
    schema::create_workspace_schema,
    sqlite::database_has_user_tables,
};

// 非开发环境下，版本一致的工作区库走快速路径，避免进入工作区或保存工作区时重复建表、迁移和 schema 校验。
const ENABLE_RELEASE_WORKSPACE_DATABASE_FAST_PATH: bool = true;

pub fn initialize_workspace_database(workspace_path: &Path) -> Result<(), String> {
    fs::create_dir_all(workspace_path).map_err(|error| format!("无法创建工作区目录：{error}"))?;

    let db_path = workspace_path.join("workspace.db");
    let conn =
        Connection::open(db_path).map_err(|error| format!("无法创建工作区数据库：{error}"))?;
    if should_use_workspace_database_fast_path(&conn)? {
        return Ok(());
    }

    let is_new_database = !database_has_user_tables(&conn)?;
    create_workspace_schema(&conn)?;
    run_workspace_migrations(&conn, is_new_database)
}

fn should_use_workspace_database_fast_path(conn: &Connection) -> Result<bool, String> {
    // 开发环境保持完整初始化流程，方便尽早发现工作区 schema 或迁移问题。
    if cfg!(debug_assertions) || !ENABLE_RELEASE_WORKSPACE_DATABASE_FAST_PATH {
        return Ok(false);
    }

    Ok(database_user_version(conn)? == WORKSPACE_SCHEMA_VERSION)
}

pub fn rebuild_workspace_database(workspace_path: &Path) -> Result<DatabaseRestoreReport, String> {
    fs::create_dir_all(workspace_path).map_err(|error| format!("无法创建工作区目录：{error}"))?;

    let db_path = workspace_path.join("workspace.db");
    let (snapshot, snapshot_warnings) = snapshot_sqlite_database_for_rebuild(&db_path);

    let (mut report, replace_warnings) = replace_sqlite_database_files(&db_path, || {
        initialize_workspace_database(workspace_path)?;

        let conn =
            Connection::open(&db_path).map_err(|error| format!("无法打开工作区数据库：{error}"))?;
        let report = restore_matching_tables(&conn, &snapshot)?;
        run_workspace_migrations(&conn, false)?;
        Ok(report)
    })?;
    report.warnings.extend(snapshot_warnings);
    report.warnings.extend(replace_warnings);
    Ok(report)
}
