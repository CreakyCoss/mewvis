use crate::services::tavern_sessions::{self, LoadTavernStateInput, SaveTavernStateInput};
use serde_json::Value;

#[tauri::command]
pub fn load_tavern_state(input: LoadTavernStateInput) -> Result<Option<Value>, String> {
    tavern_sessions::load_tavern_state(input)
}

#[tauri::command]
pub fn save_tavern_state(input: SaveTavernStateInput) -> Result<Value, String> {
    tavern_sessions::save_tavern_state(input)
}
