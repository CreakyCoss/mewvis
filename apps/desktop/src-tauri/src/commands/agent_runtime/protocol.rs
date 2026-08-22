use serde_json::{json, Value};

#[allow(dead_code)]
#[path = "../../../../agent-runtime/protocol/v1/sdk/rust/mod.rs"]
mod wire_sdk;

pub(super) use wire_sdk::{
    AgentRuntimeResources, AgentRuntimeSkillResources, AgentRuntimeToolResources, BundledPath,
    RuntimeModelInput, EVENT_DONE, EVENT_ERROR, EVENT_QUESTION, EVENT_QUESTION_ANSWERED,
    EVENT_STARTED, EVENT_TEXT_DELTA, EVENT_THINKING_DELTA, METHOD_AGENT_CHAT,
    METHOD_AGENT_QUESTION_ANSWER, METHOD_AGENT_RUN, METHOD_AGENT_TOOLS_LIST,
    METHOD_COLLABORATION_RUN, METHOD_COLLABORATION_RUN_MODE, METHOD_COLLABORATION_TIMELINE_READ,
    METHOD_RUNTIME_PING, METHOD_RUNTIME_SESSIONS_LIST, METHOD_RUNTIME_SESSION_DEBUG_READ,
    METHOD_RUNTIME_SESSION_READ, METHOD_RUNTIME_SHUTDOWN, METHOD_SESSION_AGENT_SUMMARIZE,
    METHOD_SESSION_READ, METHOD_SESSION_SUMMARIZE, RESULT_AGENT_TOOLS, RESULT_CHAT_RESULT,
    RESULT_COLLABORATION_TIMELINE_RESULT, RESULT_PONG, RESULT_RUNTIME_SESSIONS_RESULT,
    RESULT_RUNTIME_SESSION_DEBUG_RESULT, RESULT_RUNTIME_SESSION_RESULT,
    RESULT_SESSION_MUTATION_RESULT, RESULT_SESSION_RESULT, RESULT_SHUTDOWN_ACK, RESULT_TASK_RESULT,
};
use wire_sdk::{NOTIFICATION_RUNTIME_EVENT, NOTIFICATION_RUNTIME_RESULT};

#[derive(Debug, PartialEq)]
pub(super) enum RuntimeMessage {
    Response { id: Value, result: Value },
    Error(JsonRpcError),
    Event(Value),
    AdditionalResult(Value),
}

#[derive(Debug, PartialEq)]
pub(super) struct JsonRpcError {
    pub id: Value,
    pub code: i64,
    pub message: String,
    pub data: Option<Value>,
}

pub(super) fn request(id: impl Into<Value>, method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.into(),
        "method": method,
        "params": params,
    })
}

pub(super) fn notification(method: &str, params: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    })
}

