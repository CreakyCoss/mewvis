use super::{
    process::spawn_agent_runtime,
    protocol::{decode_runtime_message, request, JsonRpcError, RuntimeMessage},
    runtime_files::append_agent_diagnostic,
};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    thread,
};
use tauri::AppHandle;
use uuid::Uuid;

pub(super) fn call_agent_runtime_rpc(
    app: &AppHandle,
    label: &str,
    method: &str,
    params: Value,
    result_types: &[&str],
    mut on_event: impl FnMut(&Value),
) -> Result<Value, String> {
    let (mut child, _config) = spawn_agent_runtime(app, label, Vec::<(String, String)>::new())?;
    let request_id = Uuid::now_v7().to_string();
    let command = request(request_id.clone(), method, params);

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| format!("{label} stdin 不可用"))?;
    writeln!(stdin, "{command}").map_err(|error| format!("发送 {label} 请求失败：{error}"))?;
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
        .ok_or_else(|| format!("{label} stdout 不可用"))?;
    let reader = BufReader::new(stdout);
    let mut result_value: Option<Value> = None;
    let mut response_error: Option<JsonRpcError> = None;
    let mut output_lines = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|error| format!("读取 {label} 输出失败：{error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        output_lines.push(line.clone());

        let value = parse_runtime_line(label, &line)?;
        match decode_runtime_message(value)
            .map_err(|error| format!("解析 {label} JSON-RPC 输出失败：{error}，raw={line}"))?
        {
            RuntimeMessage::Response { id, result } => {
                if id != json!(request_id) {
                    return Err(format!(
                        "{label} 返回了不匹配的 JSON-RPC id：expected={request_id} actual={id}"
                    ));
                }
                let result_type = result.get("type").and_then(Value::as_str);
                if result_type.is_some_and(|kind| result_types.contains(&kind)) {
                    result_value = Some(result);
                } else {
                    return Err(format!("{label} 返回了未知结果：{result}"));
                }
            }
            RuntimeMessage::Error(error) => response_error = Some(error),
            RuntimeMessage::Event(event) => on_event(&event),
            RuntimeMessage::AdditionalResult(result) => {
                let result_type = result.get("type").and_then(Value::as_str);
                if result_type.is_some_and(|kind| result_types.contains(&kind)) {
                    result_value = Some(result);
                } else {
                    on_event(&result);
                }
            }
        }
    }

    let status = child
        .wait()
        .map_err(|error| format!("等待 {label} 结束失败：{error}"))?;
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    if !stderr.is_empty() {
        append_agent_diagnostic(app, format!("{label} stderr {stderr}"));
    }

    if let Some(error) = response_error {
        let details = error
            .data
            .map(|data| format!("，data={data}"))
            .unwrap_or_default();
        return Err(format!(
            "{} (JSON-RPC {}{})",
            error.message, error.code, details
        ));
    }

    let value = result_value.ok_or_else(|| {
        format!(
            "{label} 未返回结果：{}",
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

    if !status.success() {
        return Err(format!(
            "{label} 执行失败：{}",
            if stderr.is_empty() {
                format!("exit={:?}", status.code())
            } else {
                stderr
            }
        ));
    }

    Ok(value)
}

fn parse_runtime_line(label: &str, line: &str) -> Result<Value, String> {
    serde_json::from_str(line)
        .map_err(|error| format!("解析 {label} 输出失败：{error}，raw={line}"))
}
