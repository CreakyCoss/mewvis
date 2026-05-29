use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const CHAT_DIR: &str = ".novel-claw/chats";
const AGENT_SESSION_DIR: &str = ".novel-claw/agent-sessions";

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStatusInput {
    pub workspace_path: String,
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCompactionStatus {
    pub summary: String,
    pub tokens_before: Option<i64>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionStatus {
    pub exists: bool,
    pub session_dir: String,
    pub latest_session_file: Option<String>,
    pub session_file_count: usize,
    pub total_bytes: u64,
    pub message_count: usize,
    pub tool_call_count: usize,
    pub active_message_count: usize,
    pub active_tool_call_count: usize,
    pub estimated_context_tokens: usize,
    pub compaction_count: usize,
    pub latest_compaction: Option<AgentSessionCompactionStatus>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupAgentSessionsInput {
    pub workspace_path: String,
    #[serde(default)]
    pub protected_session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupAgentSessionsResult {
    pub removed_count: usize,
    pub removed_bytes: u64,
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

    let agent_session_dir = agent_session_dir(&input.workspace_path, &input.session_id)?;
    if agent_session_dir.exists() {
        fs::remove_dir_all(agent_session_dir)
            .map_err(|error| format!("无法删除 Agent 长期上下文：{error}"))?;
    }

    list_chat_sessions(ChatSessionPathInput {
        workspace_path: input.workspace_path,
    })
}

pub fn get_agent_session_status(
    input: AgentSessionStatusInput,
) -> Result<AgentSessionStatus, String> {
    let session_id = input
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let session_dir = match session_id {
        Some(id) => agent_session_dir(&input.workspace_path, id)?,
        None => workspace_root(&input.workspace_path)?.join(AGENT_SESSION_DIR),
    };

    let mut status = AgentSessionStatus {
        exists: session_dir.exists(),
        session_dir: display_workspace_relative(&input.workspace_path, &session_dir)?,
        latest_session_file: None,
        session_file_count: 0,
        total_bytes: 0,
        message_count: 0,
        tool_call_count: 0,
        active_message_count: 0,
        active_tool_call_count: 0,
        estimated_context_tokens: 0,
        compaction_count: 0,
        latest_compaction: None,
    };

    if !session_dir.exists() {
        return Ok(status);
    }

    let mut latest_file: Option<(PathBuf, SystemTime)> = None;
    collect_agent_session_stats(&session_dir, &mut status, &mut latest_file)?;
    status.latest_session_file = latest_file
        .as_ref()
        .map(|(path, _)| display_workspace_relative(&input.workspace_path, path))
        .transpose()?;

    Ok(status)
}

pub fn cleanup_orphan_agent_sessions(
    input: CleanupAgentSessionsInput,
) -> Result<CleanupAgentSessionsResult, String> {
    let root = workspace_root(&input.workspace_path)?;
    let agent_root = root.join(AGENT_SESSION_DIR);
    if !agent_root.exists() {
        return Ok(CleanupAgentSessionsResult {
            removed_count: 0,
            removed_bytes: 0,
        });
    }

    let valid_chat_ids = list_chat_sessions(ChatSessionPathInput {
        workspace_path: input.workspace_path.clone(),
    })?
    .into_iter()
    .map(|session| session.id)
    .collect::<std::collections::HashSet<_>>();
    let protected_session_id = input
        .protected_session_id
        .as_deref()
        .map(sanitize_session_id)
        .transpose()?;

    let mut removed_count = 0;
    let mut removed_bytes = 0;
    for entry in
        fs::read_dir(&agent_root).map_err(|error| format!("无法读取 Agent 上下文目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取 Agent 上下文项：{error}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(id) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if valid_chat_ids.contains(id) || protected_session_id.as_deref() == Some(id) {
            continue;
        }

        let size = directory_size(&path)?;
        fs::remove_dir_all(&path).map_err(|error| format!("无法删除孤儿 Agent 上下文：{error}"))?;
        removed_count += 1;
        removed_bytes += size;
    }

    Ok(CleanupAgentSessionsResult {
        removed_count,
        removed_bytes,
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
        path: format!("{CHAT_DIR}/{}.json", session.id),
        created_at: session.created_at,
        updated_at: session.updated_at,
        message_count: session
            .messages
            .as_array()
            .map(|items| items.len())
            .unwrap_or(0),
    }
}

fn workspace_root(path: &str) -> Result<PathBuf, String> {
    PathBuf::from(path.trim())
        .canonicalize()
        .map_err(|error| format!("无法定位工作区目录：{error}"))
}

fn chat_dir(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(workspace_root(workspace_path)?.join(CHAT_DIR))
}

fn agent_session_dir(workspace_path: &str, session_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(session_id)?;
    let dir = workspace_root(workspace_path)?.join(AGENT_SESSION_DIR);
    let path = dir.join(id);
    ensure_under_root(&dir, &path)?;
    Ok(path)
}

fn display_workspace_relative(workspace_path: &str, path: &Path) -> Result<String, String> {
    let root = workspace_root(workspace_path)?;
    Ok(path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string())
}

fn collect_agent_session_stats(
    dir: &Path,
    status: &mut AgentSessionStatus,
    latest_file: &mut Option<(PathBuf, SystemTime)>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|error| format!("无法读取 Agent 上下文目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取 Agent 上下文项：{error}"))?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| format!("无法读取 Agent 上下文元数据：{error}"))?;
        if metadata.is_dir() {
            collect_agent_session_stats(&path, status, latest_file)?;
            continue;
        }

        status.total_bytes += metadata.len();
        if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
            continue;
        }

        status.session_file_count += 1;
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if latest_file
            .as_ref()
            .map(|(_, latest_modified)| modified > *latest_modified)
            .unwrap_or(true)
        {
            *latest_file = Some((path.clone(), modified));
        }
        parse_agent_session_file(&path, status)?;
    }

    Ok(())
}

fn parse_agent_session_file(path: &Path, status: &mut AgentSessionStatus) -> Result<(), String> {
    let content =
        fs::read_to_string(path).map_err(|error| format!("无法读取 Agent session：{error}"))?;
    for line in content.lines().filter(|line| !line.trim().is_empty()) {
        let Ok(entry) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match entry.get("type").and_then(Value::as_str) {
            Some("message") => {
                status.message_count += 1;
                let Some(message) = entry.get("message") else {
                    continue;
                };
                let tool_calls = count_tool_calls(message);
                status.tool_call_count += tool_calls;
                status.active_message_count += 1;
                status.active_tool_call_count += tool_calls;
                status.estimated_context_tokens += estimate_json_tokens(message);
            }
            Some("custom_message") => {
                status.message_count += 1;
                status.active_message_count += 1;
                status.estimated_context_tokens +=
                    estimate_json_tokens(entry.get("content").unwrap_or(&Value::Null));
            }
            Some("compaction") => {
                status.compaction_count += 1;
                status.active_message_count = 0;
                status.active_tool_call_count = 0;
                status.estimated_context_tokens =
                    estimate_json_tokens(entry.get("summary").unwrap_or(&Value::Null));
                status.latest_compaction = Some(AgentSessionCompactionStatus {
                    summary: entry
                        .get("summary")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .chars()
                        .take(900)
                        .collect(),
                    tokens_before: entry.get("tokensBefore").and_then(Value::as_i64),
                    timestamp: entry
                        .get("timestamp")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                });
            }
            _ => {}
        }
    }

    Ok(())
}

fn estimate_json_tokens(value: &Value) -> usize {
    serde_json::to_string(value)
        .map(|text| (text.chars().count() / 4).max(1))
        .unwrap_or(0)
}

fn count_tool_calls(message: &Value) -> usize {
    message
        .get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| item.get("type").and_then(Value::as_str) == Some("toolCall"))
                .count()
        })
        .unwrap_or(0)
}

