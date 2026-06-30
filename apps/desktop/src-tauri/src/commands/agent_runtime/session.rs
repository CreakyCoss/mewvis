use super::{
    rpc::call_agent_runtime_rpc,
    session_paths::{resolve_optional_session_root_dir, resolve_session_root_dir},
    supervisor::AgentRuntimeSupervisor, types::AgentRuntimeModelInput,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, State};

use crate::services::workspace_paths::{ensure_under_root, workspace_app_data_dir, workspace_root};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAgentRuntimeSessionsInput {
    workspace_path: String,
    root_dir: Option<String>,
    limit: Option<u64>,
    max_depth: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    include_ledger: Option<bool>,
    include_trace: Option<bool>,
    include_timeline: Option<bool>,
    timeline_limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAgentRuntimeCollaborationTimelineInput {
    workspace_path: String,
    session_root_dir: String,
    workflow_run_id: Option<String>,
    limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    system_prompt: Option<String>,
    metadata: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    agent_id: Option<String>,
    agent_role_id: String,
    compact_instruction: Option<String>,
    runtime_model: Option<AgentRuntimeModelInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildAgentRuntimeAgentSessionInput {
    workspace_path: String,
    session_root_dir: String,
    agent_id: Option<String>,
    agent_role_id: String,
    rebuild_instruction: Option<String>,
    user_message: Option<String>,
    runtime_model: Option<AgentRuntimeModelInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarizeAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    agent_id: Option<String>,
    summary_instruction: Option<String>,
    max_summary_chars: Option<u64>,
    runtime_model: Option<AgentRuntimeModelInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditAgentRuntimeSessionMessageInput {
    workspace_path: String,
    session_root_dir: String,
    message_record_id: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAgentRuntimeSessionMessageInput {
    workspace_path: String,
    session_root_dir: String,
    message_record_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendAgentRuntimeSessionMessagesInput {
    workspace_path: String,
    session_root_dir: String,
    messages: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    messages: Value,
}

#[tauri::command]
pub async fn create_agent_runtime_session(
    app: AppHandle,
    input: CreateAgentRuntimeSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "create_session",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "systemPrompt": input.system_prompt,
            "metadata": input.metadata,
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn read_agent_runtime_session(
    app: AppHandle,
    input: AgentRuntimeSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "read_session",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
        }),
        &["session_result"],
    )
    .await
}

#[tauri::command]
pub async fn list_agent_runtime_sessions(
    app: AppHandle,
    input: ListAgentRuntimeSessionsInput,
) -> Result<Value, String> {
    let root_dir = resolve_runtime_session_query_root_dir(
        &input.workspace_path,
        input.root_dir.as_deref(),
    )?;
    call_session_runtime(
        app,
        json!({
            "type": "list_runtime_sessions",
            "workspacePath": input.workspace_path,
            "rootDir": root_dir,
            "limit": input.limit,
            "maxDepth": input.max_depth,
        }),
        &["runtime_sessions_result"],
    )
    .await
}

#[tauri::command]
pub async fn get_agent_runtime_session(
    app: AppHandle,
    input: GetAgentRuntimeSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "read_runtime_session",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "includeLedger": input.include_ledger,
            "includeTrace": input.include_trace,
            "includeTimeline": input.include_timeline,
            "timelineLimit": input.timeline_limit,
        }),
        &["runtime_session_result"],
    )
    .await
}

#[tauri::command]
pub async fn get_agent_runtime_collaboration_timeline(
    app: AppHandle,
    input: GetAgentRuntimeCollaborationTimelineInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "read_collaboration_timeline",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "workflowRunId": input.workflow_run_id,
            "limit": input.limit,
        }),
        &["collaboration_timeline_result"],
    )
    .await
}

#[tauri::command]
pub fn dispose_agent_runtime_session_workers(
    state: State<AgentRuntimeSupervisor>,
    input: AgentRuntimeSessionInput,
) -> Result<(), String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    state.dispose_session(&input.workspace_path, &session_root_dir)
}

