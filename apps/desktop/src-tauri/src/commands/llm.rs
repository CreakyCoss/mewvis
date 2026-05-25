use crate::db::config_db::{self, LlmSettings, SaveLlmSettingsInput};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::Write,
    process::{Command, Stdio},
};
use tauri::AppHandle;

const DEFAULT_LLM_RUNTIME: &str = "pi-ai";

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
pub struct ChatWithLlmInput {
    runtime: Option<String>,
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
pub struct ChatWithLlmOutput {
    text: String,
    thinking: Option<String>,
}

struct ChatCompletionOutput {
    text: String,
    thinking: Option<String>,
}

#[tauri::command]
pub async fn chat_with_llm(app: AppHandle, input: ChatWithLlmInput) -> Result<ChatWithLlmOutput, String> {
    validate_chat_input(&input)?;

    match input.runtime.as_deref().unwrap_or(DEFAULT_LLM_RUNTIME) {
        "pi-ai" => chat_with_pi_ai_bridge(app, input).await,
        "system" => chat_with_system_llm(input).await,
        runtime => Err(format!("未知 LLM Runtime：{runtime}")),
    }
}

async fn chat_with_system_llm(input: ChatWithLlmInput) -> Result<ChatWithLlmOutput, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|error| format!("创建 LLM HTTP 客户端失败：{error}"))?;

    let output = match input.provider.provider.as_str() {
        "anthropic" => chat_with_anthropic(&client, &input).await?,
        "google" => chat_with_gemini(&client, &input).await?,
        "openai" | "openrouter" => chat_with_openai_compatible(&client, &input).await?,
        provider => return Err(format!("暂不支持的 Provider 类型：{provider}")),
    };

    Ok(ChatWithLlmOutput {
        text: output.text,
        thinking: output.thinking,
    })
}

async fn chat_with_pi_ai_bridge(
    app: AppHandle,
    input: ChatWithLlmInput,
) -> Result<ChatWithLlmOutput, String> {
    tauri::async_runtime::spawn_blocking(move || chat_with_pi_ai_bridge_blocking(app, input))
        .await
        .map_err(|error| format!("LLM bridge 任务失败：{error}"))?
}

fn chat_with_pi_ai_bridge_blocking(
    app: AppHandle,
    input: ChatWithLlmInput,
) -> Result<ChatWithLlmOutput, String> {
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
            format!("llm bridge spawn failed error={error}"),
        );
        format!(
            "启动 LLM bridge 失败：{error}。Node 路径：{}",
            node_binary.display()
        )
    })?;

    let command = json!({
        "type": "chat",
        "provider": input.provider,
        "model": input.model,
        "systemPrompt": input.system_prompt,
        "messages": input.messages,
    });

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "LLM bridge stdin 不可用".to_string())?;
    writeln!(stdin, "{command}").map_err(|error| format!("发送 LLM 请求失败：{error}"))?;
    drop(stdin);

    let output = child
        .wait_with_output()
        .map_err(|error| format!("读取 LLM bridge 输出失败：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !stderr.is_empty() {
        super::agent::append_agent_diagnostic(&app, format!("llm bridge stderr {stderr}"));
    }

    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| {
            format!(
                "LLM bridge 未返回结果：{}",
                if stderr.is_empty() {
                    format!("exit={:?}", output.status.code())
                } else {
                    stderr.clone()
                }
            )
        })?;
    let value: Value = serde_json::from_str(line)
        .map_err(|error| format!("解析 LLM bridge 输出失败：{error}，raw={line}"))?;

    if value.get("type").and_then(Value::as_str) == Some("error") {
        return Err(value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("LLM bridge 返回错误")
            .to_string());
    }

    if !output.status.success() {
        return Err(format!(
            "LLM bridge 执行失败：{}",
            if stderr.is_empty() {
                format!("exit={:?}", output.status.code())
            } else {
                stderr
            }
        ));
    }

    if value.get("type").and_then(Value::as_str) != Some("chat_result") {
        return Err(format!("LLM bridge 返回了未知结果：{line}"));
    }

    serde_json::from_value(value).map_err(|error| format!("解析 LLM bridge 结果失败：{error}"))
}

