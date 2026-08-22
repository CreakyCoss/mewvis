use super::{
    protocol::{EVENT_TEXT_DELTA, EVENT_THINKING_DELTA, METHOD_AGENT_CHAT, RESULT_CHAT_RESULT},
    rpc::call_agent_runtime_rpc,
    types::{AgentRuntimeChatMessageInput, AgentRuntimeModelInput},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const AGENT_RUNTIME_CHAT_EVENT: &str = "agent_runtime_chat_event";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeChatInput {
    stream_id: Option<String>,
    stream: Option<bool>,
    runtime_model: Option<AgentRuntimeModelInput>,
    system_prompt: Option<String>,
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
    let params = json!({
        "streamId": stream_id,
        "stream": input.stream.unwrap_or(true),
        "runtimeModel": input.runtime_model,
        "systemPrompt": input.system_prompt,
        "messages": input.messages,
    });

    let value = call_agent_runtime_rpc(
        &app,
        "Agent runtime chat",
        METHOD_AGENT_CHAT,
        params,
        &[RESULT_CHAT_RESULT],
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

    if event_type != EVENT_TEXT_DELTA && event_type != EVENT_THINKING_DELTA {
        return;
    }

    if value.get("delta").and_then(Value::as_str).is_none() {
        return;
    }

    let _ = app.emit(
        AGENT_RUNTIME_CHAT_EVENT,
        json!({
            "streamId": stream_id,
            "event": value,
        }),
    );
}

fn validate_chat_input(input: &RunAgentRuntimeChatInput) -> Result<(), String> {
    if !input
        .messages
        .iter()
        .any(|message| !message.content.trim().is_empty())
    {
        return Err("消息不能为空".to_string());
    }

    Ok(())
}
