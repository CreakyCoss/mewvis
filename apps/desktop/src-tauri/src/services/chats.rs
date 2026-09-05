use crate::services::workspace_paths::{
    ensure_under_root, sanitize_session_id, workspace_app_data_dir, workspace_root,
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
const OPTIONS_FILE_NAME: &str = "options.json";
#[cfg(test)]
const LEGACY_CONVERSATION_FILE_NAME: &str = "conversation.json";
static CHAT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPathInput {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadChatInput {
    pub workspace_path: String,
    pub chat_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChatInput {
    pub workspace_path: String,
    pub chat_id: Option<String>,
    pub title: Option<String>,
    pub messages: Value,
    #[serde(default)]
    pub options: Option<Value>,
    #[serde(default)]
    pub is_unread: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatInput {
    pub workspace_path: String,
    pub chat_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetChatUnreadInput {
    pub workspace_path: String,
    pub chat_id: String,
    pub is_unread: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMeta {
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
pub struct ChatRecord {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Value,
    #[serde(default)]
    pub options: Option<Value>,
    #[serde(default)]
    pub is_unread: bool,
}

pub fn list_chats(input: ChatPathInput) -> Result<Vec<ChatMeta>, String> {
    let dir = chat_dir(&input.workspace_path)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut chats = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|error| format!("无法读取聊天记录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取聊天记录项：{error}"))?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|value| value.to_str()) == Some("json") {
            // Unknown/legacy records are preserved; listing must never migrate data.
            continue;
        }
        if !path.is_dir()
            || entry
                .file_name()
                .to_string_lossy()
                .starts_with(".pending-chat-")
        {
            continue;
        }

        let meta_path = path.join(META_FILE_NAME);
        let meta = match read_json_file::<ChatMeta>(&meta_path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        chats.push(meta);
    }

    chats.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    Ok(chats)
}

pub fn load_chat(input: LoadChatInput) -> Result<Option<ChatRecord>, String> {
    let chat_id = if let Some(chat_id) = input.chat_id.filter(|value| !value.trim().is_empty()) {
        Some(chat_id)
    } else {
        list_chats(ChatPathInput {
            workspace_path: input.workspace_path.clone(),
        })?
        .first()
        .map(|chat| chat.id.clone())
    };
    let Some(chat_id) = chat_id else {
        return Ok(None);
    };

    load_chat_from_dir(&input.workspace_path, &chat_id)
}

pub fn save_chat(input: SaveChatInput) -> Result<ChatRecord, String> {
    let dir = chat_dir(&input.workspace_path)?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建聊天记录目录：{error}"))?;

    let now = now_millis()?;
    let title = normalize_title(input.title.as_deref(), &input.messages);
    let requested_id = input
        .chat_id
        .as_deref()
        .map(sanitize_session_id)
        .transpose()?;
    let existing = match requested_id.as_deref() {
        Some(id) => load_existing_chat(&input.workspace_path, id)?,
        None => None,
    };
    let created_at = existing.as_ref().map(|chat| chat.created_at).unwrap_or(now);
    let id = existing
        .as_ref()
        .map(|chat| chat.id.clone())
        .or(requested_id)
        .unwrap_or_else(|| create_fallback_chat_id(created_at, &title));
    let options = input.options.or_else(|| {
        existing
            .as_ref()
            .and_then(|chat| chat.options.as_ref().cloned())
    });
    let chat = ChatRecord {
        id,
        title,
        created_at,
        updated_at: now,
        messages: input.messages,
        options,
        is_unread: input.is_unread.unwrap_or(false),
    };
    write_chat_files(&input.workspace_path, &chat)?;
    Ok(chat)
}

pub fn delete_chat(input: DeleteChatInput) -> Result<Vec<ChatMeta>, String> {
    let path = chat_record_dir(&input.workspace_path, &input.chat_id)?;
    if path.exists() {
        fs::remove_dir_all(path).map_err(|error| format!("无法删除聊天记录：{error}"))?;
    }

    list_chats(ChatPathInput {
        workspace_path: input.workspace_path,
    })
}

pub fn set_chat_unread(input: SetChatUnreadInput) -> Result<ChatMeta, String> {
    let chat_record_dir = chat_record_dir(&input.workspace_path, &input.chat_id)?;
    let meta_path = chat_record_dir.join(META_FILE_NAME);
    if !meta_path.exists() {
        return Err("未找到这条聊天记录".to_string());
    }

    let mut meta = read_json_file::<ChatMeta>(&meta_path)
        .map_err(|error| format!("无法解析聊天记录元数据：{error}"))?;
    meta.is_unread = input.is_unread;
    write_json_file(&meta_path, &meta)?;
    Ok(meta)
}

fn load_existing_chat(workspace_path: &str, chat_id: &str) -> Result<Option<ChatRecord>, String> {
    load_chat(LoadChatInput {
        workspace_path: workspace_path.to_string(),
        chat_id: Some(chat_id.to_string()),
    })
}

fn chat_meta(chat: &ChatRecord) -> ChatMeta {
    ChatMeta {
        id: chat.id.clone(),
        title: chat.title.clone(),
        path: format!("{}/{}/{}", chat_dir_display(), chat.id, META_FILE_NAME),
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        message_count: chat
            .messages
            .as_array()
            .map(|items| items.len())
            .unwrap_or(0),
        is_unread: chat.is_unread,
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

fn chat_record_dir(workspace_path: &str, chat_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(chat_id)?;
    let dir = chat_dir(workspace_path)?;
    let path = dir.join(id);
    ensure_under_root(&dir, &path)?;
    Ok(path)
}

fn load_chat_from_dir(workspace_path: &str, chat_id: &str) -> Result<Option<ChatRecord>, String> {
    let dir = chat_record_dir(workspace_path, chat_id)?;
    if !dir.exists() {
        return Ok(None);
    }

    let meta_path = dir.join(META_FILE_NAME);
    if !meta_path.exists() {
        return Err("聊天记录目录缺少元数据，已保留原文件；不会用空记录覆盖".to_string());
    }

    let meta = read_json_file::<ChatMeta>(&meta_path)
        .map_err(|error| format!("无法解析聊天记录元数据：{error}"))?;
    let messages = read_json_file::<Value>(&dir.join(MESSAGES_FILE_NAME))
        .map_err(|error| format!("无法读取聊天消息：{error}"))?;
    let options_path = dir.join(OPTIONS_FILE_NAME);
    let options = if options_path.exists() {
        Some(
            read_json_file::<Value>(&options_path)
                .map_err(|error| format!("无法读取聊天选项：{error}"))?,
        )
    } else {
        None
    };

    Ok(Some(ChatRecord {
        id: meta.id,
        title: meta.title,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        messages,
        options,
        is_unread: meta.is_unread,
    }))
}

fn write_chat_files(workspace_path: &str, chat: &ChatRecord) -> Result<(), String> {
    let dir = chat_record_dir(workspace_path, &chat.id)?;
    if dir.exists() {
        return write_chat_record(&dir, chat);
    }
    // A failed first save must not leave a partial record that blocks retries.
    let pending = chat_dir(workspace_path)?.join(format!(".pending-chat-{}", uuid::Uuid::now_v7()));
    fs::create_dir(&pending).map_err(|error| format!("无法创建聊天记录临时目录：{error}"))?;
    let result = write_chat_record(&pending, chat).and_then(|()| {
        if dir.exists() {
            return Err("聊天记录目录已被创建，请重新加载后重试".to_string());
        }
        fs::rename(&pending, &dir).map_err(|error| format!("无法完成聊天记录创建：{error}"))
    });
    if result.is_err() {
        let _ = fs::remove_dir_all(&pending);
    }
    result
}

fn write_chat_record(dir: &Path, chat: &ChatRecord) -> Result<(), String> {
    write_json_file(&dir.join(MESSAGES_FILE_NAME), &chat.messages)?;
    let options_path = dir.join(OPTIONS_FILE_NAME);
    if let Some(options) = &chat.options {
        write_json_file(&options_path, options)?;
    } else if options_path.exists() {
        fs::remove_file(&options_path).map_err(|error| format!("无法删除聊天选项：{error}"))?;
    }
    write_json_file(&dir.join(META_FILE_NAME), &chat_meta(chat))?;
    Ok(())
}

fn read_json_file<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path).map_err(|error| format!("无法读取文件：{error}"))?;
    serde_json::from_str::<T>(&content).map_err(|error| format!("无法解析 JSON：{error}"))
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("无法序列化聊天记录：{error}"))?;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::now_v7()));
    let result = (|| {
        use std::io::Write;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("无法创建聊天记录临时文件：{error}"))?;
        file.write_all(content.as_bytes())
            .map_err(|error| format!("无法保存聊天记录：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法同步聊天记录：{error}"))?;
        fs::rename(&temporary, path).map_err(|error| format!("无法替换聊天记录：{error}"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
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

fn create_fallback_chat_id(created_at: i64, title: &str) -> String {
    let sequence = CHAT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
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

        fn agent_session_dir(&self, session_root_dir: &str) -> PathBuf {
            workspace_app_data_dir(&self.path).join(session_root_dir)
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn save_test_chat(workspace: &TestWorkspace, chat_id: &str) -> ChatRecord {
        save_chat(SaveChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some(chat_id.to_string()),
            title: Some("测试聊天".to_string()),
            messages: json!([
                {
                    "role": "user",
                    "text": "长期协作者"
                }
            ]),
            options: None,
            is_unread: None,
        })
        .expect("save chat")
    }

    #[test]
    fn listing_and_loading_preserve_legacy_and_runtime_files() {
        let workspace = TestWorkspace::new("legacy-preserved");
        save_test_chat(&workspace, "chat-existing");
        let dir = chat_record_dir(&workspace.path_string(), "chat-existing").unwrap();
        fs::write(dir.join("conversation.json"), "legacy content").unwrap();
        fs::write(dir.join("context.json"), "legacy context").unwrap();
        fs::create_dir_all(dir.join("session")).unwrap();
        fs::write(dir.join("session/pi.jsonl"), "pi context").unwrap();
        let loose = chat_dir(&workspace.path_string()).unwrap().join("old.json");
        fs::write(&loose, "legacy loose").unwrap();
        let listed = list_chats(ChatPathInput {
            workspace_path: workspace.path_string(),
        })
        .unwrap();
        assert_eq!(listed.len(), 1);
        load_chat(LoadChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some("chat-existing".into()),
        })
        .unwrap()
        .unwrap();
        save_test_chat(&workspace, "chat-existing");
        assert_eq!(
            fs::read_to_string(dir.join("conversation.json")).unwrap(),
            "legacy content"
        );
        assert_eq!(
            fs::read_to_string(dir.join("context.json")).unwrap(),
            "legacy context"
        );
        assert_eq!(
            fs::read_to_string(dir.join("session/pi.jsonl")).unwrap(),
            "pi context"
        );
        assert_eq!(fs::read_to_string(loose).unwrap(), "legacy loose");
    }

    #[test]
    fn corrupted_or_unknown_history_is_not_overwritten() {
        let workspace = TestWorkspace::new("corrupt-preserved");
        save_test_chat(&workspace, "chat-corrupt");
        let dir = chat_record_dir(&workspace.path_string(), "chat-corrupt").unwrap();
        fs::write(dir.join(MESSAGES_FILE_NAME), "broken json").unwrap();
        let result = save_chat(SaveChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some("chat-corrupt".into()),
            title: None,
            messages: json!([]),
            options: None,
            is_unread: None,
        });
        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(dir.join(MESSAGES_FILE_NAME)).unwrap(),
            "broken json"
        );
        let unknown = chat_record_dir(&workspace.path_string(), "chat-unknown").unwrap();
        fs::create_dir_all(&unknown).unwrap();
        fs::write(unknown.join("conversation.json"), "unknown format").unwrap();
        assert!(load_chat(LoadChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some("chat-unknown".into())
        })
        .is_err());
        assert!(unknown.join("conversation.json").exists());
    }

    #[test]
    fn save_chat_uses_requested_chat_id() {
        let workspace = TestWorkspace::new("save-requested-id");
        let chat = save_test_chat(&workspace, "chat-test");

        assert_eq!(chat.id, "chat-test");
        let chat_dir = workspace.path.join(chat_dir_display()).join("chat-test");
        assert!(chat_dir.join(META_FILE_NAME).exists());
        assert!(chat_dir.join(MESSAGES_FILE_NAME).exists());
        assert!(!chat_dir.join(LEGACY_CONVERSATION_FILE_NAME).exists());
    }

    #[test]
    fn save_chat_persists_and_preserves_options() {
        let workspace = TestWorkspace::new("save-options");
        let options = json!({
            "selectedModelId": "model-test",
            "selectedSkillKeys": ["skill-test"],
            "showThinkingProcess": false
        });
        let chat = save_chat(SaveChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some("chat-options".to_string()),
            title: Some("选项测试".to_string()),
            messages: json!([]),
            options: Some(options.clone()),
            is_unread: None,
        })
        .expect("save chat options");

        let chat_dir = workspace.path.join(chat_dir_display()).join(&chat.id);
        assert!(chat_dir.join(OPTIONS_FILE_NAME).exists());
        assert_eq!(chat.options, Some(options.clone()));

        let updated = save_chat(SaveChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some(chat.id),
            title: Some("选项测试".to_string()),
            messages: json!([{ "role": "user", "text": "保留选项" }]),
            options: None,
            is_unread: None,
        })
        .expect("update chat without options");

        assert_eq!(updated.options, Some(options));
    }

    #[test]
    fn delete_chat_removes_agent_session_dir() {
        let workspace = TestWorkspace::new("delete-agent-session");
        save_test_chat(&workspace, "chat-delete");
        let agent_dir =
            workspace.agent_session_dir("chats/chat-delete/sessions/writer-agent/session-test");
        fs::create_dir_all(&agent_dir).expect("create agent session dir");
        fs::write(agent_dir.join("session.jsonl"), "{}\n").expect("write agent session");

        delete_chat(DeleteChatInput {
            workspace_path: workspace.path_string(),
            chat_id: "chat-delete".to_string(),
        })
        .expect("delete chat");

        assert!(!agent_dir.exists());
    }

    #[test]
    fn set_chat_unread_keeps_updated_at() {
        let workspace = TestWorkspace::new("set-unread");
        let chat = save_test_chat(&workspace, "chat-unread");
        let meta = set_chat_unread(SetChatUnreadInput {
            workspace_path: workspace.path_string(),
            chat_id: chat.id.clone(),
            is_unread: true,
        })
        .expect("set unread");

        assert!(meta.is_unread);
        assert_eq!(meta.updated_at, chat.updated_at);

        let loaded = load_chat(LoadChatInput {
            workspace_path: workspace.path_string(),
            chat_id: Some(chat.id),
        })
        .expect("load chat")
        .expect("chat exists");
        assert!(loaded.is_unread);
        assert_eq!(loaded.updated_at, meta.updated_at);
    }
}
