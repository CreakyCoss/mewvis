use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::services::{
    plugin_ui::PluginUiHost,
    plugins::{
        self, DshMarketplaceSearchResult, DshPluginDescriptor, InstallMarketplaceDshPluginRequest,
        RemovedDshPlugin,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallDshPluginInput {
    source_path: String,
    enable: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDshPluginEnabledInput {
    id: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveDshPluginInput {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchDshPluginMarketplaceInput {
    query: String,
    page: Option<u32>,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteDshPluginUiToolInput {
    plugin_id: String,
    tool_name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetDshPluginUiDocumentInput {
    plugin_id: String,
}

#[tauri::command]
pub fn list_dsh_plugins(app: AppHandle) -> Result<Vec<DshPluginDescriptor>, String> {
    plugins::list_dsh_plugins(&app)
}

#[tauri::command]
pub async fn install_dsh_plugin(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: InstallDshPluginInput,
) -> Result<DshPluginDescriptor, String> {
    let plugin = tauri::async_runtime::spawn_blocking(move || {
        plugins::install_local_dsh_plugin(&app, &input.source_path, input.enable)
    })
    .await
    .map_err(|error| format!("插件安装任务失败：{error}"))??;
    plugin_ui.invalidate()?;
    Ok(plugin)
}

#[tauri::command]
pub async fn search_dsh_plugin_marketplace(
    input: SearchDshPluginMarketplaceInput,
) -> Result<DshMarketplaceSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        plugins::search_dsh_marketplace(&input.query, input.page, input.limit)
    })
    .await
    .map_err(|error| format!("DSH 市场搜索任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_dsh_plugin_from_marketplace(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: InstallMarketplaceDshPluginRequest,
) -> Result<DshPluginDescriptor, String> {
    let plugin = tauri::async_runtime::spawn_blocking(move || {
        plugins::install_marketplace_dsh_plugin(&app, input)
    })
    .await
    .map_err(|error| format!("DSH 市场插件安装任务失败：{error}"))??;
    plugin_ui.invalidate()?;
    Ok(plugin)
}

#[tauri::command]
pub fn set_dsh_plugin_enabled(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: SetDshPluginEnabledInput,
) -> Result<DshPluginDescriptor, String> {
    let plugin = plugins::set_dsh_plugin_enabled(&app, &input.id, input.enabled)?;
    plugin_ui.invalidate()?;
    Ok(plugin)
}

#[tauri::command]
pub async fn remove_dsh_plugin(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: RemoveDshPluginInput,
) -> Result<RemovedDshPlugin, String> {
    plugin_ui.invalidate()?;
    tauri::async_runtime::spawn_blocking(move || {
        plugins::remove_installed_dsh_plugin(&app, &input.id)
    })
    .await
    .map_err(|error| format!("插件移除任务失败：{error}"))?
}

#[tauri::command]
pub async fn list_dsh_plugin_ui(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
) -> Result<Value, String> {
    let plugin_ui = plugin_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || plugin_ui.catalog(&app))
        .await
        .map_err(|error| format!("读取插件 UI 任务失败：{error}"))?
}

#[tauri::command]
pub async fn execute_dsh_plugin_ui_tool(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: ExecuteDshPluginUiToolInput,
) -> Result<Value, String> {
    let plugin_ui = plugin_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        plugin_ui.execute(&app, input.plugin_id, input.tool_name, input.arguments)
    })
    .await
    .map_err(|error| format!("插件工具调用任务失败：{error}"))?
}

#[tauri::command]
pub async fn get_dsh_plugin_ui_document(
    app: AppHandle,
    plugin_ui: State<'_, PluginUiHost>,
    input: GetDshPluginUiDocumentInput,
) -> Result<Value, String> {
    let plugin_ui = plugin_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || plugin_ui.document(&app, input.plugin_id))
        .await
        .map_err(|error| format!("读取插件 UI 文档失败：{error}"))?
}
