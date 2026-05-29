use rusqlite::Connection;

use super::version::{
    database_user_version, set_database_user_version, WORKSPACE_INITIAL_SCHEMA_VERSION,
    WORKSPACE_SCHEMA_VERSION,
};
use crate::db::schema::validate_workspace_schema;

struct WorkspaceMigrationStep {
    target_version: i64,
    name: &'static str,
    run: fn(&Connection) -> Result<(), String>,
}

const WORKSPACE_MIGRATIONS: &[WorkspaceMigrationStep] = &[
    // Bump WORKSPACE_SCHEMA_VERSION only with a matching target_version step.
    // WorkspaceMigrationStep {
    //     target_version: 2,
    //     name: "add_example_workspace_migration",
    //     run: add_example_workspace_migration,
    // },
];

pub(crate) fn run_workspace_migrations(
    conn: &Connection,
    is_new_database: bool,
) -> Result<(), String> {
    validate_workspace_migrations()?;

    let mut current_version = database_user_version(conn)?;
    if is_new_database {
        set_database_user_version(conn, WORKSPACE_SCHEMA_VERSION)?;
        validate_workspace_schema(conn)?;
        return Ok(());
    }
    if current_version == 0 {
        set_database_user_version(conn, WORKSPACE_SCHEMA_VERSION)?;
        validate_workspace_schema(conn)?;
        return Ok(());
    }
    if current_version > WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "工作区数据库版本 {current_version} 高于当前应用支持的版本 {WORKSPACE_SCHEMA_VERSION}"
        ));
    }

    for migration in WORKSPACE_MIGRATIONS {
        if current_version >= migration.target_version {
            continue;
        }

        run_workspace_migration_step(conn, current_version, migration)?;
        current_version = migration.target_version;
    }

    if current_version < WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "工作区数据库版本 {current_version} 低于目标版本 {WORKSPACE_SCHEMA_VERSION}，但没有可执行的迁移脚本"
        ));
    }

    validate_workspace_schema(conn)?;
    Ok(())
}

fn validate_workspace_migrations() -> Result<(), String> {
    let mut previous_version = WORKSPACE_INITIAL_SCHEMA_VERSION;
    for migration in WORKSPACE_MIGRATIONS {
        if migration.target_version <= previous_version {
            return Err(format!("工作区数据库迁移版本必须递增：{}", migration.name));
        }

        if migration.target_version > WORKSPACE_SCHEMA_VERSION {
            return Err(format!(
                "工作区数据库迁移版本超过目标版本：{} -> {}",
                migration.name, migration.target_version
            ));
        }

        previous_version = migration.target_version;
    }

    if previous_version != WORKSPACE_SCHEMA_VERSION {
        return Err(format!(
            "工作区数据库目标版本为 {WORKSPACE_SCHEMA_VERSION}，但迁移列表只覆盖到 {previous_version}"
        ));
    }

    Ok(())
}

fn run_workspace_migration_step(
    conn: &Connection,
    current_version: i64,
    migration: &WorkspaceMigrationStep,
) -> Result<(), String> {
    conn.execute_batch("BEGIN IMMEDIATE;")
        .map_err(|error| format!("无法开始工作区数据库迁移事务：{error}"))?;

    let result = (migration.run)(conn)
        .and_then(|_| set_database_user_version(conn, migration.target_version))
        .and_then(|_| {
            conn.execute_batch("COMMIT;")
                .map_err(|error| format!("无法提交工作区数据库迁移事务：{error}"))
        });

    if let Err(error) = result {
        let _ = conn.execute_batch("ROLLBACK;");
        return Err(format!(
            "工作区数据库迁移 {} -> {} ({}) 失败：{error}",
            current_version, migration.target_version, migration.name
        ));
    }

    Ok(())
}
