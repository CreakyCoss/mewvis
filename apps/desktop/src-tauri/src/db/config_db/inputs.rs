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
pub struct SaveProviderModelInput {
    pub id: Option<String>,
    pub model_id: String,
    pub model_name: String,
    pub is_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLlmProviderInput {
    pub id: Option<String>,
    pub name: String,
    pub vendor: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
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
