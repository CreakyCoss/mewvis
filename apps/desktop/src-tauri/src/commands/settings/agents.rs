use tauri::AppHandle;

use crate::db::config_db::{
    self, AiAgentSettings, SaveAgentRuntimeSettingsInput, SaveAiAgentInput,
    SaveCollaborationWorkflowInput,
};

#[tauri::command]
pub fn get_ai_agent_settings(app: AppHandle) -> Result<AiAgentSettings, String> {
    config_db::ai_agent_settings(&app)
}

#[tauri::command]
pub fn save_ai_agent(app: AppHandle, input: SaveAiAgentInput) -> Result<AiAgentSettings, String> {
    config_db::save_ai_agent(&app, input)
}

#[tauri::command]
pub fn delete_ai_agent(app: AppHandle, id: String) -> Result<AiAgentSettings, String> {
    config_db::delete_ai_agent(&app, &id)
}

#[tauri::command]
pub fn save_collaboration_workflow(
    app: AppHandle,
    input: SaveCollaborationWorkflowInput,
) -> Result<AiAgentSettings, String> {
    config_db::save_collaboration_workflow(&app, input)
}

#[tauri::command]
pub fn delete_collaboration_workflow(
    app: AppHandle,
    id: String,
) -> Result<AiAgentSettings, String> {
    config_db::delete_collaboration_workflow(&app, &id)
}

#[tauri::command]
pub fn save_agent_runtime_settings(
    app: AppHandle,
    input: SaveAgentRuntimeSettingsInput,
) -> Result<AiAgentSettings, String> {
    config_db::save_agent_runtime_settings(&app, input)
}