fn validate_chat_input(input: &ChatWithLlmInput) -> Result<(), String> {
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

async fn chat_with_openai_compatible(
    client: &reqwest::Client,
    input: &ChatWithLlmInput,
) -> Result<ChatCompletionOutput, String> {
    let endpoint = join_endpoint(
        input.provider.base_url.as_deref(),
        "https://api.openai.com/v1",
        "chat/completions",
    );
    let api_key = required_api_key(input)?;
    let mut messages = vec![json!({
        "role": "system",
        "content": input.system_prompt,
    })];

    messages.extend(input.messages.iter().map(|message| {
        json!({
            "role": normalize_openai_role(&message.role),
            "content": message.content,
        })
    }));

    let response = client
        .post(&endpoint)
        .headers(bearer_headers(api_key)?)
        .json(&json!({
            "model": input.model.model_id,
            "messages": messages,
            "stream": false,
        }))
        .send()
        .await
        .map_err(|error| llm_transport_error(input, &endpoint, error))?;

    let value = read_json_response(input, response).await?;
    let text = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let thinking = first_string_value(
        value.pointer("/choices/0/message"),
        &["reasoning_content", "reasoning", "thinking"],
    );

    if text.is_empty() {
        return Err(format!(
            "{} / {} 没有返回文本内容",
            input.provider.name, input.model.model_name
        ));
    }

    Ok(ChatCompletionOutput { text, thinking })
}

async fn chat_with_anthropic(
    client: &reqwest::Client,
    input: &ChatWithLlmInput,
) -> Result<ChatCompletionOutput, String> {
    let endpoint = join_endpoint(
        input.provider.base_url.as_deref(),
        "https://api.anthropic.com",
        "v1/messages",
    );
    let api_key = required_api_key(input)?;
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "x-api-key",
        HeaderValue::from_str(api_key).map_err(|_| "API Key 包含非法字符".to_string())?,
    );
    headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));

    let messages = input
        .messages
        .iter()
        .map(|message| {
            json!({
                "role": normalize_anthropic_role(&message.role),
                "content": message.content,
            })
        })
        .collect::<Vec<_>>();

    let response = client
        .post(&endpoint)
        .headers(headers)
        .json(&json!({
            "model": input.model.model_id,
            "system": input.system_prompt,
            "messages": messages,
            "max_tokens": 4096,
        }))
        .send()
        .await
        .map_err(|error| llm_transport_error(input, &endpoint, error))?;

    let value = read_json_response(input, response).await?;
    let text = value
        .get("content")
        .and_then(Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter_map(|item| item.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
        .trim()
        .to_string();
    let thinking = value
        .get("content")
        .and_then(Value::as_array)
        .map(|content| {
            content
                .iter()
                .filter(|item| {
                    item.get("type")
                        .and_then(Value::as_str)
                        .is_some_and(|kind| kind == "thinking")
                })
                .filter_map(|item| first_string_value(Some(item), &["thinking", "text"]))
                .collect::<Vec<_>>()
                .join("")
        })
        .filter(|content| !content.trim().is_empty());

    if text.is_empty() {
        return Err(format!(
            "{} / {} 没有返回文本内容",
            input.provider.name, input.model.model_name
        ));
    }

    Ok(ChatCompletionOutput { text, thinking })
}

async fn chat_with_gemini(
    client: &reqwest::Client,
    input: &ChatWithLlmInput,
) -> Result<ChatCompletionOutput, String> {
    let base_url = input
        .provider
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("https://generativelanguage.googleapis.com/v1beta")
        .trim_end_matches('/');
    let endpoint = format!(
        "{base_url}/models/{}:generateContent?key={}",
        encode_path_segment(&input.model.model_id),
        required_api_key(input)?
    );
    let contents = input
        .messages
        .iter()
        .map(|message| {
            json!({
                "role": normalize_gemini_role(&message.role),
                "parts": [{ "text": message.content }],
            })
        })
        .collect::<Vec<_>>();

    let response = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "systemInstruction": {
                "parts": [{ "text": input.system_prompt }],
            },
            "contents": contents,
        }))
        .send()
        .await
        .map_err(|error| llm_transport_error(input, base_url, error))?;

    let value = read_json_response(input, response).await?;
    let text = value
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter(|part| {
                    !part
                        .get("thought")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                })
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default()
        .trim()
        .to_string();
    let thinking = value
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter(|part| {
                    part.get("thought")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                })
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("")
        })
        .filter(|content| !content.trim().is_empty());

    if text.is_empty() {
        return Err(format!(
            "{} / {} 没有返回文本内容",
            input.provider.name, input.model.model_name
        ));
    }

    Ok(ChatCompletionOutput { text, thinking })
}