pub(super) fn decode_runtime_message(value: Value) -> Result<RuntimeMessage, String> {
    let _generated_message: wire_sdk::AgentRuntimeMessage =
        serde_json::from_value(value.clone())
            .map_err(|error| format!("JSON-RPC 消息不符合生成协议类型：{error}"))?;
    let object = value
        .as_object()
        .ok_or_else(|| "JSON-RPC 消息必须是 object".to_string())?;

    if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        return Err("JSON-RPC 消息缺少 jsonrpc=2.0".to_string());
    }

    if let Some(method) = object.get("method") {
        if object.contains_key("id") {
            return Err("JSON-RPC server notification 不应包含 id".to_string());
        }
        let method = method
            .as_str()
            .ok_or_else(|| "JSON-RPC notification method 必须是 string".to_string())?;
        let params = object
            .get("params")
            .cloned()
            .ok_or_else(|| format!("JSON-RPC notification {method} 缺少 params"))?;
        if !params.is_object() {
            return Err(format!(
                "JSON-RPC notification {method} 的 params 必须是 object"
            ));
        }

        return match method {
            NOTIFICATION_RUNTIME_EVENT => Ok(RuntimeMessage::Event(params)),
            NOTIFICATION_RUNTIME_RESULT => Ok(RuntimeMessage::AdditionalResult(params)),
            _ => Err(format!("未知 JSON-RPC server notification：{method}")),
        };
    }

    let id = object
        .get("id")
        .cloned()
        .ok_or_else(|| "JSON-RPC response 缺少 id".to_string())?;
    if !matches!(id, Value::String(_) | Value::Number(_) | Value::Null) {
        return Err("JSON-RPC response id 必须是 string、integer 或 null".to_string());
    }

    match (object.get("result"), object.get("error")) {
        (Some(result), None) => {
            if id.is_null() {
                return Err("JSON-RPC success response id 不能是 null".to_string());
            }
            if !result.is_object() {
                return Err("JSON-RPC response result 必须是 object".to_string());
            }
            Ok(RuntimeMessage::Response {
                id,
                result: result.clone(),
            })
        }
        (None, Some(error)) => {
            let error = error
                .as_object()
                .ok_or_else(|| "JSON-RPC response error 必须是 object".to_string())?;
            let code = error
                .get("code")
                .and_then(Value::as_i64)
                .ok_or_else(|| "JSON-RPC response error.code 必须是 integer".to_string())?;
            let message = error
                .get("message")
                .and_then(Value::as_str)
                .ok_or_else(|| "JSON-RPC response error.message 必须是 string".to_string())?
                .to_string();
            Ok(RuntimeMessage::Error(JsonRpcError {
                id,
                code,
                message,
                data: error.get("data").cloned(),
            }))
        }
        (Some(_), Some(_)) => Err("JSON-RPC response 不能同时包含 result 和 error".to_string()),
        (None, None) => Err("JSON-RPC response 必须包含 result 或 error".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_json_rpc_requests_and_notifications() {
        assert_eq!(
            request("task-1", METHOD_AGENT_RUN, json!({ "taskId": "task-1" })),
            json!({
                "jsonrpc": "2.0",
                "id": "task-1",
                "method": "agent/run",
                "params": { "taskId": "task-1" },
            })
        );
        assert_eq!(
            notification(
                METHOD_AGENT_QUESTION_ANSWER,
                json!({ "taskId": "task-1", "questionId": "question-1", "answer": "yes" })
            ),
            json!({
                "jsonrpc": "2.0",
                "method": "agent/question/answer",
                "params": { "taskId": "task-1", "questionId": "question-1", "answer": "yes" },
            })
        );
    }

    #[test]
    fn decodes_responses_and_server_notifications() {
        assert_eq!(
            decode_runtime_message(json!({
                "jsonrpc": "2.0",
                "id": "request-1",
                "result": { "type": "pong" },
            })),
            Ok(RuntimeMessage::Response {
                id: json!("request-1"),
                result: json!({ "type": "pong" }),
            })
        );
        assert_eq!(
            decode_runtime_message(json!({
                "jsonrpc": "2.0",
                "method": "runtime/event",
                "params": { "type": "text_delta", "taskId": "task-1", "delta": "hello" },
            })),
            Ok(RuntimeMessage::Event(
                json!({ "type": "text_delta", "taskId": "task-1", "delta": "hello" })
            ))
        );
        assert_eq!(
            decode_runtime_message(json!({
                "jsonrpc": "2.0",
                "method": "runtime/result",
                "params": { "type": "task_result", "taskId": "task-1", "success": true },
            })),
            Ok(RuntimeMessage::AdditionalResult(json!({
                "type": "task_result",
                "taskId": "task-1",
                "success": true,
            })))
        );
    }

    #[test]
    fn rejects_legacy_and_invalid_envelopes() {
        assert!(decode_runtime_message(json!({ "type": "pong" })).is_err());
        assert!(decode_runtime_message(json!({
            "jsonrpc": "2.0",
            "id": "request-1",
            "result": { "type": "pong" },
            "error": { "code": -32603, "message": "broken" },
        }))
        .is_err());
    }

    #[test]
    fn rust_client_methods_are_declared_in_open_rpc() {
        let document: Value = serde_json::from_str(include_str!(
            "../../../../agent-runtime/protocol/v1/openrpc.json"
        ))
        .expect("OpenRPC document should be valid JSON");
        let methods = document["methods"]
            .as_array()
            .expect("OpenRPC methods should be an array")
            .iter()
            .filter_map(|method| method["name"].as_str())
            .collect::<Vec<_>>();

        for method in [
            METHOD_RUNTIME_PING,
            METHOD_RUNTIME_SHUTDOWN,
            METHOD_AGENT_TOOLS_LIST,
            METHOD_AGENT_CHAT,
            METHOD_AGENT_RUN,
            METHOD_AGENT_QUESTION_ANSWER,
            METHOD_SESSION_READ,
            METHOD_SESSION_SUMMARIZE,
            METHOD_SESSION_AGENT_SUMMARIZE,
            METHOD_RUNTIME_SESSIONS_LIST,
            METHOD_RUNTIME_SESSION_READ,
            METHOD_RUNTIME_SESSION_DEBUG_READ,
            METHOD_COLLABORATION_TIMELINE_READ,
            METHOD_COLLABORATION_RUN,
            METHOD_COLLABORATION_RUN_MODE,
        ] {
            assert!(
                methods.contains(&method),
                "missing OpenRPC method: {method}"
            );
        }

        assert_eq!(wire_sdk::AGENT_RUNTIME_PROTOCOL_VERSION, "1.0.0");
        assert_eq!(
            wire_sdk::AGENT_RUNTIME_JSON_RPC_METHODS.len(),
            methods.len() - wire_sdk::AGENT_RUNTIME_NOTIFICATION_METHODS.len()
        );
    }
}
