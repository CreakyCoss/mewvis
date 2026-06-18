use crate::services::workspace_paths::{
    display_workspace_relative, ensure_under_root, sanitize_session_id, workspace_app_data_dir,
    workspace_root,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

const CHAT_DIR_NAME: &str = "chats";
const LEGACY_AGENT_SESSION_DIR_NAME: &str = "agent-sessions";
const SESSIONS_DIR_NAME: &str = "sessions";

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

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionTokenUsage {
    pub input: usize,
    pub output: usize,
    pub cache_read: usize,
    pub cache_write: usize,
    pub total_tokens: usize,
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
    pub token_usage: AgentSessionTokenUsage,
    pub token_usage_message_count: usize,
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

pub fn get_agent_session_status(
    input: AgentSessionStatusInput,
) -> Result<AgentSessionStatus, String> {
    let session_id = input
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let root = workspace_root(&input.workspace_path)?;
    let app_root = workspace_app_data_dir(&root);
    let session_path = session_id.map(sanitize_agent_session_path).transpose()?;
    let session_dir = resolve_agent_session_dir(&app_root, session_path.as_deref())?;
    ensure_under_root(&app_root, &session_dir)?;

    let mut status = AgentSessionStatus {
        exists: session_dir.exists(),
        session_dir: if let Some(segments) =
            session_path.as_ref().filter(|segments| segments.len() == 1)
        {
            format!(
                "{}/{}/{}/{}",
                crate::product_config::app_data_dir_name(),
                CHAT_DIR_NAME,
                segments[0],
                SESSIONS_DIR_NAME
            )
        } else {
            display_workspace_relative(&input.workspace_path, &session_dir)?
        },
        latest_session_file: None,
        session_file_count: 0,
        total_bytes: 0,
        message_count: 0,
        tool_call_count: 0,
        active_message_count: 0,
        active_tool_call_count: 0,
        estimated_context_tokens: 0,
        token_usage: AgentSessionTokenUsage::default(),
        token_usage_message_count: 0,
        compaction_count: 0,
        latest_compaction: None,
    };

    let mut latest_file: Option<(PathBuf, SystemTime)> = None;
    if !session_dir.exists() {
        return Ok(status);
    }

    collect_agent_session_stats(&session_dir, &mut status, &mut latest_file)?;
    status.latest_session_file = latest_file
        .as_ref()
        .map(|(path, _)| display_workspace_relative(&input.workspace_path, path))
        .transpose()?;

    Ok(status)
}

pub fn cleanup_orphan_agent_sessions(
    input: CleanupAgentSessionsInput,
    _valid_chat_ids: &HashSet<String>,
) -> Result<CleanupAgentSessionsResult, String> {
    let root = workspace_root(&input.workspace_path)?;
    let app_root = workspace_app_data_dir(&root);
    let legacy_agent_root = app_root.join(LEGACY_AGENT_SESSION_DIR_NAME);
    ensure_under_root(&app_root, &legacy_agent_root)?;
    if !legacy_agent_root.exists() {
        return Ok(CleanupAgentSessionsResult {
            removed_count: 0,
            removed_bytes: 0,
        });
    }

    let removed_count = count_child_dirs(&legacy_agent_root)?;
    let removed_bytes = directory_size(&legacy_agent_root)?;
    fs::remove_dir_all(&legacy_agent_root)
        .map_err(|error| format!("无法删除旧 Agent 上下文目录：{error}"))?;

    Ok(CleanupAgentSessionsResult {
        removed_count,
        removed_bytes,
    })
}

pub fn delete_agent_sessions_for_chat(
    workspace_path: &str,
    chat_session_id: &str,
) -> Result<(), String> {
    let chat_id = sanitize_session_id(chat_session_id)?;
    let root = workspace_root(workspace_path)?;
    let app_root = workspace_app_data_dir(&root);
    let sessions_dir = app_root
        .join(CHAT_DIR_NAME)
        .join(chat_id)
        .join(SESSIONS_DIR_NAME);
    ensure_under_root(&app_root, &sessions_dir)?;
    if sessions_dir.exists() {
        fs::remove_dir_all(&sessions_dir)
            .map_err(|error| format!("无法删除 Agent 长期上下文：{error}"))?;
    }

    Ok(())
}

fn resolve_agent_session_dir(
    app_root: &Path,
    session_path: Option<&[String]>,
) -> Result<PathBuf, String> {
    match session_path {
        None => Ok(app_root.join(CHAT_DIR_NAME)),
        Some(segments) if segments.len() == 1 => Ok(app_root
            .join(CHAT_DIR_NAME)
            .join(&segments[0])
            .join(SESSIONS_DIR_NAME)),
        Some(segments) if segments.len() == 2 => Ok(find_bridge_agent_session_dir(
            app_root, segments,
        )?
        .unwrap_or_else(|| {
            segments
                .iter()
                .fold(app_root.to_path_buf(), |path, segment| path.join(segment))
        })),
        Some(segments) => Ok(segments
            .iter()
            .fold(app_root.to_path_buf(), |path, segment| path.join(segment))),
    }
}

fn find_bridge_agent_session_dir(
    app_root: &Path,
    segments: &[String],
) -> Result<Option<PathBuf>, String> {
    let chats_dir = app_root.join(CHAT_DIR_NAME);
    if !chats_dir.exists() {
        return Ok(None);
    }

    for entry in fs::read_dir(&chats_dir).map_err(|error| format!("无法读取聊天目录：{error}"))?
    {
        let entry = entry.map_err(|error| format!("无法读取聊天目录项：{error}"))?;
        let chat_dir = entry.path();
        if !chat_dir.is_dir() {
            continue;
        }

        let candidate = chat_dir
            .join("session")
            .join("agents")
            .join(&segments[0])
            .join(&segments[1]);
        if candidate.exists() {
            return Ok(Some(candidate));
        }
    }

    Ok(None)
}

fn sanitize_agent_session_path(session_id: &str) -> Result<Vec<String>, String> {
    let segments = session_id
        .trim()
        .trim_end_matches(".json")
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    if segments.is_empty()
        || segments.iter().any(|segment| {
            segment == "." || segment == ".." || segment.contains("..") || segment.starts_with('.')
        })
    {
        return Err("Agent session ID 不合法".to_string());
    }

    Ok(segments)
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
                accumulate_message_usage(message, status);
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

fn accumulate_message_usage(message: &Value, status: &mut AgentSessionStatus) {
    let Some(usage) = message.get("usage") else {
        return;
    };

    let input = usage_usize(usage, "input").unwrap_or(0);
    let output = usage_usize(usage, "output").unwrap_or(0);
    let cache_read = usage_usize(usage, "cacheRead").unwrap_or(0);
    let cache_write = usage_usize(usage, "cacheWrite").unwrap_or(0);
    let total_tokens = usage_usize(usage, "totalTokens")
        .filter(|value| *value > 0)
        .unwrap_or(input + output + cache_read + cache_write);

    if input == 0 && output == 0 && cache_read == 0 && cache_write == 0 && total_tokens == 0 {
        return;
    }

    status.token_usage.input += input;
    status.token_usage.output += output;
    status.token_usage.cache_read += cache_read;
    status.token_usage.cache_write += cache_write;
    status.token_usage.total_tokens += total_tokens;
    status.token_usage_message_count += 1;
}

fn usage_usize(usage: &Value, field: &str) -> Option<usize> {
    usage
        .get(field)
        .and_then(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
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

fn count_child_dirs(path: &Path) -> Result<usize, String> {
    let mut count = 0;
    for entry in fs::read_dir(path).map_err(|error| format!("无法读取目录：{error}"))? {
        let entry = entry.map_err(|error| format!("无法读取目录项：{error}"))?;
        if entry.path().is_dir() {
            count += 1;
        }
    }
    Ok(count)
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

        fn app_data_dir(&self) -> PathBuf {
            workspace_app_data_dir(&self.path)
        }

        fn legacy_agent_session_dir(&self, session_id: &str) -> PathBuf {
            self.app_data_dir()
                .join(LEGACY_AGENT_SESSION_DIR_NAME)
                .join(session_id)
        }

        fn chat_agent_session_dir(
            &self,
            chat_id: &str,
            agent_id: &str,
            session_id: &str,
        ) -> PathBuf {
            self.app_data_dir()
                .join(CHAT_DIR_NAME)
                .join(chat_id)
                .join(SESSIONS_DIR_NAME)
                .join(agent_id)
                .join(session_id)
        }

        fn bridge_agent_session_dir(
            &self,
            chat_id: &str,
            runtime_id: &str,
            agent_id: &str,
        ) -> PathBuf {
            self.app_data_dir()
                .join(CHAT_DIR_NAME)
                .join(chat_id)
                .join("session")
                .join("agents")
                .join(runtime_id)
                .join(agent_id)
        }

        fn chat_session_agent_root(&self, chat_id: &str) -> PathBuf {
            self.app_data_dir()
                .join(CHAT_DIR_NAME)
                .join(chat_id)
                .join(SESSIONS_DIR_NAME)
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn cleanup_orphan_agent_sessions_removes_legacy_root() {
        let workspace = TestWorkspace::new("cleanup-orphans");
        let known_dir = workspace.legacy_agent_session_dir("writer-agent/chat-known");
        let orphan_dir = workspace.legacy_agent_session_dir("writer-agent/chat-orphan");
        fs::create_dir_all(&known_dir).expect("create known agent session dir");
        fs::create_dir_all(&orphan_dir).expect("create orphan agent session dir");
        fs::write(orphan_dir.join("session.jsonl"), "{\"type\":\"message\"}\n")
            .expect("write orphan agent session");

        let result = cleanup_orphan_agent_sessions(
            CleanupAgentSessionsInput {
                workspace_path: workspace.path_string(),
                protected_session_id: None,
            },
            &HashSet::from(["chat-known".to_string()]),
        )
        .expect("cleanup orphan agent sessions");

        assert_eq!(result.removed_count, 1);
        assert!(result.removed_bytes > 0);
        assert!(!known_dir.exists());
        assert!(!orphan_dir.exists());
    }

    #[test]
    fn cleanup_orphan_agent_sessions_removes_legacy_protected_session() {
        let workspace = TestWorkspace::new("cleanup-protected");
        let protected_dir = workspace.legacy_agent_session_dir("writer-agent/chat-unsaved");
        let orphan_dir = workspace.legacy_agent_session_dir("writer-agent/chat-orphan");
        fs::create_dir_all(&protected_dir).expect("create protected agent session dir");
        fs::create_dir_all(&orphan_dir).expect("create orphan agent session dir");

        let result = cleanup_orphan_agent_sessions(
            CleanupAgentSessionsInput {
                workspace_path: workspace.path_string(),
                protected_session_id: Some("chat-unsaved".to_string()),
            },
            &HashSet::new(),
        )
        .expect("cleanup orphan agent sessions");

        assert_eq!(result.removed_count, 1);
        assert!(!protected_dir.exists());
        assert!(!orphan_dir.exists());
    }

    #[test]
    fn cleanup_orphan_agent_sessions_removes_legacy_nested_session() {
        let workspace = TestWorkspace::new("cleanup-protected-nested");
        let protected_dir =
            workspace.legacy_agent_session_dir("writer-agent/chat-unsaved/session-active");
        let orphan_chat_dir = workspace.legacy_agent_session_dir("writer-agent/chat-orphan");
        let orphan_session_dir = orphan_chat_dir.join("session-old");
        fs::create_dir_all(&protected_dir).expect("create protected runtime session dir");
        fs::create_dir_all(&orphan_session_dir).expect("create orphan runtime session dir");
        fs::write(
            orphan_session_dir.join("session.jsonl"),
            "{\"type\":\"message\"}\n",
        )
        .expect("write orphan runtime session");

        let result = cleanup_orphan_agent_sessions(
            CleanupAgentSessionsInput {
                workspace_path: workspace.path_string(),
                protected_session_id: Some("writer-agent/chat-unsaved/session-active".to_string()),
            },
            &HashSet::new(),
        )
        .expect("cleanup orphan agent sessions");

        assert_eq!(result.removed_count, 1);
        assert!(!protected_dir.exists());
        assert!(!orphan_chat_dir.exists());
    }

    #[test]
    fn get_agent_session_status_reads_jsonl_stats() {
        let workspace = TestWorkspace::new("agent-status");
        let agent_dir =
            workspace.chat_agent_session_dir("chat-stats", "writer-agent", "session-main");
        fs::create_dir_all(&agent_dir).expect("create agent session dir");
        fs::write(
            agent_dir.join("session.jsonl"),
            [
                json!({
                    "type": "message",
                    "message": {
                        "role": "assistant",
                        "usage": {
                            "input": 10,
                            "output": 20,
                            "cacheRead": 30,
                            "cacheWrite": 40,
                            "totalTokens": 100
                        },
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
        assert_eq!(status.token_usage_message_count, 1);
        assert_eq!(status.token_usage.input, 10);
        assert_eq!(status.token_usage.output, 20);
        assert_eq!(status.token_usage.cache_read, 30);
        assert_eq!(status.token_usage.cache_write, 40);
        assert_eq!(status.token_usage.total_tokens, 100);
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

    #[test]
    fn get_agent_session_status_ignores_direct_chat_session_dir() {
        let workspace = TestWorkspace::new("agent-status-direct-chat");
        let direct_chat_dir = workspace
            .app_data_dir()
            .join(CHAT_DIR_NAME)
            .join("chat-direct");
        fs::create_dir_all(&direct_chat_dir).expect("create direct chat session dir");
        fs::write(
            direct_chat_dir.join("session.jsonl"),
            "{\"type\":\"message\"}\n",
        )
        .expect("write direct chat session");

        let status = get_agent_session_status(AgentSessionStatusInput {
            workspace_path: workspace.path_string(),
            session_id: Some("chat-direct".to_string()),
        })
        .expect("get agent session status");

        assert!(!status.exists);
        assert_eq!(status.session_file_count, 0);
        assert_eq!(status.message_count, 0);
    }

    #[test]
    fn get_agent_session_status_reads_nested_agent_session_path() {
        let workspace = TestWorkspace::new("agent-status-nested");
        let agent_dir =
            workspace.chat_agent_session_dir("chat-stats", "writer-agent", "session-reset");
        fs::create_dir_all(&agent_dir).expect("create nested agent session dir");
        fs::write(
            agent_dir.join("session.jsonl"),
            json!({
                "type": "message",
                "message": {
                    "role": "assistant",
                    "content": [
                        { "type": "text", "text": "重新建立上下文" }
                    ]
                }
            })
            .to_string(),
        )
        .expect("write nested agent session");

        let status = get_agent_session_status(AgentSessionStatusInput {
            workspace_path: workspace.path_string(),
            session_id: Some("chats/chat-stats/sessions/writer-agent/session-reset".to_string()),
        })
        .expect("get nested agent session status");

        assert!(status.exists);
        assert_eq!(status.session_file_count, 1);
        assert_eq!(status.message_count, 1);
    }

    #[test]
    fn get_agent_session_status_reads_short_bridge_agent_session_id() {
        let workspace = TestWorkspace::new("agent-status-short-bridge");
        let agent_dir = workspace.bridge_agent_session_dir("chat-stats", "pi", "writer-agent");
        fs::create_dir_all(&agent_dir).expect("create bridge agent session dir");
        fs::write(
            agent_dir.join("session.jsonl"),
            json!({
                "type": "message",
                "message": {
                    "role": "assistant",
                    "content": [
                        { "type": "text", "text": "使用短 session id 查询" }
                    ]
                }
            })
            .to_string(),
        )
        .expect("write bridge agent session");

        let status = get_agent_session_status(AgentSessionStatusInput {
            workspace_path: workspace.path_string(),
            session_id: Some("pi/writer-agent".to_string()),
        })
        .expect("get short bridge agent session status");

        assert!(status.exists);
        assert!(status
            .session_dir
            .ends_with("chats/chat-stats/session/agents/pi/writer-agent"));
        assert_eq!(status.session_file_count, 1);
        assert_eq!(status.message_count, 1);
    }

    #[test]
    fn delete_agent_sessions_for_chat_removes_nested_agent_sessions() {
        let workspace = TestWorkspace::new("delete-agent-chat");
        let target_dir =
            workspace.chat_agent_session_dir("chat-delete", "writer-agent", "session-main");
        let other_dir =
            workspace.chat_agent_session_dir("chat-keep", "writer-agent", "session-main");
        fs::create_dir_all(&target_dir).expect("create target agent session dir");
        fs::create_dir_all(&other_dir).expect("create other agent session dir");

        delete_agent_sessions_for_chat(&workspace.path_string(), "chat-delete")
            .expect("delete agent sessions for chat");

        assert!(!workspace.chat_session_agent_root("chat-delete").exists());
        assert!(other_dir.exists());
    }
}
