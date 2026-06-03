use serde::Deserialize;
use tauri::AppHandle;

use crate::services::knowledge::{self as knowledge_service, KnowledgeSearchResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchWorkspaceKnowledgeInput {
    pub workspace_id: Option<String>,
    pub query: String,
    pub max_results: Option<usize>,
    pub min_score: Option<f64>,
}

#[tauri::command]
pub fn search_workspace_knowledge(
    app: AppHandle,
    input: SearchWorkspaceKnowledgeInput,
) -> Result<KnowledgeSearchResult, String> {
    let workspace_id = input.workspace_id.unwrap_or_default();
    knowledge_service::search_enabled_knowledge(
        &app,
        &workspace_id,
        &input.query,
        input.max_results.unwrap_or(8),
        input.min_score.unwrap_or(0.0),
    )
}
