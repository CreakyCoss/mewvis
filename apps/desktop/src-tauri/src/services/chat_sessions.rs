use crate::services::{
    agent_sessions,
    workspace_paths::{
        ensure_under_root, sanitize_session_id, workspace_app_data_dir, workspace_root,
    },
};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const CHAT_DIR_NAME: &str = "chats";
const META_FILE_NAME: &str = "meta.json";
const MESSAGES_FILE_NAME: &str = "messages.json";
const CONVERSATION_FILE_NAME: &str = "conversation.json";
const CONTEXT_FILE_NAME: &str = "context.json";
const TRACE_FILE_NAME: &str = "trace.json";
static SESSION_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionPathInput {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadChatSessionInput {
    pub workspace_path: String,
    pub session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChatSessionInput {
    pub workspace_path: String,
    pub session_id: Option<String>,
    pub title: Option<String>,
    pub messages: Value,
    pub conversation: Value,
    pub context: Option<Value>,
    pub trace: Option<Value>,
    #[serde(default)]
    pub is_unread: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatSessionInput {
    pub workspace_path: String,
    pub session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetChatSessionUnreadInput {
    pub workspace_path: String,
    pub session_id: String,
    pub is_unread: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionMeta {
    pub id: String,
    pub title: String,
    pub path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: usize,
    pub is_unread: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Value,
    pub conversation: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trace: Option<Value>,
    #[serde(default)]
    pub is_unread: bool,
}

pub fn list_chat_sessions(input: ChatSessionPathInput) -> Result<Vec<ChatSessionMeta>, String> {
    let dir = chat_dir(&input.workspace_path)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|error| format!("无法读取聊天记录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取聊天记录项：{error}"))?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|value| value.to_str()) == Some("json") {
            fs::remove_file(&path).map_err(|error| format!("无法删除旧聊天记录：{error}"))?;
            continue;
        }
        if !path.is_dir() {
            continue;
        }

        let meta_path = path.join(META_FILE_NAME);
        let meta = match read_json_file::<ChatSessionMeta>(&meta_path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        sessions.push(meta);
    }

    sessions.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    Ok(sessions)
}

pub fn load_chat_session(input: LoadChatSessionInput) -> Result<Option<ChatSession>, String> {
    let session_id =
        if let Some(session_id) = input.session_id.filter(|value| !value.trim().is_empty()) {
            Some(session_id)
        } else {
            list_chat_sessions(ChatSessionPathInput {
                workspace_path: input.workspace_path.clone(),
            })?
            .first()
            .map(|session| session.id.clone())
        };
    let Some(session_id) = session_id else {
        return Ok(None);
    };

    load_session_from_dir(&input.workspace_path, &session_id)
}

pub fn save_chat_session(input: SaveChatSessionInput) -> Result<ChatSession, String> {
    let dir = chat_dir(&input.workspace_path)?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建聊天记录目录：{error}"))?;

    let now = now_millis()?;
    let title = normalize_title(input.title.as_deref(), &input.messages);
    let requested_id = input
        .session_id
        .as_deref()
        .map(sanitize_session_id)
        .transpose()?;
    let existing = requested_id.as_deref().and_then(|id| {
        load_existing_session(&input.workspace_path, id)
            .ok()
            .flatten()
    });
    let created_at = existing
        .as_ref()
        .map(|session| session.created_at)
        .unwrap_or(now);
    let id = existing
        .as_ref()
        .map(|session| session.id.clone())
        .or(requested_id)
        .unwrap_or_else(|| create_fallback_session_id(created_at, &title));
    let session = ChatSession {
        id,
        title,
        created_at,
        updated_at: now,
        messages: input.messages,
        conversation: input.conversation,
        context: input.context,
        trace: input.trace,
        is_unread: input.is_unread.unwrap_or(false),
    };
    write_session_files(&input.workspace_path, &session)?;
    Ok(session)
}

pub fn delete_chat_session(input: DeleteChatSessionInput) -> Result<Vec<ChatSessionMeta>, String> {
    let path = session_dir(&input.workspace_path, &input.session_id)?;
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| format!("无法删除聊天记录：{error}"))?;
    }

    agent_sessions::delete_agent_sessions_for_chat(&input.workspace_path, &input.session_id)?;

    list_chat_sessions(ChatSessionPathInput {
        workspace_path: input.workspace_path,
    })
}

pub fn set_chat_session_unread(
    input: SetChatSessionUnreadInput,
) -> Result<ChatSessionMeta, String> {
    let session_dir = session_dir(&input.workspace_path, &input.session_id)?;
    let meta_path = session_dir.join(META_FILE_NAME);
    if !meta_path.exists() {
        return Err("未找到这条聊天记录".to_string());
    }

    let mut meta = read_json_file::<ChatSessionMeta>(&meta_path)
        .map_err(|error| format!("无法解析聊天记录元数据：{error}"))?;
    meta.is_unread = input.is_unread;
    write_json_file(&meta_path, &meta)?;
    Ok(meta)
}

fn load_existing_session(
    workspace_path: &str,
    session_id: &str,
) -> Result<Option<ChatSession>, String> {
    load_chat_session(LoadChatSessionInput {
        workspace_path: workspace_path.to_string(),
        session_id: Some(session_id.to_string()),
    })
}

fn session_meta(session: &ChatSession) -> ChatSessionMeta {
    ChatSessionMeta {
        id: session.id.clone(),
        title: session.title.clone(),
        path: format!("{}/{}/{}", chat_dir_display(), session.id, META_FILE_NAME),
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: session
            .messages
            .as_array()
            .map(|items| items.len())
            .unwrap_or(0),
        is_unread: session.is_unread,
    }
}

fn chat_dir(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(workspace_app_data_dir(&workspace_root(workspace_path)?).join(CHAT_DIR_NAME))
}

fn chat_dir_display() -> String {
    format!(
        "{}/{}",
        crate::product_config::app_data_dir_name(),
        CHAT_DIR_NAME
    )
}

fn session_dir(workspace_path: &str, session_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(session_id)?;
    let dir = chat_dir(workspace_path)?;
    let path = dir.join(id);
    ensure_under_root(&dir, &path)?;
    Ok(path)
}

fn load_session_from_dir(
    workspace_path: &str,
    session_id: &str,
) -> Result<Option<ChatSession>, String> {
    let dir = session_dir(workspace_path, session_id)?;
    if !dir.exists() {
        return Ok(None);
    }

    let meta_path = dir.join(META_FILE_NAME);
    if !meta_path.exists() {
        return Ok(None);
    }

    let meta = read_json_file::<ChatSessionMeta>(&meta_path)
        .map_err(|error| format!("无法解析聊天记录元数据：{error}"))?;
    let messages = read_json_file::<Value>(&dir.join(MESSAGES_FILE_NAME))
        .map_err(|error| format!("无法读取聊天消息：{error}"))?;
    let conversation = read_json_file::<Value>(&dir.join(CONVERSATION_FILE_NAME))
        .map_err(|error| format!("无法读取对话链路：{error}"))?;
    let context = read_optional_json_file::<Value>(&dir.join(CONTEXT_FILE_NAME))
        .map_err(|error| format!("无法读取上下文数据：{error}"))?;
    let trace = read_optional_json_file::<Value>(&dir.join(TRACE_FILE_NAME))
        .map_err(|error| format!("无法读取链路追踪数据：{error}"))?;

    Ok(Some(ChatSession {
        id: meta.id,
        title: meta.title,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        messages,
        conversation,
        context,
        trace,
        is_unread: meta.is_unread,
    }))
}

fn write_session_files(workspace_path: &str, session: &ChatSession) -> Result<(), String> {
    let dir = session_dir(workspace_path, &session.id)?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建聊天记录目录：{error}"))?;

    write_json_file(&dir.join(MESSAGES_FILE_NAME), &session.messages)?;
    write_json_file(&dir.join(CONVERSATION_FILE_NAME), &session.conversation)?;
    write_optional_json_file(&dir.join(CONTEXT_FILE_NAME), session.context.as_ref())?;
    write_optional_json_file(&dir.join(TRACE_FILE_NAME), session.trace.as_ref())?;
    write_json_file(&dir.join(META_FILE_NAME), &session_meta(session))?;
    Ok(())
}

fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path).map_err(|error| format!("无法读取文件：{error}"))?;
    serde_json::from_str::<T>(&content).map_err(|error| format!("无法解析 JSON：{error}"))
}

