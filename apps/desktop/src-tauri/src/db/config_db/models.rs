use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGroup {
    pub id: String,
    pub name: String,
    pub order: i64,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub is_default: bool,
    pub is_pinned: bool,
    pub order: i64,
    pub group_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceOverview {
    pub config_db_path: String,
    pub groups: Vec<WorkspaceGroup>,
    pub workspaces: Vec<Workspace>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmProvider {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub models: Vec<ProviderModel>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub provider_id: String,
    pub model_id: String,
    pub model_name: String,
    pub is_enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmSettings {
    pub providers: Vec<LlmProvider>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgent {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub description: Option<String>,
    pub provider_id: String,
    pub model_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationWorkflowStep {
    pub id: String,
    pub name: String,
    pub agent_id: String,
    pub instruction: Option<String>,
    pub phase: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollaborationWorkflow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub writer_agent_id: String,
    pub reviewer_agent_id: String,
    pub draft_instruction: Option<String>,
    pub review_instruction: Option<String>,
    pub revise_instruction: Option<String>,
    pub steps: Vec<CollaborationWorkflowStep>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CollaborationWorkflowStepRecord {
    pub id: String,
    pub name: String,
    pub agent_id: String,
    pub instruction: Option<String>,
    pub phase: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentSettings {
    pub agents: Vec<AiAgent>,
    pub collaboration_workflows: Vec<CollaborationWorkflow>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillSettings {
    pub enabled_skill_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCollection {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub order: i64,
    pub enabled: bool,
    pub source_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSource {
    pub id: String,
    pub kind: String,
    pub uri: String,
    pub title: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub include_patterns_json: Option<String>,
    pub exclude_patterns_json: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLibrary {
    pub collections: Vec<KnowledgeCollection>,
    pub sources: Vec<KnowledgeSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSettings {
    pub storage_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProfile {
    pub id: String,
    pub name: String,
    pub provider_id: Option<String>,
    pub provider_kind: String,
    pub base_url: Option<String>,
    pub model_id: String,
    pub dimensions: i64,
    pub batch_size: i64,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}
