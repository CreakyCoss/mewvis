use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use crate::services::{
    plugin_ui::PluginUiHost,
    plugins::{
        self, InstallMarketplacePluginRequest, MarketplaceSearchResult, PluginDescriptor,
        RemovedPlugin,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPluginInput {
    source_path: String,
    enable: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectPluginInput {
    source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPluginEnabledInput {
    id: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovePluginInput {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPluginMarketplaceInput {
    provider: String,
    query: String,
    page: Option<u32>,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutePluginUiToolInput {
    plugin_id: String,
    tool_name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetPluginUiDocumentInput {
    plugin_id: String,
}

#[tauri::command]
pub fn list_plugins(app: AppHandle) -> Result<Vec<PluginDescriptor>, String> {
    plugins::list_plugins(&app)
}

#[tauri::command]
pub async fn inspect_plugin(input: InspectPluginInput) -> Result<PluginDescriptor, String> {
    tauri::async_runtime::spawn_blocking(move || plugins::inspect_local_plugin(&input.source_path))
        .await
        .map_err(|error| format!("插件检查任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_plugin(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: InstallPluginInput,
) -> Result<PluginDescriptor, String> {
    let plugin = tauri::async_runtime::spawn_blocking(move || {
        plugins::install_local_plugin(&app, &input.source_path, input.enable)
    })
    .await
    .map_err(|error| format!("插件安装任务失败：{error}"))??;
    plugin_ui.invalidate()?;
    Ok(plugin)
}

#[tauri::command]
pub async fn search_plugin_marketplace(
    input: SearchPluginMarketplaceInput,
) -> Result<MarketplaceSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        plugins::search_marketplace(&input.provider, &input.query, input.page, input.limit)
    })
    .await
    .map_err(|error| format!("插件市场搜索任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_plugin_from_marketplace(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: InstallMarketplacePluginRequest,
) -> Result<PluginDescriptor, String> {
    let plugin = tauri::async_runtime::spawn_blocking(move || {
        plugins::install_marketplace_plugin(&app, input)
    })
    .await
    .map_err(|error| format!("插件市场安装任务失败：{error}"))??;
    plugin_ui.invalidate()?;
    Ok(plugin)
}

#[tauri::command]
pub fn set_plugin_enabled(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    agent_runtime: State<'_, super::agent_runtime::AgentRuntimeSupervisor>,
    input: SetPluginEnabledInput,
) -> Result<PluginDescriptor, String> {
    let plugin = plugins::set_plugin_enabled(&app, &input.id, input.enabled)?;
    if !input.enabled {
        agent_runtime.abort_plugin(&input.id)?;
        let _ = app.emit_to("main", "plugin-chat:revoke", &input.id);
    }
    plugin_ui.invalidate()?;
    Ok(plugin)
}

#[tauri::command]
pub async fn remove_plugin(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    agent_runtime: State<'_, super::agent_runtime::AgentRuntimeSupervisor>,
    input: RemovePluginInput,
) -> Result<RemovedPlugin, String> {
    plugin_ui.invalidate()?;
    let worker_app = app.clone();
    let plugin_id = input.id.clone();
    agent_runtime.abort_plugin(&plugin_id)?;
    let removed = tauri::async_runtime::spawn_blocking(move || {
        plugins::remove_installed_plugin(&worker_app, &input.id)
    })
    .await
    .map_err(|error| format!("插件移除任务失败：{error}"))??;
    let _ = app.emit_to("main", "plugin-chat:revoke", &plugin_id);
    Ok(removed)
}

#[tauri::command]
pub async fn list_plugin_ui(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
) -> Result<Value, String> {
    let plugin_ui = plugin_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || plugin_ui.catalog(&app))
        .await
        .map_err(|error| format!("读取插件 UI 任务失败：{error}"))?
}

#[tauri::command]
pub async fn execute_plugin_ui_tool(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: ExecutePluginUiToolInput,
) -> Result<Value, String> {
    let plugin_ui = plugin_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        plugin_ui.execute(&app, input.plugin_id, input.tool_name, input.arguments)
    })
    .await
    .map_err(|error| format!("插件工具调用任务失败：{error}"))?
}

#[tauri::command]
pub async fn get_plugin_ui_document(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: GetPluginUiDocumentInput,
) -> Result<Value, String> {
    let plugin_ui = plugin_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || plugin_ui.document(&app, input.plugin_id))
        .await
        .map_err(|error| format!("读取插件 UI 文档失败：{error}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginChatPostInput {
    connection_id: String,
    message: Value,
}

#[tauri::command]
pub fn post_plugin_chat(
    plugin_ui: State<'_, PluginUiHost>,
    input: PluginChatPostInput,
) -> Result<(), String> {
    let kind = input.message.get("type").and_then(Value::as_str);
    if !matches!(
        kind,
        Some("plugin-chat:response") | Some("plugin-chat:snapshot")
    ) {
        return Err("无效的插件聊天响应".to_string());
    }
    plugin_ui.post_chat(&input.connection_id, input.message)
}
