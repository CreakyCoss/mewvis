use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const AGENT_RUNTIME_AGENT_EVENT: &str = "agent_runtime_agent_event";

pub(super) fn emit_bridge_line(app: &AppHandle, task_id: &str, line: &str) {
    match serde_json::from_str::<Value>(line) {
        Ok(mut value) => {
            if value.get("taskId").is_none() {
                value["taskId"] = Value::String(task_id.to_string());
            }
            emit_agent_event(app, value);
        }
        Err(error) => emit_agent_event(
            app,
            json!({
                "type": "error",
                "taskId": task_id,
                "message": format!("解析 Agent runtime agent 输出失败：{error}"),
                "raw": line,
            }),
        ),
    }
}

pub(super) fn emit_agent_event(app: &AppHandle, event: Value) {
    let _ = app.emit(AGENT_RUNTIME_AGENT_EVENT, event);
}