fn read_optional_json_file<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }

    read_json_file::<T>(path).map(Some)
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("无法序列化聊天记录：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存聊天记录：{error}"))
}

fn write_optional_json_file<T: Serialize>(path: &Path, value: Option<&T>) -> Result<(), String> {
    if let Some(value) = value {
        return write_json_file(path, value);
    }

    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法删除旧上下文文件：{error}"))?;
    }
    Ok(())
}

fn normalize_title(title: Option<&str>, messages: &Value) -> String {
    let explicit = title.map(str::trim).filter(|value| !value.is_empty());
    let inferred = messages
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("role").and_then(Value::as_str) == Some("user"))
        })
        .and_then(|item| item.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty());

    truncate_title(explicit.or(inferred).unwrap_or("新的聊天"))
}

fn truncate_title(title: &str) -> String {
    let title = title.lines().next().unwrap_or("新的聊天").trim();
    let mut chars = title.chars().take(36).collect::<String>();
    if chars.is_empty() {
        chars = "新的聊天".to_string();
    }
    chars
}

fn slugify_title(title: &str) -> String {
    let mut slug = String::new();
    for character in title.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
        } else if character.is_whitespace() || matches!(character, '-' | '_' | '.') {
            if !slug.ends_with('-') {
                slug.push('-');
            }
        } else if ('\u{4e00}'..='\u{9fff}').contains(&character) {
            slug.push(character);
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "chat".to_string()
    } else {
        slug.to_string()
    }
}

