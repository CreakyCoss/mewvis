use rusqlite::{params_from_iter, types::Value, Connection};
use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use super::sqlite::{quote_identifier, table_columns, user_table_names};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseRestoreReport {
    pub restored_tables: Vec<String>,
    pub skipped_tables: Vec<String>,
    pub restored_rows: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug)]
pub(crate) struct DatabaseSnapshot {
    tables: Vec<DatabaseTableSnapshot>,
}

#[derive(Debug)]
struct DatabaseTableSnapshot {
    name: String,
    columns: Vec<String>,
    rows: Vec<Vec<Value>>,
}

struct DatabaseFileBackup {
    backup_dir: PathBuf,
    files: Vec<BackedUpDatabaseFile>,
}

struct BackedUpDatabaseFile {
    original_path: PathBuf,
    backup_path: PathBuf,
}

pub(crate) fn snapshot_sqlite_database(db_path: &Path) -> Result<DatabaseSnapshot, String> {
    if !db_path.exists() {
        return Ok(DatabaseSnapshot { tables: Vec::new() });
    }

    let conn = Connection::open(db_path)
        .map_err(|error| format!("无法读取旧数据库 {}：{error}", db_path.display()))?;
    let mut tables = Vec::new();
    for table_name in user_table_names(&conn)? {
        let columns = table_columns(&conn, &table_name)?;
        if columns.is_empty() {
            continue;
        }

        let rows = table_rows(&conn, &table_name, &columns)?;
        tables.push(DatabaseTableSnapshot {
            name: table_name,
            columns,
            rows,
        });
    }

    Ok(DatabaseSnapshot { tables })
}

pub(crate) fn snapshot_sqlite_database_for_rebuild(
    db_path: &Path,
) -> (DatabaseSnapshot, Vec<String>) {
    match snapshot_sqlite_database(db_path) {
        Ok(snapshot) => (snapshot, Vec::new()),
        Err(error) => (
            DatabaseSnapshot { tables: Vec::new() },
            vec![format!(
                "旧数据库无法读取，已改为空库重建；旧数据库文件会先备份后再替换：{error}"
            )],
        ),
    }
}

pub(crate) fn restore_matching_tables(
    conn: &Connection,
    snapshot: &DatabaseSnapshot,
) -> Result<DatabaseRestoreReport, String> {
    let mut restorable_tables = Vec::new();
    let mut skipped_tables = Vec::new();

    for table in &snapshot.tables {
        let current_columns = table_columns(conn, &table.name)?;
        if same_column_names(&current_columns, &table.columns) {
            restorable_tables.push(table);
        } else {
            skipped_tables.push(table.name.clone());
        }
    }

    conn.execute_batch("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;")
        .map_err(|error| format!("无法开始恢复数据库数据：{error}"))?;

    let restore_result = (|| {
        let mut restored_rows = 0;
        let mut restored_tables = Vec::new();

        for table in restorable_tables {
            restore_table(conn, table)?;
            restored_rows += table.rows.len();
            restored_tables.push(table.name.clone());
        }

        validate_foreign_keys(conn)?;

        Ok(DatabaseRestoreReport {
            restored_tables,
            skipped_tables,
            restored_rows,
            warnings: Vec::new(),
        })
    })();

    match restore_result {
        Ok(report) => {
            conn.execute_batch("COMMIT; PRAGMA foreign_keys = ON;")
                .map_err(|error| format!("无法提交数据库数据恢复：{error}"))?;
            Ok(report)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK; PRAGMA foreign_keys = ON;");
            Err(error)
        }
    }
}

pub(crate) fn replace_sqlite_database_files<T>(
    db_path: &Path,
    rebuild: impl FnOnce() -> Result<T, String>,
) -> Result<(T, Vec<String>), String> {
    let backup = backup_sqlite_database_files(db_path)?;

    match rebuild() {
        Ok(value) => {
            let warnings = cleanup_backup_directory(&backup)
                .err()
                .map(|error| vec![error])
                .unwrap_or_default();
            Ok((value, warnings))
        }
        Err(error) => {
            let cleanup_result = remove_sqlite_database_files(db_path);
            let restore_result = restore_sqlite_database_files(backup);

            match (cleanup_result, restore_result) {
                (Ok(()), Ok(restored)) if restored => Err(format!("{error}；旧数据库已恢复")),
                (Ok(()), Ok(_)) => Err(format!("{error}；已清理失败的新数据库")),
                (Err(cleanup_error), Ok(restored)) if restored => Err(format!(
                    "{error}；清理失败的新数据库时出错：{cleanup_error}；旧数据库已恢复"
                )),
                (Err(cleanup_error), Ok(_)) => Err(format!(
                    "{error}；清理失败的新数据库时出错：{cleanup_error}"
                )),
                (Ok(()), Err(restore_error)) => Err(format!(
                    "{error}；恢复旧数据库失败，请从备份目录手动恢复：{restore_error}"
                )),
                (Err(cleanup_error), Err(restore_error)) => Err(format!(
                    "{error}；清理失败的新数据库时出错：{cleanup_error}；恢复旧数据库失败，请从备份目录手动恢复：{restore_error}"
                )),
            }
        }
    }
}

