use rusqlite::Connection;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

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

/// Shared by desktop and application registration; resolves existing aliases without creating files.
pub fn normalize_workspace_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("请选择绝对路径的工作区目录".into());
    }
    let mut resolved = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            _ => resolved.push(component.as_os_str()),
        }
        match fs::symlink_metadata(&resolved) {
            Ok(_) => {
                resolved = fs::canonicalize(&resolved)
                    .map_err(|error| format!("无法解析工作区目录：{error}"))?;
                if !resolved.is_dir() {
                    return Err("工作区路径必须是目录".into());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("无法读取工作区目录：{error}")),
        }
    }
    Ok(resolved)
}

pub fn initialize_workspace_directory(path: &Path) -> Result<PathBuf, String> {
    let path = normalize_workspace_path(path)?;
    initialize_workspace_database(&path)?;
    Ok(path)
}

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
