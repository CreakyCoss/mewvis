use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeProviderInput {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub provider: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeModelInput {
    pub id: String,
    pub model_id: String,
    pub model_name: String,
    pub base_url: Option<String>,
    pub reasoning: Option<bool>,
    pub thinking_level_map: Option<Value>,
    pub input: Option<Vec<String>>,
    pub cost: Option<Value>,
    pub context_window: Option<u64>,
    pub max_tokens: Option<u64>,
    pub headers: Option<Value>,
    pub compat: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeChatMessageInput {
    pub role: String,
    pub content: String,
}
