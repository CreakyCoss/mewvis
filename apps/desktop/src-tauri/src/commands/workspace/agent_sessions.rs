use crate::services::{
    agent_sessions::{
        self, AgentSessionStatus, AgentSessionStatusInput, CleanupAgentSessionsInput,
        CleanupAgentSessionsResult,
    },
    chats::{self, ChatPathInput},
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetAgentSessionsForChatInput {
    pub workspace_path: String,
    pub chat_id: String,
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
    let valid_chat_ids = chats::list_chats(ChatPathInput {
        workspace_path: input.workspace_path.clone(),
    })?
    .into_iter()
    .map(|chat| chat.id)
    .collect();

    agent_sessions::cleanup_orphan_agent_sessions(input, &valid_chat_ids)
}

#[tauri::command]
pub fn reset_agent_sessions_for_chat(input: ResetAgentSessionsForChatInput) -> Result<(), String> {
    agent_sessions::delete_agent_sessions_for_chat(&input.workspace_path, &input.chat_id)
}
