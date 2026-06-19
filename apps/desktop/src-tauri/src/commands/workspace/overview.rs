use crate::db::config_db::{
    self, CreateWorkspaceInput, DeleteWorkspaceInput, UpdateWorkspaceInput, Workspace,
    WorkspaceOverview,
};
use tauri::AppHandle;

#[tauri::command]
pub fn get_workspace_overview(app: AppHandle) -> Result<WorkspaceOverview, String> {
    config_db::overview(&app)
}

#[tauri::command]
pub fn create_workspace(app: AppHandle, input: CreateWorkspaceInput) -> Result<Workspace, String> {
    config_db::create_workspace(&app, input)
}

#[tauri::command]
pub fn update_workspace(app: AppHandle, input: UpdateWorkspaceInput) -> Result<Workspace, String> {
    config_db::update_workspace(&app, input)
}

#[tauri::command]
pub fn delete_workspace(app: AppHandle, input: DeleteWorkspaceInput) -> Result<(), String> {
    config_db::delete_workspace(&app, input)
}
