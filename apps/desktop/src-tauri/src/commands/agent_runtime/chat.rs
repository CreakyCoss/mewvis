use super::{
    rpc::call_agent_runtime_rpc,
    session_paths::resolve_optional_session_root_dir,
    types::{AgentRuntimeChatMessageInput, AgentRuntimeModelInput},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const AGENT_RUNTIME_CHAT_EVENT: &str = "agent_runtime_chat_event";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeChatInput {
    agent_id: Option<String>,
    workspace_path: Option<String>,
    session_root_dir: Option<String>,
    stream_id: Option<String>,
    stream: Option<bool>,
    runtime_model: Option<AgentRuntimeModelInput>,
    system_prompt: String,
    user_message: Option<String>,
    request_context: Option<String>,
    runtime_instruction: Option<String>,
    messages: Option<Vec<AgentRuntimeChatMessageInput>>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeChatOutput {
    text: String,
    thinking: Option<String>,
    bridge_session: Option<Value>,
}

#[tauri::command]
pub async fn run_agent_runtime_chat(
    app: AppHandle,
    input: RunAgentRuntimeChatInput,
) -> Result<RunAgentRuntimeChatOutput, String> {
    validate_chat_input(&input)?;
    chat_with_agent_runtime(app, input).await
}

async fn chat_with_agent_runtime(
    app: AppHandle,
    input: RunAgentRuntimeChatInput,
) -> Result<RunAgentRuntimeChatOutput, String> {
    tauri::async_runtime::spawn_blocking(move || chat_with_agent_runtime_blocking(app, input))
        .await
        .map_err(|error| format!("Agent runtime chat 任务失败：{error}"))?
}

fn chat_with_agent_runtime_blocking(
    app: AppHandle,
    input: RunAgentRuntimeChatInput,
) -> Result<RunAgentRuntimeChatOutput, String> {
    let stream_id = input.stream_id.clone();
    let session_root_dir = resolve_optional_session_root_dir(
        input.workspace_path.as_deref(),
        input.session_root_dir.as_deref(),
    )?;
    let session = input.workspace_path.as_ref().map(|workspace_path| {
        json!({
            "workspacePath": workspace_path,
            "sessionRootDir": session_root_dir,
        })
    });
    let command = json!({
        "type": "chat",
        "session": session,
        "agent": {
            "agentId": input.agent_id,
        },
        "input": {
            "systemPrompt": input.system_prompt,
            "userMessage": input.user_message,
            "requestContext": input.request_context,
            "runtimeInstruction": input.runtime_instruction,
            "messages": input.messages,
        },
        "runtime": {
            "streamId": stream_id,
            "stream": input.stream.unwrap_or(true),
            "model": input.runtime_model,
        },
    });

    let value = call_agent_runtime_rpc(
        &app,
        "Agent runtime chat",
        command,
        &["chat_result"],
        |value| emit_agent_runtime_chat_event(&app, stream_id.as_deref(), value),
    )?;
    serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime chat 结果失败：{error}"))
}

fn emit_agent_runtime_chat_event(app: &AppHandle, stream_id: Option<&str>, value: &Value) {
    let Some(stream_id) = stream_id else {
        return;
    };
    let Some(event_type) = value.get("type").and_then(Value::as_str) else {
        return;
    };

    if event_type != "text_delta" && event_type != "thinking_delta" {
        return;
    }

    let Some(delta) = value.get("delta").and_then(Value::as_str) else {
        return;
    };

    let _ = app.emit(
        AGENT_RUNTIME_CHAT_EVENT,
        json!({
            "type": event_type,
            "streamId": stream_id,
            "delta": delta,
        }),
    );
}

fn validate_chat_input(input: &RunAgentRuntimeChatInput) -> Result<(), String> {
    let has_user_message = input
        .user_message
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_messages = input
        .messages
        .as_ref()
        .map(|messages| !messages.is_empty())
        .unwrap_or(false);
    if !has_user_message && !has_messages {
        return Err("消息不能为空".to_string());
    }

    Ok(())
}
