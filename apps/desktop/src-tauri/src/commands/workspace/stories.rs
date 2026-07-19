use crate::db::config_db::{
    self, CreateStoryRecordInput, DeleteStoryRecordInput, ImportStoryRecordInput, StoryRecord,
    UpdateStoryRecordInput,
};
use tauri::AppHandle;

#[tauri::command]
pub fn list_story_records(app: AppHandle) -> Result<Vec<StoryRecord>, String> {
    config_db::list_story_records(&app)
}

#[tauri::command]
pub fn create_story_record(
    app: AppHandle,
    input: CreateStoryRecordInput,
) -> Result<StoryRecord, String> {
    config_db::create_story_record(&app, input)
}

#[tauri::command]
pub fn import_story_record(
    app: AppHandle,
    input: ImportStoryRecordInput,
) -> Result<StoryRecord, String> {
    config_db::import_story_record(&app, input)
}

#[tauri::command]
pub fn update_story_record(
    app: AppHandle,
    input: UpdateStoryRecordInput,
) -> Result<StoryRecord, String> {
    config_db::update_story_record(&app, input)
}

#[tauri::command]
pub fn delete_story_record(app: AppHandle, input: DeleteStoryRecordInput) -> Result<(), String> {
    config_db::delete_story_record(&app, input)
}