async fn read_json_response(
    input: &ChatWithLlmInput,
    response: reqwest::Response,
) -> Result<Value, String> {
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 LLM 响应失败：{error}"))?;

    if !status.is_success() {
        return Err(format!(
            "{} / {} 请求失败：HTTP {}，{}",
            input.provider.name,
            input.model.model_name,
            status.as_u16(),
            truncate_response(&text)
        ));
    }

    serde_json::from_str(&text).map_err(|error| {
        format!(
            "{} / {} 返回了无法解析的 JSON：{}，{}",
            input.provider.name,
            input.model.model_name,
            error,
            truncate_response(&text)
        )
    })
}

fn bearer_headers(api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {api_key}"))
            .map_err(|_| "API Key 包含非法字符".to_string())?,
    );
    Ok(headers)
}

fn first_string_value(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    let value = value?;
    keys.iter()
        .filter_map(|key| value.get(key).and_then(Value::as_str))
        .map(str::trim)
        .find(|text| !text.is_empty())
        .map(ToString::to_string)
}

fn required_api_key(input: &ChatWithLlmInput) -> Result<&str, String> {
    input
        .provider
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{} 未配置 API Key", input.provider.name))
}

fn join_endpoint(base_url: Option<&str>, default_base_url: &str, path: &str) -> String {
    let base_url = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(default_base_url)
        .trim_end_matches('/');

    if base_url.ends_with(path) {
        return base_url.to_string();
    }

    if let Some(stripped_path) = path.strip_prefix("v1/") {
        if base_url.ends_with("/v1") {
            return format!("{base_url}/{stripped_path}");
        }
    }

    format!("{base_url}/{path}")
}

fn normalize_openai_role(role: &str) -> &str {
    match role {
        "assistant" => "assistant",
        _ => "user",
    }
}

fn normalize_anthropic_role(role: &str) -> &str {
    match role {
        "assistant" => "assistant",
        _ => "user",
    }
}

fn normalize_gemini_role(role: &str) -> &str {
    match role {
        "assistant" => "model",
        _ => "user",
    }
}

fn llm_transport_error(input: &ChatWithLlmInput, endpoint: &str, error: reqwest::Error) -> String {
    format!(
        "{} / {} 连接失败：{}。请求地址：{}",
        input.provider.name, input.model.model_name, error, endpoint
    )
}

fn truncate_response(text: &str) -> String {
    let text = text.trim();

    if text.chars().count() <= 600 {
        return text.to_string();
    }

    format!("{}...", text.chars().take(600).collect::<String>())
}

fn encode_path_segment(value: &str) -> String {
    let mut output = String::new();

    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                output.push(byte as char);
            }
            _ => output.push_str(&format!("%{byte:02X}")),
        }
    }

    output
}
