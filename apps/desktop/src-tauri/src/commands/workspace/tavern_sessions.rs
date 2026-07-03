use crate::services::tavern_sessions::{
    self, ClearTavernStateInput, LoadTavernStateInput, SaveTavernStateInput,
};
use serde_json::Value;

#[tauri::command]
pub fn load_tavern_state(input: LoadTavernStateInput) -> Result<Option<Value>, String> {
    tavern_sessions::load_tavern_state(input)
}

#[tauri::command]
pub fn save_tavern_state(input: SaveTavernStateInput) -> Result<Value, String> {
    tavern_sessions::save_tavern_state(input)
}

#[tauri::command]
pub fn clear_tavern_state(input: ClearTavernStateInput) -> Result<(), String> {
    tavern_sessions::clear_tavern_state(input)
}
