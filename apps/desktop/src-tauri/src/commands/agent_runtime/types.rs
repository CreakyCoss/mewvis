use serde::{Deserialize, Serialize};

pub(super) use super::protocol::RuntimeModelInput as AgentRuntimeModelInput;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeChatMessageInput {
    pub role: String,
    pub content: String,
}
