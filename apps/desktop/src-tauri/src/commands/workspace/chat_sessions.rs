use crate::services::chat_sessions::{
    self, ChatSession, ChatSessionMeta, ChatSessionPathInput, DeleteChatSessionInput,
    LoadChatSessionInput, SaveChatSessionInput,
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
