use super::rpc::call_agent_runtime_rpc;
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
pub struct ListAgentRuntimeToolsInput {
    agent_id: Option<String>,
}

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
    agent_id: Option<String>,
    tools: Vec<AgentRuntimeToolSummaryOutput>,
    default_tool_names: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentDefinitionsRuntimeResult {
    #[serde(rename = "type")]
    result_type: String,
    default_agent_id: String,
    agents: Vec<AgentRuntimeAgentDefinitionOutput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentToolsRuntimeResult {
    #[serde(rename = "type")]
    result_type: String,
    agent_id: Option<String>,
    tools: Vec<AgentRuntimeToolSummaryOutput>,
    default_tool_names: Vec<String>,
}

#[tauri::command]
pub async fn list_agent_runtime_agents(
    app: AppHandle,
) -> Result<ListAgentRuntimeAgentsOutput, String> {
    tauri::async_runtime::spawn_blocking(move || list_agent_runtime_agents_blocking(app))
        .await
        .map_err(|error| format!("Agent runtime agents 任务失败：{error}"))?
}

fn list_agent_runtime_agents_blocking(
    app: AppHandle,
) -> Result<ListAgentRuntimeAgentsOutput, String> {
    let value = call_agent_runtime_rpc(
        &app,
        "Agent runtime agents",
        json!({ "type": "list_agents" }),
        &["agent_definitions"],
        |_| {},
    )?;
    let result: AgentDefinitionsRuntimeResult = serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime agents 结果失败：{error}"))?;
    if result.result_type != "agent_definitions" {
        return Err(format!(
            "Agent runtime agents 返回了未知结果：{}",
            result.result_type
        ));
    }

    Ok(ListAgentRuntimeAgentsOutput {
        default_agent_id: result.default_agent_id,
        agents: result.agents,
    })
}

#[tauri::command]
pub async fn list_agent_runtime_tools(
    app: AppHandle,
    input: Option<ListAgentRuntimeToolsInput>,
) -> Result<ListAgentRuntimeToolsOutput, String> {
    tauri::async_runtime::spawn_blocking(move || list_agent_runtime_tools_blocking(app, input))
        .await
        .map_err(|error| format!("Agent runtime tools 任务失败：{error}"))?
}

fn list_agent_runtime_tools_blocking(
    app: AppHandle,
    input: Option<ListAgentRuntimeToolsInput>,
) -> Result<ListAgentRuntimeToolsOutput, String> {
    let agent_id = input.and_then(|value| value.agent_id);
    let value = call_agent_runtime_rpc(
        &app,
        "Agent runtime tools",
        json!({
            "type": "list_agent_tools",
            "agentId": agent_id,
        }),
        &["agent_tools"],
        |_| {},
    )?;
    let result: AgentToolsRuntimeResult = serde_json::from_value(value)
        .map_err(|error| format!("解析 Agent runtime tools 结果失败：{error}"))?;
    if result.result_type != "agent_tools" {
        return Err(format!(
            "Agent runtime tools 返回了未知结果：{}",
            result.result_type
        ));
    }

    Ok(ListAgentRuntimeToolsOutput {
        agent_id: result.agent_id,
        tools: result.tools,
        default_tool_names: result.default_tool_names,
    })
}
