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
    // ConfigMigrationStep {
    //     target_version: 4,
    //     name: "add_example_config_migration",
    //     run: add_example_config_migration,
    // },
];

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