fn directory_size(path: &Path) -> Result<u64, String> {
    let mut size = 0;
    for entry in fs::read_dir(path).map_err(|error| format!("无法读取目录大小：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取目录项大小：{error}"))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("无法读取目录元数据：{error}"))?;
        if metadata.is_dir() {
            size += directory_size(&entry.path())?;
        } else {
            size += metadata.len();
        }
    }
    Ok(size)
}

fn session_path(workspace_path: &str, session_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(session_id)?;
    let dir = chat_dir(workspace_path)?;
    let path = dir.join(format!("{id}.json"));
    ensure_under_root(&dir, &path)?;
    Ok(path)
}

fn sanitize_session_id(session_id: &str) -> Result<String, String> {
    let id = session_id.trim().trim_end_matches(".json");
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id.starts_with('.')
    {
        return Err("聊天记录 ID 不合法".to_string());
    }
    Ok(id.to_string())
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

fn ensure_under_root(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("聊天记录路径必须位于工作区内".to_string())
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
            let path = std::env::temp_dir().join(format!("novel-claw-{name}-{}", Uuid::now_v7()));
            fs::create_dir_all(&path).expect("create test workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn agent_session_dir(&self, session_id: &str) -> PathBuf {
            self.path.join(AGENT_SESSION_DIR).join(session_id)
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
            .join(CHAT_DIR)
            .join("chat-test.json")
            .exists());
    }

    #[test]
    fn delete_chat_session_removes_agent_session_dir() {
        let workspace = TestWorkspace::new("delete-agent-session");
        save_test_session(&workspace, "chat-delete");
        let agent_dir = workspace.agent_session_dir("chat-delete");
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
    fn cleanup_orphan_agent_sessions_keeps_known_sessions() {
        let workspace = TestWorkspace::new("cleanup-orphans");
        save_test_session(&workspace, "chat-known");
        let known_dir = workspace.agent_session_dir("chat-known");
        let orphan_dir = workspace.agent_session_dir("chat-orphan");
        fs::create_dir_all(&known_dir).expect("create known agent session dir");
        fs::create_dir_all(&orphan_dir).expect("create orphan agent session dir");
        fs::write(orphan_dir.join("session.jsonl"), "{\"type\":\"message\"}\n")
            .expect("write orphan agent session");

        let result = cleanup_orphan_agent_sessions(CleanupAgentSessionsInput {
            workspace_path: workspace.path_string(),
            protected_session_id: None,
        })
        .expect("cleanup orphan agent sessions");

        assert_eq!(result.removed_count, 1);
        assert!(result.removed_bytes > 0);
        assert!(known_dir.exists());
        assert!(!orphan_dir.exists());
    }

    #[test]
    fn cleanup_orphan_agent_sessions_preserves_protected_unsaved_session() {
        let workspace = TestWorkspace::new("cleanup-protected");
        let protected_dir = workspace.agent_session_dir("chat-unsaved");
        let orphan_dir = workspace.agent_session_dir("chat-orphan");
        fs::create_dir_all(&protected_dir).expect("create protected agent session dir");
        fs::create_dir_all(&orphan_dir).expect("create orphan agent session dir");

        let result = cleanup_orphan_agent_sessions(CleanupAgentSessionsInput {
            workspace_path: workspace.path_string(),
            protected_session_id: Some("chat-unsaved".to_string()),
        })
        .expect("cleanup orphan agent sessions");

        assert_eq!(result.removed_count, 1);
        assert!(protected_dir.exists());
        assert!(!orphan_dir.exists());
    }

    #[test]
    fn get_agent_session_status_reads_jsonl_stats() {
        let workspace = TestWorkspace::new("agent-status");
        let agent_dir = workspace.agent_session_dir("chat-stats");
        fs::create_dir_all(&agent_dir).expect("create agent session dir");
        fs::write(
            agent_dir.join("session.jsonl"),
            [
                json!({
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "content": [
                            { "type": "text", "text": "已读取文件" },
                            { "type": "toolCall", "toolName": "read_file" }
                        ]
                    }
                })
                .to_string(),
                json!({
                    "type": "custom_message",
                    "content": {
                        "role": "user",
                        "content": "继续处理"
                    }
                })
                .to_string(),
                json!({
                    "type": "compaction",
                    "summary": "已压缩前序上下文",
                    "tokensBefore": 1234,
                    "timestamp": "2026-05-30T00:00:00Z"
                })
                .to_string(),
            ]
            .join("\n"),
        )
        .expect("write agent session");

        let status = get_agent_session_status(AgentSessionStatusInput {
            workspace_path: workspace.path_string(),
            session_id: Some("chat-stats".to_string()),
        })
        .expect("get agent session status");

        assert!(status.exists);
        assert_eq!(status.session_file_count, 1);
        assert_eq!(status.message_count, 2);
        assert_eq!(status.tool_call_count, 1);
        assert_eq!(status.active_message_count, 0);
        assert_eq!(status.active_tool_call_count, 0);
        assert_eq!(status.compaction_count, 1);
        assert!(status.estimated_context_tokens > 0);
        assert_eq!(
            status
                .latest_compaction
                .as_ref()
                .map(|item| item.summary.as_str()),
            Some("已压缩前序上下文")
        );
        assert_eq!(
            status
                .latest_compaction
                .as_ref()
                .and_then(|item| item.tokens_before),
            Some(1234)
        );
    }
}