fn backup_sqlite_database_files(db_path: &Path) -> Result<DatabaseFileBackup, String> {
    let backup_dir = backup_directory_path(db_path)?;
    let existing_files = sqlite_database_files(db_path)
        .into_iter()
        .filter(|path| path.exists())
        .collect::<Vec<_>>();

    if existing_files.is_empty() {
        return Ok(DatabaseFileBackup {
            backup_dir,
            files: Vec::new(),
        });
    }

    fs::create_dir_all(&backup_dir).map_err(|error| {
        format!(
            "无法创建数据库重建备份目录 {}：{error}",
            backup_dir.display()
        )
    })?;

    let mut files = Vec::new();
    for original_path in existing_files {
        let file_name = original_path
            .file_name()
            .ok_or_else(|| format!("数据库文件路径无效：{}", original_path.display()))?;
        let backup_path = backup_dir.join(file_name);
        if let Err(error) = fs::rename(&original_path, &backup_path) {
            let restore_error = restore_sqlite_database_files(DatabaseFileBackup {
                backup_dir: backup_dir.clone(),
                files,
            })
            .err()
            .map(|restore_error| format!("；已备份文件恢复失败：{restore_error}"))
            .unwrap_or_default();
            return Err(format!(
                "无法备份数据库文件 {} 到 {}：{error}",
                original_path.display(),
                backup_path.display()
            ) + &restore_error);
        }
        files.push(BackedUpDatabaseFile {
            original_path,
            backup_path,
        });
    }

    Ok(DatabaseFileBackup { backup_dir, files })
}

fn restore_sqlite_database_files(backup: DatabaseFileBackup) -> Result<bool, String> {
    let has_backup_files = !backup.files.is_empty();
    for file in backup.files {
        if let Some(parent) = file.original_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建数据库恢复目录 {}：{error}", parent.display()))?;
        }

        fs::rename(&file.backup_path, &file.original_path).map_err(|error| {
            format!(
                "无法恢复数据库文件 {} 到 {}：{error}",
                file.backup_path.display(),
                file.original_path.display()
            )
        })?;
    }

    let _ = fs::remove_dir(&backup.backup_dir);
    Ok(has_backup_files)
}

fn cleanup_backup_directory(backup: &DatabaseFileBackup) -> Result<(), String> {
    if backup.backup_dir.exists() {
        fs::remove_dir_all(&backup.backup_dir).map_err(|error| {
            format!(
                "无法清理数据库重建备份目录 {}：{error}",
                backup.backup_dir.display()
            )
        })?;
    }

    Ok(())
}

fn remove_sqlite_database_files(db_path: &Path) -> Result<(), String> {
    for path in sqlite_database_files(db_path) {
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| format!("无法删除数据库文件 {}：{error}", path.display()))?;
        }
    }

    Ok(())
}

fn restore_table(conn: &Connection, table: &DatabaseTableSnapshot) -> Result<(), String> {
    let table_name = quote_identifier(&table.name);
    conn.execute(&format!("DELETE FROM {table_name}"), [])
        .map_err(|error| format!("无法清空新数据库表 {}：{error}", table.name))?;

    if table.rows.is_empty() {
        return Ok(());
    }

    let columns = table
        .columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = (1..=table.columns.len())
        .map(|index| format!("?{index}"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("INSERT INTO {table_name} ({columns}) VALUES ({placeholders})");
    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("无法准备恢复表 {}：{error}", table.name))?;

    for row in &table.rows {
        statement
            .execute(params_from_iter(row.iter()))
            .map_err(|error| format!("无法恢复表 {} 数据：{error}", table.name))?;
    }

    Ok(())
}

fn table_rows(
    conn: &Connection,
    table_name: &str,
    columns: &[String],
) -> Result<Vec<Vec<Value>>, String> {
    let column_list = columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("SELECT {column_list} FROM {}", quote_identifier(table_name));
    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("无法读取旧数据库表 {table_name}：{error}"))?;
    let rows = statement
        .query_map([], |row| {
            let mut values = Vec::with_capacity(columns.len());
            for index in 0..columns.len() {
                values.push(row.get::<_, Value>(index)?);
            }
            Ok(values)
        })
        .map_err(|error| format!("无法读取旧数据库表 {table_name}：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析旧数据库表 {table_name}：{error}"))?;

    Ok(rows)
}

fn same_column_names(left: &[String], right: &[String]) -> bool {
    if left.is_empty() || right.is_empty() {
        return false;
    }

    left.iter().collect::<BTreeSet<_>>() == right.iter().collect::<BTreeSet<_>>()
}

fn validate_foreign_keys(conn: &Connection) -> Result<(), String> {
    let mut statement = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| format!("无法校验外键：{error}"))?;
    let violations = statement
        .query_map([], |row| {
            let table: String = row.get(0)?;
            let row_id: Option<i64> = row.get(1)?;
            let parent: String = row.get(2)?;
            let foreign_key_id: i64 = row.get(3)?;
            Ok(format!(
                "{table} rowid={:?} parent={parent} fk={foreign_key_id}",
                row_id
            ))
        })
        .map_err(|error| format!("无法校验外键：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析外键校验结果：{error}"))?;

    if violations.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "恢复后的数据库外键校验失败：{}",
            violations.join("; ")
        ))
    }
}

fn sqlite_database_files(db_path: &Path) -> [PathBuf; 4] {
    [
        db_path.to_path_buf(),
        db_path.with_extension("db-shm"),
        db_path.with_extension("db-wal"),
        db_path.with_extension("db-journal"),
    ]
}

fn backup_directory_path(db_path: &Path) -> Result<PathBuf, String> {
    let parent = db_path
        .parent()
        .ok_or_else(|| format!("数据库路径缺少父目录：{}", db_path.display()))?;
    let file_name = db_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| format!("数据库文件名无效：{}", db_path.display()))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("无法生成数据库备份目录名：{error}"))?
        .as_nanos();

    for attempt in 0..1000 {
        let backup_dir = parent.join(format!(".{file_name}.rebuild-backup-{timestamp}-{attempt}"));
        if !backup_dir.exists() {
            return Ok(backup_dir);
        }
    }

    Err(format!(
        "无法为数据库 {} 生成唯一备份目录",
        db_path.display()
    ))
}
