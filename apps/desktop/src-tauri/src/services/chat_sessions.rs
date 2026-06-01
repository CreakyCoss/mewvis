use crate::services::{
    agent_sessions,
    workspace_paths::{
        ensure_under_root, sanitize_session_id, workspace_app_data_dir, workspace_root,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const CHAT_DIR_NAME: &str = "chats";

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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatSessionInput {
    pub workspace_path: String,
    pub session_id: String,
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
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        let session = match serde_json::from_str::<ChatSession>(&content) {
            Ok(session) => session,
            Err(_) => continue,
        };
        sessions.push(session_meta(&session));
    }

    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(sessions)
}

pub fn load_chat_session(input: LoadChatSessionInput) -> Result<Option<ChatSession>, String> {
    let sessions = list_chat_sessions(ChatSessionPathInput {
        workspace_path: input.workspace_path.clone(),
    })?;
    let session_id = input
        .session_id
        .filter(|value| !value.trim().is_empty())
        .or_else(|| sessions.first().map(|session| session.id.clone()));
    let Some(session_id) = session_id else {
        return Ok(None);
    };

    let path = session_path(&input.workspace_path, &session_id)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|error| format!("无法读取聊天记录：{error}"))?;
    let session = serde_json::from_str::<ChatSession>(&content)
        .map_err(|error| format!("无法解析聊天记录：{error}"))?;
    Ok(Some(session))
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
        .unwrap_or_else(|| format!("{created_at}-{}", slugify_title(&title)));
    let session = ChatSession {
        id,
        title,
        created_at,
        updated_at: now,
        messages: input.messages,
        conversation: input.conversation,
        context: input.context,
    };
    let path = session_path(&input.workspace_path, &session.id)?;
    let content = serde_json::to_string_pretty(&session)
        .map_err(|error| format!("无法序列化聊天记录：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存聊天记录：{error}"))?;
    Ok(session)
}

pub fn delete_chat_session(input: DeleteChatSessionInput) -> Result<Vec<ChatSessionMeta>, String> {
    let path = session_path(&input.workspace_path, &input.session_id)?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法删除聊天记录：{error}"))?;
    }

    agent_sessions::delete_agent_sessions_for_chat(&input.workspace_path, &input.session_id)?;

    list_chat_sessions(ChatSessionPathInput {
        workspace_path: input.workspace_path,
    })
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
        path: format!("{}/{}.json", chat_dir_display(), session.id),
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: session
            .messages
            .as_array()
            .map(|items| items.len())
            .unwrap_or(0),
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

fn session_path(workspace_path: &str, session_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(session_id)?;
    let dir = chat_dir(workspace_path)?;
    let path = dir.join(format!("{id}.json"));
    ensure_under_root(&dir, &path)?;
    Ok(path)
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

        fn agent_session_dir(&self, session_id: &str) -> PathBuf {
            workspace_app_data_dir(&self.path)
                .join("agent-sessions")
                .join(session_id)
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
        })
        .expect("save chat session")
    }

    #[test]
    fn save_chat_session_uses_requested_session_id() {
        let workspace = TestWorkspace::new("save-requested-id");
        let session = save_test_session(&workspace, "chat-test");

        assert_eq!(session.id, "chat-test");
        assert!(workspace
            .path
            .join(chat_dir_display())
            .join("chat-test.json")
            .exists());
    }

    #[test]
    fn delete_chat_session_removes_agent_session_dir() {
        let workspace = TestWorkspace::new("delete-agent-session");
        save_test_session(&workspace, "chat-delete");
        let agent_dir = workspace.agent_session_dir("writer-agent/chat-delete");
        fs::create_dir_all(&agent_dir).expect("create agent session dir");
        fs::write(agent_dir.join("session.jsonl"), "{}\n").expect("write agent session");

        delete_chat_session(DeleteChatSessionInput {
            workspace_path: workspace.path_string(),
            session_id: "chat-delete".to_string(),
        })
        .expect("delete chat session");

        assert!(!agent_dir.exists());
    }
}
