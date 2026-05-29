use super::{
    rpc::call_agent_bridge_rpc,
    types::{AgentRuntimeChatMessageInput, AgentRuntimeModelInput, AgentRuntimeProviderInput},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const AGENT_RUNTIME_CHAT_EVENT: &str = "agent_runtime_chat_event";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeChatInput {
    agent_id: Option<String>,
    stream_id: Option<String>,
    stream: Option<bool>,
    provider: Option<AgentRuntimeProviderInput>,
    model: Option<AgentRuntimeModelInput>,
    system_prompt: String,
    messages: Vec<AgentRuntimeChatMessageInput>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeChatOutput {
    text: String,
    thinking: Option<String>,
}

#[tauri::command]
pub async fn run_agent_runtime_chat(
    app: AppHandle,
    input: RunAgentRuntimeChatInput,
) -> Result<RunAgentRuntimeChatOutput, String> {
    validate_chat_input(&input)?;
    chat_with_agent_bridge(app, input).await
}

async fn chat_with_agent_bridge(
    app: AppHandle,
    input: RunAgentRuntimeChatInput,
) -> Result<RunAgentRuntimeChatOutput, String> {
    tauri::async_runtime::spawn_blocking(move || chat_with_agent_bridge_blocking(app, input))
        .await
        .map_err(|error| format!("Agent runtime chat bridge 任务失败：{error}"))?
}

fn chat_with_agent_bridge_blocking(
    app: AppHandle,
    input: RunAgentRuntimeChatInput,
) -> Result<RunAgentRuntimeChatOutput, String> {
    let stream_id = input.stream_id.clone();
    let command = json!({
        "type": "chat",
        "agentId": input.agent_id,
        "streamId": stream_id,
        "stream": input.stream.unwrap_or(true),
        "provider": input.provider,
        "model": input.model,
        "systemPrompt": input.system_prompt,
        "messages": input.messages,
    });

    let value = call_agent_bridge_rpc(
        &app,
        "Agent runtime chat bridge",
        command,
        &["chat_result"],
        |value| emit_agent_runtime_chat_event(&app, stream_id.as_deref(), value),
    )?;
    serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime chat bridge 结果失败：{error}"))
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
    if input.messages.is_empty() {
        return Err("消息不能为空".to_string());
    }

    Ok(())
}
