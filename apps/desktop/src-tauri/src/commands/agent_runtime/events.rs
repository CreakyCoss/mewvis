use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const AGENT_RUNTIME_AGENT_EVENT: &str = "agent_runtime_agent_event";

pub(super) fn emit_runtime_value(app: &AppHandle, task_id: &str, value: Value) {
    emit_agent_event(app, task_id, value);
}

pub(super) fn emit_agent_event(app: &AppHandle, task_id: &str, event: Value) {
    let _ = app.emit(
        AGENT_RUNTIME_AGENT_EVENT,
        json!({
            "taskId": task_id,
            "event": event,
        }),
    );
}
