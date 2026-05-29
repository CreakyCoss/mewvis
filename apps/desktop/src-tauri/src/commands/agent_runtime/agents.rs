use super::rpc::call_agent_bridge_rpc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeAgentDefinitionOutput {
    id: String,
    label: String,
    description: String,
    capabilities: Vec<String>,
    requires_model: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListAgentRuntimeAgentsOutput {
    default_agent_id: String,
    agents: Vec<AgentRuntimeAgentDefinitionOutput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentDefinitionsBridgeResult {
    #[serde(rename = "type")]
    result_type: String,
    default_agent_id: String,
    agents: Vec<AgentRuntimeAgentDefinitionOutput>,
}

#[tauri::command]
pub async fn list_agent_runtime_agents(
    app: AppHandle,
) -> Result<ListAgentRuntimeAgentsOutput, String> {
    tauri::async_runtime::spawn_blocking(move || list_agent_runtime_agents_blocking(app))
        .await
        .map_err(|error| format!("Agent runtime agents bridge 任务失败：{error}"))?
}

fn list_agent_runtime_agents_blocking(
    app: AppHandle,
) -> Result<ListAgentRuntimeAgentsOutput, String> {
    let value = call_agent_bridge_rpc(
        &app,
        "Agent runtime agents bridge",
        json!({ "type": "list_agents" }),
        &["agent_definitions"],
        |_| {},
    )?;
    let result: AgentDefinitionsBridgeResult = serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime agents 结果失败：{error}"))?;
    if result.result_type != "agent_definitions" {
        return Err(format!(
            "Agent runtime agents bridge 返回了未知结果：{}",
            result.result_type
        ));
    }

    Ok(ListAgentRuntimeAgentsOutput {
        default_agent_id: result.default_agent_id,
        agents: result.agents,
    })
}