fn create_fallback_session_id(created_at: i64, title: &str) -> String {
    let sequence = SESSION_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("chat-{created_at}-{sequence:04}-{}", slugify_title(title))
}

fn now_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?;
    Ok(duration.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    struct TestWorkspace {
        path: PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "{}-{name}-{}",
                crate::product_config::bundle_name(),
                Uuid::now_v7()
            ));
            fs::create_dir_all(&path).expect("create test workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn chat_session_dir(&self, session_id: &str) -> PathBuf {
            workspace_app_data_dir(&self.path).join(session_id)
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn save_test_session(workspace: &TestWorkspace, session_id: &str) -> ChatSession {
        save_chat_session(SaveChatSessionInput {
            workspace_path: workspace.path_string(),
            session_id: Some(session_id.to_string()),
            title: Some("测试聊天".to_string()),
            messages: json!([
                {
                    "role": "user",
                    "text": "长期协作者"
                }
            ]),
            conversation: json!([]),
            context: None,
            trace: None,
            is_unread: None,
        })
        .expect("save chat session")
    }

    #[test]
    fn save_chat_session_uses_requested_session_id() {
        let workspace = TestWorkspace::new("save-requested-id");
        let session = save_test_session(&workspace, "chat-test");

        assert_eq!(session.id, "chat-test");
        let session_dir = workspace.path.join(chat_dir_display()).join("chat-test");
        assert!(session_dir.join(META_FILE_NAME).exists());
        assert!(session_dir.join(MESSAGES_FILE_NAME).exists());
        assert!(session_dir.join(CONVERSATION_FILE_NAME).exists());
    }

    #[test]
    fn delete_chat_session_removes_agent_session_dir() {
        let workspace = TestWorkspace::new("delete-agent-session");
        save_test_session(&workspace, "chat-delete");
        let agent_dir =
            workspace.chat_session_dir("chats/chat-delete/sessions/writer-agent/session-test");
        fs::create_dir_all(&agent_dir).expect("create agent session dir");
        fs::write(agent_dir.join("session.jsonl"), "{}\n").expect("write agent session");

        delete_chat_session(DeleteChatSessionInput {
            workspace_path: workspace.path_string(),
            session_id: "chat-delete".to_string(),
        })
        .expect("delete chat session");

        assert!(!agent_dir.exists());
    }

    #[test]
    fn set_chat_session_unread_keeps_updated_at() {
        let workspace = TestWorkspace::new("set-unread");
        let session = save_test_session(&workspace, "chat-unread");
        let meta = set_chat_session_unread(SetChatSessionUnreadInput {
            workspace_path: workspace.path_string(),
            session_id: session.id.clone(),
            is_unread: true,
        })
        .expect("set unread");

        assert!(meta.is_unread);
        assert_eq!(meta.updated_at, session.updated_at);

        let loaded = load_chat_session(LoadChatSessionInput {
            workspace_path: workspace.path_string(),
            session_id: Some(session.id),
        })
        .expect("load session")
        .expect("session exists");
        assert!(loaded.is_unread);
        assert_eq!(loaded.updated_at, meta.updated_at);
    }
}
