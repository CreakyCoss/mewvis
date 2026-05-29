use crate::db::config_db::{self, LlmSettings, SaveLlmSettingsInput};
use tauri::AppHandle;

#[tauri::command]
pub fn get_llm_settings(app: AppHandle) -> Result<LlmSettings, String> {
    config_db::llm_settings(&app)
}

#[tauri::command]
pub fn save_llm_settings(
    app: AppHandle,
    input: SaveLlmSettingsInput,
) -> Result<LlmSettings, String> {
    config_db::save_llm_settings(&app, input)
}
