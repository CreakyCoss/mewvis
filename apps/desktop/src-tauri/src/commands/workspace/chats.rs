use crate::services::chats::{
    self, ChatMeta, ChatPathInput, ChatRecord, DeleteChatInput, LoadChatInput, SaveChatInput,
    SetChatUnreadInput,
};

#[tauri::command]
pub fn list_chats(input: ChatPathInput) -> Result<Vec<ChatMeta>, String> {
    chats::list_chats(input)
}

#[tauri::command]
pub fn load_chat(input: LoadChatInput) -> Result<Option<ChatRecord>, String> {
    chats::load_chat(input)
}

#[tauri::command]
pub fn save_chat(input: SaveChatInput) -> Result<ChatRecord, String> {
    chats::save_chat(input)
}

#[tauri::command]
pub fn delete_chat(input: DeleteChatInput) -> Result<Vec<ChatMeta>, String> {
    chats::delete_chat(input)
}

#[tauri::command]
pub fn set_chat_unread(input: SetChatUnreadInput) -> Result<ChatMeta, String> {
    chats::set_chat_unread(input)
}
