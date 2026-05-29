use super::{bridge::append_agent_diagnostic, process::spawn_agent_bridge};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    thread,
};
use tauri::AppHandle;

pub(super) fn call_agent_bridge_rpc(
    app: &AppHandle,
    label: &str,
    command: Value,
    result_types: &[&str],
    mut on_event: impl FnMut(&Value),
) -> Result<Value, String> {
    let (mut child, _config) = spawn_agent_bridge(app, label, Vec::<(String, String)>::new())?;

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
    let mut result_line: Option<String> = None;
    let mut output_lines = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|error| format!("读取 {label} 输出失败：{error}"))?;
        if line.trim().is_empty() {
            continue;
        }
        output_lines.push(line.clone());

        let value = parse_bridge_line(label, &line)?;
        let event_type = value.get("type").and_then(Value::as_str);
        if event_type == Some("error")
            || event_type.is_some_and(|kind| result_types.contains(&kind))
        {
            result_line = Some(line);
        } else {
            on_event(&value);
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

    let line = result_line.ok_or_else(|| {
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
    let value = parse_bridge_line(label, &line)?;

    if value.get("type").and_then(Value::as_str) == Some("error") {
        return Err(value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Agent bridge 返回错误")
            .to_string());
    }

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

    let event_type = value.get("type").and_then(Value::as_str);
    if !event_type.is_some_and(|kind| result_types.contains(&kind)) {
        return Err(format!("{label} 返回了未知结果：{line}"));
    }

    Ok(value)
}

fn parse_bridge_line(label: &str, line: &str) -> Result<Value, String> {
    serde_json::from_str(line)
        .map_err(|error| format!("解析 {label} 输出失败：{error}，raw={line}"))
}
