use crate::services::chat_sessions::{
    self, AgentSessionStatus, AgentSessionStatusInput, ChatSession, ChatSessionMeta,
    ChatSessionPathInput, CleanupAgentSessionsInput, CleanupAgentSessionsResult,
    DeleteChatSessionInput, LoadChatSessionInput, SaveChatSessionInput,
};

#[tauri::command]
pub fn list_chat_sessions(input: ChatSessionPathInput) -> Result<Vec<ChatSessionMeta>, String> {
    chat_sessions::list_chat_sessions(input)
}

#[tauri::command]
pub fn load_chat_session(input: LoadChatSessionInput) -> Result<Option<ChatSession>, String> {
    chat_sessions::load_chat_session(input)
}

#[tauri::command]
pub fn save_chat_session(input: SaveChatSessionInput) -> Result<ChatSession, String> {
    chat_sessions::save_chat_session(input)
}

#[tauri::command]
pub fn delete_chat_session(input: DeleteChatSessionInput) -> Result<Vec<ChatSessionMeta>, String> {
    chat_sessions::delete_chat_session(input)
}

#[tauri::command]
pub fn get_agent_session_status(
    input: AgentSessionStatusInput,
) -> Result<AgentSessionStatus, String> {
    chat_sessions::get_agent_session_status(input)
}

#[tauri::command]
pub fn cleanup_orphan_agent_sessions(
    input: CleanupAgentSessionsInput,
) -> Result<CleanupAgentSessionsResult, String> {
    chat_sessions::cleanup_orphan_agent_sessions(input)
}
