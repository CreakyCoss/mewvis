use crate::db::config_db::{self, CreateWorkspaceInput, Workspace, WorkspaceOverview};
use tauri::AppHandle;

#[tauri::command]
pub fn get_workspace_overview(app: AppHandle) -> Result<WorkspaceOverview, String> {
    config_db::overview(&app)
}

#[tauri::command]
pub fn create_workspace(app: AppHandle, input: CreateWorkspaceInput) -> Result<Workspace, String> {
    config_db::create_workspace(&app, input)
}