fn resolve_runtime_session_query_root_dir(
    workspace_path: &str,
    root_dir: Option<&str>,
) -> Result<String, String> {
    let workspace = workspace_root(workspace_path)?;
    let app_data_dir = workspace_app_data_dir(&workspace);
    let root_dir = match root_dir.map(str::trim).filter(|value| !value.is_empty()) {
        Some(root_dir) => resolve_optional_session_root_dir(Some(workspace_path), Some(root_dir))?
            .ok_or_else(|| "runtime session rootDir 不能为空".to_string())?,
        None => app_data_dir.to_string_lossy().to_string(),
    };
    ensure_under_root(&app_data_dir, &PathBuf::from(&root_dir))?;
    Ok(root_dir)
}

#[tauri::command]
pub fn delete_agent_runtime_session(
    state: State<AgentRuntimeSupervisor>,
    input: AgentRuntimeSessionInput,
) -> Result<(), String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    state.dispose_session(&input.workspace_path, &session_root_dir)?;

    let workspace = workspace_root(&input.workspace_path)?;
    let app_data_dir = workspace_app_data_dir(&workspace);
    let session_dir = PathBuf::from(session_root_dir);
    ensure_under_root(&app_data_dir, &session_dir)?;

    if session_dir.exists() {
        fs::remove_dir_all(&session_dir)
            .map_err(|error| format!("无法删除 Agent runtime session：{error}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn compact_agent_runtime_session(
    app: AppHandle,
    input: CompactAgentRuntimeSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "compact",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "target": {
                "scope": "agent",
                "agentId": input.agent_id,
                "agentRoleId": input.agent_role_id,
            },
            "options": {
                "compactInstruction": input.compact_instruction,
            },
            "runtime": {
                "model": input.runtime_model,
            },
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn rebuild_agent_runtime_agent_session(
    app: AppHandle,
    input: RebuildAgentRuntimeAgentSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "rebuild_agent_session",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "target": {
                "scope": "agent",
                "agentId": input.agent_id,
                "agentRoleId": input.agent_role_id,
            },
            "options": {
                "rebuildInstruction": input.rebuild_instruction,
                "userMessage": input.user_message,
            },
            "runtime": {
                "model": input.runtime_model,
            },
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn summarize_agent_runtime_session(
    app: AppHandle,
    input: SummarizeAgentRuntimeSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "summarize_session",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "agent": {
                "agentId": input.agent_id,
            },
            "options": {
                "summaryInstruction": input.summary_instruction,
                "maxSummaryChars": input.max_summary_chars,
            },
            "runtime": {
                "model": input.runtime_model,
            },
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn edit_agent_runtime_session_message(
    app: AppHandle,
    input: EditAgentRuntimeSessionMessageInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "message_edit",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "messageRecordId": input.message_record_id,
            "content": input.content,
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn delete_agent_runtime_session_message(
    app: AppHandle,
    input: DeleteAgentRuntimeSessionMessageInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "message_delete",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "messageRecordId": input.message_record_id,
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn append_agent_runtime_session_messages(
    app: AppHandle,
    input: AppendAgentRuntimeSessionMessagesInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "message_append",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "messages": input.messages,
        }),
        &["session_mutation_result"],
    )
    .await
}

#[tauri::command]
pub async fn rebuild_agent_runtime_session(
    app: AppHandle,
    input: RebuildAgentRuntimeSessionInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        json!({
            "type": "rebuild",
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "messages": input.messages,
        }),
        &["session_mutation_result"],
    )
    .await
}

async fn call_session_runtime(
    app: AppHandle,
    command: Value,
    result_types: &'static [&'static str],
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        call_agent_runtime_rpc(
            &app,
            "Agent runtime session",
            command,
            result_types,
            |_value| {},
        )
    })
    .await
    .map_err(|error| format!("Agent runtime session 任务失败：{error}"))?
}
