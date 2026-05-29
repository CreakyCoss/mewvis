use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, State};

use crate::db::{
    paths::config_db_path,
    rebuild::DatabaseRestoreReport,
    setup::{
        initialize_config_database, rebuild_config_database_path,
        rebuild_workspace_database as rebuild_workspace_database_path,
    },
};

#[derive(Default)]
pub struct AppStartupState {
    config_database_error: Mutex<Option<String>>,
}

impl AppStartupState {
    pub fn initialize_config_database(&self, app: &AppHandle) {
        match initialize_config_database(app) {
            Ok(()) => self.clear_config_database_error(),
            Err(error) => self.set_config_database_error(error),
        }
    }

    fn config_database_error(&self) -> Option<String> {
        self.config_database_error
            .lock()
            .ok()
            .and_then(|error| error.clone())
    }

    fn set_config_database_error(&self, error: String) {
        if let Ok(mut current) = self.config_database_error.lock() {
            *current = Some(error);
        }
    }

    fn clear_config_database_error(&self) {
        if let Ok(mut current) = self.config_database_error.lock() {
            *current = None;
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDatabaseStatus {
    config_db_path: String,
    setup_error: Option<String>,
    can_rebuild: bool,
    last_rebuild: Option<DatabaseRestoreReport>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildWorkspaceDatabaseInput {
    workspace_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildWorkspaceDatabaseOutput {
    workspace_db_path: String,
    rebuild: DatabaseRestoreReport,
}

#[tauri::command]
pub fn get_config_database_status(
    app: AppHandle,
    state: State<AppStartupState>,
) -> Result<ConfigDatabaseStatus, String> {
    config_database_status(&app, &state, None)
}

#[tauri::command]
pub fn rebuild_config_database(
    app: AppHandle,
    state: State<AppStartupState>,
) -> Result<ConfigDatabaseStatus, String> {
    let db_path = config_db_path(&app)?;
    let rebuild = rebuild_config_database_path(&db_path)?;
    state.clear_config_database_error();
    config_database_status(&app, &state, Some(rebuild))
}

#[tauri::command]
pub fn rebuild_workspace_database(
    input: RebuildWorkspaceDatabaseInput,
) -> Result<RebuildWorkspaceDatabaseOutput, String> {
    let workspace_path = PathBuf::from(input.workspace_path.trim());
    if workspace_path.as_os_str().is_empty() {
        return Err("工作区路径不能为空".to_string());
    }

    let rebuild = rebuild_workspace_database_path(&workspace_path)?;
    Ok(RebuildWorkspaceDatabaseOutput {
        workspace_db_path: workspace_path
            .join("workspace.db")
            .to_string_lossy()
            .to_string(),
        rebuild,
    })
}

fn config_database_status(
    app: &AppHandle,
    state: &AppStartupState,
    last_rebuild: Option<DatabaseRestoreReport>,
) -> Result<ConfigDatabaseStatus, String> {
    let db_path = config_db_path(app)?;
    Ok(ConfigDatabaseStatus {
        config_db_path: db_path.to_string_lossy().to_string(),
        setup_error: state.config_database_error(),
        can_rebuild: true,
        last_rebuild,
    })
}
