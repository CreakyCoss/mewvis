use crate::services::{
    agent_sessions::{
        self, AgentSessionStatus, AgentSessionStatusInput, CleanupAgentSessionsInput,
        CleanupAgentSessionsResult,
    },
    chat_sessions::{self, ChatSessionPathInput},
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetAgentSessionsForChatInput {
    pub workspace_path: String,
    pub chat_session_id: String,
}

#[tauri::command]
pub fn get_agent_session_status(
    input: AgentSessionStatusInput,
) -> Result<AgentSessionStatus, String> {
    agent_sessions::get_agent_session_status(input)
}

#[tauri::command]
pub fn cleanup_orphan_agent_sessions(
    input: CleanupAgentSessionsInput,
) -> Result<CleanupAgentSessionsResult, String> {
    let valid_chat_ids = chat_sessions::list_chat_sessions(ChatSessionPathInput {
        workspace_path: input.workspace_path.clone(),
    })?
    .into_iter()
    .map(|session| session.id)
    .collect();

    agent_sessions::cleanup_orphan_agent_sessions(input, &valid_chat_ids)
}

#[tauri::command]
pub fn reset_agent_sessions_for_chat(input: ResetAgentSessionsForChatInput) -> Result<(), String> {
    agent_sessions::delete_agent_sessions_for_chat(&input.workspace_path, &input.chat_session_id)
}
