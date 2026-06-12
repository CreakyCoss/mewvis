use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub group_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWorkspaceInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub path: String,
    pub group_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderModelInput {
    pub id: Option<String>,
    pub model_id: String,
    pub model_name: String,
    pub is_enabled: bool,
    pub is_one_million_context: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub provider: String,
    pub api_format: String,
    pub api_key: Option<String>,
    pub api_endpoint: Option<String>,
    pub is_default: bool,
    pub models: Vec<SaveProviderModelInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmSettingsInput {
    pub providers: Vec<SaveLlmProviderInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkspaceSkillsInput {
    pub workspace_id: String,
    pub enabled_skill_names: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiAgentInput {
    pub id: Option<String>,
    pub name: String,
    pub avatar: String,
    pub description: Option<String>,
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCollaborationWorkflowStepInput {
    pub id: Option<String>,
    pub name: String,
    pub agent_id: String,
    pub instruction: Option<String>,
    pub phase: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCollaborationWorkflowInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub writer_agent_id: String,
    pub reviewer_agent_id: String,
    pub draft_instruction: Option<String>,
    pub review_instruction: Option<String>,
    pub revise_instruction: Option<String>,
    pub steps: Option<Vec<SaveCollaborationWorkflowStepInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKnowledgeCollectionInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub order: Option<i64>,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKnowledgeSourceInput {
    pub id: Option<String>,
    pub kind: String,
    pub uri: String,
    pub title: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub include_patterns_json: Option<String>,
    pub exclude_patterns_json: Option<String>,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKnowledgeSettingsInput {
    pub storage_directory: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetKnowledgeCollectionSourcesInput {
    pub collection_id: String,
    pub source_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEmbeddingProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub provider_kind: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model_id: String,
    pub dimensions: i64,
    pub batch_size: Option<i64>,
    pub is_default: bool,
}
