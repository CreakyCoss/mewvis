use crate::db::config_db::{self, LlmSettings, SaveLlmSettingsInput};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Command, Stdio},
    thread,
};
use tauri::{AppHandle, Emitter};

const AGENT_RUNTIME_CHAT_EVENT: &str = "agent_runtime_chat_event";

#[tauri::command]
pub fn get_llm_settings(app: AppHandle) -> Result<LlmSettings, String> {
    config_db::llm_settings(&app)
}

#[tauri::command]
pub fn save_llm_settings(
    app: AppHandle,
    input: SaveLlmSettingsInput,
) -> Result<LlmSettings, String> {
    config_db::save_llm_settings(&app, input)
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentRuntimeChatInput {
    bridge_agent_id: Option<String>,
    stream_id: Option<String>,
    stream: Option<bool>,
    provider: ChatProviderInput,
    model: ChatModelInput,
    system_prompt: String,
    messages: Vec<ChatMessageInput>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatProviderInput {
    id: Option<String>,
    name: String,
    vendor: Option<String>,
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatModelInput {
    id: Option<String>,
    model_id: String,
    model_name: String,
    base_url: Option<String>,
    reasoning: Option<bool>,
    thinking_level_map: Option<Value>,
    input: Option<Vec<String>>,
    cost: Option<Value>,
    context_window: Option<u64>,
    max_tokens: Option<u64>,
    headers: Option<Value>,
    compat: Option<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageInput {
    role: String,
    content: String,
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
    let bridge_path = super::agent::resolve_agent_bridge_path(&app)?;
    let node_binary = super::agent::resolve_node_binary(&app)?;
    let bridge_dir = bridge_path.parent().map(|path| path.to_path_buf());
    let node_binary_arg = super::agent::path_for_node(&node_binary);
    let bridge_path_arg = super::agent::path_for_node(&bridge_path);

    let mut command = Command::new(&node_binary_arg);
    command
        .arg(&bridge_path_arg)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(bridge_dir) = &bridge_dir {
        command.env("PI_PACKAGE_DIR", super::agent::path_for_node(bridge_dir));
    }
    super::agent::hide_subprocess_window(&mut command);

    let mut child = command.spawn().map_err(|error| {
        super::agent::append_agent_diagnostic(
            &app,
            format!("agent runtime chat bridge spawn failed error={error}"),
        );
        format!(
            "启动 Agent runtime chat bridge 失败：{error}。Node 路径：{}",
            node_binary.display()
        )
    })?;

    let stream_id = input.stream_id.clone();
    let command = json!({
        "type": "chat",
        "bridgeAgentId": input.bridge_agent_id,
        "streamId": stream_id,
        "stream": input.stream.unwrap_or(true),
        "provider": input.provider,
        "model": input.model,
        "systemPrompt": input.system_prompt,
        "messages": input.messages,
    });

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Agent runtime chat bridge stdin 不可用".to_string())?;
    writeln!(stdin, "{command}")
        .map_err(|error| format!("发送 Agent runtime chat 请求失败：{error}"))?;
    drop(stdin);

    let stderr_handle = child.stderr.take().map(|stderr| {
        thread::spawn(move || {
            let mut stderr_text = String::new();
            let mut reader = BufReader::new(stderr);
            let _ = reader.read_to_string(&mut stderr_text);
            stderr_text
        })
    });

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Agent runtime chat bridge stdout 不可用".to_string())?;
    let reader = BufReader::new(stdout);
    let mut result_line: Option<String> = None;
    let mut output_lines = Vec::new();

    for line in reader.lines() {
        let line =
            line.map_err(|error| format!("读取 Agent runtime chat bridge 输出失败：{error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        output_lines.push(line.clone());

        if let Some(value) = parse_agent_runtime_chat_bridge_line(&line)? {
            if value.get("type").and_then(Value::as_str) == Some("chat_result") {
                result_line = Some(line);
            } else {
                emit_agent_runtime_chat_event(&app, stream_id.as_deref(), &value);
            }
        }
    }

    let status = child
        .wait()
        .map_err(|error| format!("等待 Agent runtime chat bridge 结束失败：{error}"))?;
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    if !stderr.is_empty() {
        super::agent::append_agent_diagnostic(
            &app,
            format!("agent runtime chat bridge stderr {stderr}"),
        );
    }

    let line = result_line.ok_or_else(|| {
        format!(
            "Agent runtime chat bridge 未返回结果：{}",
            if stderr.is_empty() {
                format!(
                    "exit={:?} stdout={}",
                    status.code(),
                    output_lines.join("\n")
                )
            } else {
                stderr.clone()
            }
        )
    })?;
    let value: Value = serde_json::from_str(&line)
        .map_err(|error| format!("解析 Agent runtime chat bridge 输出失败：{error}，raw={line}"))?;

    if value.get("type").and_then(Value::as_str) == Some("error") {
        return Err(value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Agent runtime chat bridge 返回错误")
            .to_string());
    }

    if !status.success() {
        return Err(format!(
            "Agent runtime chat bridge 执行失败：{}",
            if stderr.is_empty() {
                format!("exit={:?}", status.code())
            } else {
                stderr
            }
        ));
    }

    if value.get("type").and_then(Value::as_str) != Some("chat_result") {
        return Err(format!("Agent runtime chat bridge 返回了未知结果：{line}"));
    }

    serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime chat bridge 结果失败：{error}"))
}

fn parse_agent_runtime_chat_bridge_line(line: &str) -> Result<Option<Value>, String> {
    let value: Value = serde_json::from_str(line)
        .map_err(|error| format!("解析 Agent runtime chat bridge 输出失败：{error}，raw={line}"))?;
    Ok(Some(value))
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
    if input
        .provider
        .api_key
        .as_deref()
        .unwrap_or("")
        .trim()
        .is_empty()
    {
        return Err(format!("{} 未配置 API Key", input.provider.name));
    }

    if input.model.model_id.trim().is_empty() {
        return Err("请选择要使用的模型".to_string());
    }

    if input.messages.is_empty() {
        return Err("消息不能为空".to_string());
    }

    Ok(())
}
