use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeModelInput {
    pub provider: String,
    pub api_format: String,
    pub api_key: Option<String>,
    pub catalog_model_id: String,
    pub model_id: String,
    pub api_endpoint: Option<String>,
    pub reasoning: Option<bool>,
    pub thinking_level: Option<String>,
    pub thinking_level_map: Option<Value>,
    pub input: Option<Vec<String>>,
    pub cost: Option<Value>,
    pub context_window: Option<u64>,
    pub max_tokens: Option<u64>,
    pub headers: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeChatMessageInput {
    pub role: String,
    pub content: String,
}
