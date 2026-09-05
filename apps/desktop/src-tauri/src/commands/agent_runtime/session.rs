use super::{
    protocol::{
        METHOD_COLLABORATION_TIMELINE_READ, METHOD_RUNTIME_SESSIONS_LIST,
        METHOD_RUNTIME_SESSION_DEBUG_READ, METHOD_RUNTIME_SESSION_READ,
        METHOD_SESSION_AGENT_SUMMARIZE, METHOD_SESSION_READ, METHOD_SESSION_SUMMARIZE,
        RESULT_COLLABORATION_TIMELINE_RESULT, RESULT_RUNTIME_SESSIONS_RESULT,
        RESULT_RUNTIME_SESSION_DEBUG_RESULT, RESULT_RUNTIME_SESSION_RESULT,
        RESULT_SESSION_MUTATION_RESULT, RESULT_SESSION_RESULT,
    },
    rpc::call_agent_runtime_rpc,
    session_paths::{resolve_optional_session_root_dir, resolve_session_root_dir},
    supervisor::AgentRuntimeSupervisor,
    types::AgentRuntimeModelInput,
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
#[serde(deny_unknown_fields)]
pub struct GetAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    include_timeline: Option<bool>,
    timeline_limit: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct GetAgentRuntimeSessionDebugInput {
    workspace_path: String,
    session_root_dir: String,
    include_ledger: Option<bool>,
    include_trace: Option<bool>,
    trace_limit: Option<u64>,
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
pub struct SummarizeAgentRuntimeSessionInput {
    workspace_path: String,
    session_root_dir: String,
    agent_role_id: Option<String>,
    summary_instruction: Option<String>,
    max_summary_chars: Option<u64>,
    runtime_model: Option<AgentRuntimeModelInput>,
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
        METHOD_SESSION_READ,
        json!({
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
        }),
        &[RESULT_SESSION_RESULT],
    )
    .await
}

#[tauri::command]
pub async fn list_agent_runtime_sessions(
    app: AppHandle,
    input: ListAgentRuntimeSessionsInput,
) -> Result<Value, String> {
    let root_dir =
        resolve_runtime_session_query_root_dir(&input.workspace_path, input.root_dir.as_deref())?;
    call_session_runtime(
        app,
        METHOD_RUNTIME_SESSIONS_LIST,
        json!({
            "workspacePath": input.workspace_path,
            "rootDir": root_dir,
            "limit": input.limit,
            "maxDepth": input.max_depth,
        }),
        &[RESULT_RUNTIME_SESSIONS_RESULT],
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
        METHOD_RUNTIME_SESSION_READ,
        json!({
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "includeTimeline": input.include_timeline,
            "timelineLimit": input.timeline_limit,
        }),
        &[RESULT_RUNTIME_SESSION_RESULT],
    )
    .await
}

#[tauri::command]
pub async fn get_agent_runtime_session_debug(
    app: AppHandle,
    input: GetAgentRuntimeSessionDebugInput,
) -> Result<Value, String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    call_session_runtime(
        app,
        METHOD_RUNTIME_SESSION_DEBUG_READ,
        json!({
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "includeLedger": input.include_ledger,
            "includeTrace": input.include_trace,
            "traceLimit": input.trace_limit,
        }),
        &[RESULT_RUNTIME_SESSION_DEBUG_RESULT],
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
        METHOD_COLLABORATION_TIMELINE_READ,
        json!({
            "workspacePath": input.workspace_path,
            "sessionRootDir": session_root_dir,
            "workflowRunId": input.workflow_run_id,
            "limit": input.limit,
        }),
        &[RESULT_COLLABORATION_TIMELINE_RESULT],
    )
    .await
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
pub async fn summarize_agent_runtime_session(
    app: AppHandle,
    input: SummarizeAgentRuntimeSessionInput,
) -> Result<Value, String> {
    let SummarizeAgentRuntimeSessionInput {
        workspace_path,
        session_root_dir,
        agent_role_id,
        summary_instruction,
        max_summary_chars,
        runtime_model,
    } = input;
    let session_root_dir = resolve_session_root_dir(&workspace_path, &session_root_dir)?;
    let agent_role_id = agent_role_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let (method, params) = if let Some(agent_role_id) = agent_role_id {
        (
            METHOD_SESSION_AGENT_SUMMARIZE,
            json!({
                "workspacePath": workspace_path,
                "sessionRootDir": session_root_dir,
                "target": {
                    "scope": "agent",
                    "agentRoleId": agent_role_id,
                },
                "options": {
                    "summaryInstruction": summary_instruction,
                    "maxSummaryChars": max_summary_chars,
                },
                "runtime": {
                    "model": runtime_model,
                },
            }),
        )
    } else {
        (
            METHOD_SESSION_SUMMARIZE,
            json!({
                "workspacePath": workspace_path,
                "sessionRootDir": session_root_dir,
                "options": {
                    "summaryInstruction": summary_instruction,
                    "maxSummaryChars": max_summary_chars,
                },
                "runtime": {
                    "model": runtime_model,
                },
            }),
        )
    };
    call_session_runtime(app, method, params, &[RESULT_SESSION_MUTATION_RESULT]).await
}

async fn call_session_runtime(
    app: AppHandle,
    method: &'static str,
    params: Value,
    result_types: &'static [&'static str],
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        call_agent_runtime_rpc(
            &app,
            "Agent runtime session",
            method,
            params,
            result_types,
            |_value| {},
        )
    })
    .await
    .map_err(|error| format!("Agent runtime session 任务失败：{error}"))?
}

/// Stop the worker and release its resources without deleting any session files.
#[tauri::command]
pub fn release_agent_runtime_session(
    state: State<AgentRuntimeSupervisor>,
    input: AgentRuntimeSessionInput,
) -> Result<(), String> {
    let session_root_dir =
        resolve_session_root_dir(&input.workspace_path, &input.session_root_dir)?;
    let workspace = workspace_root(&input.workspace_path)?;
    ensure_under_root(
        &workspace_app_data_dir(&workspace),
        &PathBuf::from(&session_root_dir),
    )?;
    state.dispose_session(&input.workspace_path, &session_root_dir)
}
