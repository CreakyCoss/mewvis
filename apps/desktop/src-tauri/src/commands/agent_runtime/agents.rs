use super::{
    protocol::{AgentPermissionOption, METHOD_AGENT_TOOLS_LIST, RESULT_AGENT_TOOLS},
    rpc::call_agent_runtime_rpc,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeToolSummaryOutput {
    name: String,
    label: String,
    description: Option<String>,
    enabled_by_default: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAgentRuntimeToolsOutput {
    tools: Vec<AgentRuntimeToolSummaryOutput>,
    default_tool_names: Vec<String>,
    permission_options: Vec<AgentPermissionOption>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentToolsRuntimeResult {
    #[serde(rename = "type")]
    result_type: String,
    tools: Vec<AgentRuntimeToolSummaryOutput>,
    default_tool_names: Vec<String>,
    permission_options: Vec<AgentPermissionOption>,
}

#[tauri::command]
pub async fn list_agent_runtime_tools(
    app: AppHandle,
    _input: Option<Value>,
) -> Result<ListAgentRuntimeToolsOutput, String> {
    tauri::async_runtime::spawn_blocking(move || list_agent_runtime_tools_blocking(app))
        .await
        .map_err(|error| format!("Agent runtime tools 任务失败：{error}"))?
}

fn list_agent_runtime_tools_blocking(
    app: AppHandle,
) -> Result<ListAgentRuntimeToolsOutput, String> {
    let value = call_agent_runtime_rpc(
        &app,
        "Agent runtime tools",
        METHOD_AGENT_TOOLS_LIST,
        json!({}),
        &[RESULT_AGENT_TOOLS],
        |_| {},
    )?;
    let result: AgentToolsRuntimeResult = serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime tools 结果失败：{error}"))?;
    if result.result_type != RESULT_AGENT_TOOLS {
        return Err(format!(
            "Agent runtime tools 返回了未知结果：{}",
            result.result_type
        ));
    }

    Ok(ListAgentRuntimeToolsOutput {
        tools: result.tools,
        default_tool_names: result.default_tool_names,
        permission_options: result.permission_options,
    })
}
