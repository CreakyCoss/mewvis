use crate::services::story_sessions::{self, LoadStoryStateInput, SaveStoryStateInput};
use serde_json::Value;

#[tauri::command]
pub fn load_story_state(input: LoadStoryStateInput) -> Result<Option<Value>, String> {
    story_sessions::load_story_state(input)
}

#[tauri::command]
pub fn save_story_state(input: SaveStoryStateInput) -> Result<Value, String> {
    story_sessions::save_story_state(input)
}
