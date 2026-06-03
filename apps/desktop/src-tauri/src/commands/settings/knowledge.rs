use crate::db::config_db::{
    self, EmbeddingProfile, KnowledgeLibrary, KnowledgeSettings, SaveEmbeddingProfileInput,
    SaveKnowledgeCollectionInput, SaveKnowledgeSettingsInput, SaveKnowledgeSourceInput,
    SetKnowledgeCollectionSourcesInput,
};
use crate::services::knowledge::{
    self as knowledge_service, KnowledgeIndexStatus, RebuildKnowledgeIndexResult,
};
use serde::Deserialize;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildKnowledgeIndexInput {
    pub source_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportKnowledgeFilesInput {
    pub paths: Vec<String>,
}

#[tauri::command]
pub fn list_knowledge_library(app: AppHandle) -> Result<KnowledgeLibrary, String> {
    config_db::knowledge_library(&app)
}

#[tauri::command]
pub fn get_knowledge_settings(app: AppHandle) -> Result<KnowledgeSettings, String> {
    config_db::knowledge_settings(&app)
}

#[tauri::command]
pub fn list_embedding_profiles(app: AppHandle) -> Result<Vec<EmbeddingProfile>, String> {
    config_db::embedding_profiles(&app)
}

#[tauri::command]
pub fn save_embedding_profile(
    app: AppHandle,
    input: SaveEmbeddingProfileInput,
) -> Result<Vec<EmbeddingProfile>, String> {
    let profiles = config_db::save_embedding_profile(&app, input)?;
    knowledge_service::mark_knowledge_index_stale(&app)?;
    Ok(profiles)
}

#[tauri::command]
pub fn save_knowledge_settings(
    app: AppHandle,
    input: SaveKnowledgeSettingsInput,
) -> Result<KnowledgeSettings, String> {
    config_db::save_knowledge_settings(&app, input)
}

#[tauri::command]
pub fn get_knowledge_index_status(app: AppHandle) -> Result<KnowledgeIndexStatus, String> {
    knowledge_service::knowledge_index_status(&app)
}

#[tauri::command]
pub fn rebuild_knowledge_index(
    app: AppHandle,
    input: Option<RebuildKnowledgeIndexInput>,
) -> Result<RebuildKnowledgeIndexResult, String> {
    knowledge_service::rebuild_knowledge_index(&app, input.and_then(|value| value.source_ids))
}

#[tauri::command]
pub fn save_knowledge_collection(
    app: AppHandle,
    input: SaveKnowledgeCollectionInput,
) -> Result<KnowledgeLibrary, String> {
    config_db::save_knowledge_collection(&app, input)
}

#[tauri::command]
pub fn delete_knowledge_collection(
    app: AppHandle,
    collection_id: String,
) -> Result<KnowledgeLibrary, String> {
    config_db::delete_knowledge_collection(&app, &collection_id)
}

#[tauri::command]
pub fn save_knowledge_source(
    app: AppHandle,
    input: SaveKnowledgeSourceInput,
) -> Result<KnowledgeLibrary, String> {
    let library = config_db::save_knowledge_source(&app, input)?;
    knowledge_service::mark_knowledge_index_stale(&app)?;
    Ok(library)
}

#[tauri::command]
pub fn import_knowledge_files(
    app: AppHandle,
    input: ImportKnowledgeFilesInput,
) -> Result<KnowledgeLibrary, String> {
    knowledge_service::import_knowledge_files(&app, input.paths)
}

#[tauri::command]
pub fn delete_knowledge_source(
    app: AppHandle,
    source_id: String,
) -> Result<KnowledgeLibrary, String> {
    let library = config_db::delete_knowledge_source(&app, &source_id)?;
    knowledge_service::delete_source_index(&app, &source_id)?;
    Ok(library)
}

#[tauri::command]
pub fn set_knowledge_collection_sources(
    app: AppHandle,
    input: SetKnowledgeCollectionSourcesInput,
) -> Result<KnowledgeLibrary, String> {
    config_db::set_knowledge_collection_sources(&app, input)
}
