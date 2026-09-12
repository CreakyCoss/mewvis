use crate::services::application_data::ApplicationDataHost;
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::services::{
    application_ui::ApplicationUiHost,
    applications::{
        self, InstallMarketplaceApplicationRequest, MarketplaceSearchResult, ApplicationDescriptor,
        RemovedApplication,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallApplicationInput {
    source_path: String,
    enable: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectApplicationInput {
    source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetApplicationEnabledInput {
    id: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveApplicationInput {
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchApplicationMarketplaceInput {
    provider: String,
    query: String,
    page: Option<u32>,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteApplicationUiToolInput {
    application_id: String,
    tool_name: String,
    #[serde(default)]
    arguments: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetApplicationUiDocumentInput {
    application_id: String,
}

#[tauri::command]
pub fn list_applications(app: AppHandle) -> Result<Vec<ApplicationDescriptor>, String> {
    applications::list_applications(&app)
}

#[tauri::command]
pub async fn get_application_tool_policy(
    window: tauri::WebviewWindow,
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    application_id: String,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("仅宿主主窗口可以查询工具授权".into());
    }
    let host = application_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.tool_policy(&app, application_id, None))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn set_application_tool_policy(
    window: tauri::WebviewWindow,
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    application_id: String,
    policy: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("仅宿主主窗口可以修改工具授权".into());
    }
    let host = application_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.tool_policy(&app, application_id, Some(policy)))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn inspect_application(input: InspectApplicationInput) -> Result<ApplicationDescriptor, String> {
    tauri::async_runtime::spawn_blocking(move || applications::inspect_local_application(&input.source_path))
        .await
        .map_err(|error| format!("应用检查任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_application(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    input: InstallApplicationInput,
) -> Result<ApplicationDescriptor, String> {
    let application = tauri::async_runtime::spawn_blocking(move || {
        applications::install_local_application(&app, &input.source_path, input.enable)
    })
    .await
    .map_err(|error| format!("应用安装任务失败：{error}"))??;
    application_ui.invalidate()?;
    Ok(application)
}

#[tauri::command]
pub async fn search_application_marketplace(
    input: SearchApplicationMarketplaceInput,
) -> Result<MarketplaceSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        applications::search_marketplace(&input.provider, &input.query, input.page, input.limit)
    })
    .await
    .map_err(|error| format!("应用市场搜索任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_application_from_marketplace(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    input: InstallMarketplaceApplicationRequest,
) -> Result<ApplicationDescriptor, String> {
    let application = tauri::async_runtime::spawn_blocking(move || {
        applications::install_marketplace_application(&app, input)
    })
    .await
    .map_err(|error| format!("应用市场安装任务失败：{error}"))??;
    application_ui.invalidate()?;
    Ok(application)
}

#[tauri::command]
pub fn set_application_enabled(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    agent_runtime: State<'_, super::agent_runtime::AgentRuntimeSupervisor>,
    input: SetApplicationEnabledInput,
) -> Result<ApplicationDescriptor, String> {
    let application = applications::set_application_enabled(&app, &input.id, input.enabled)?;
    if !input.enabled {
        app.state::<ApplicationDataHost>().revoke(&input.id);
        agent_runtime.abort_application(&input.id)?;
        let _ = app.emit_to("main", "application-chat:revoke", &input.id);
    }
    application_ui.invalidate()?;
    Ok(application)
}

#[tauri::command]
pub async fn remove_application(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    agent_runtime: State<'_, super::agent_runtime::AgentRuntimeSupervisor>,
    input: RemoveApplicationInput,
) -> Result<RemovedApplication, String> {
    application_ui.invalidate()?;
    let worker_app = app.clone();
    let application_id = input.id.clone();
    app.state::<ApplicationDataHost>().revoke(&application_id);
    agent_runtime.abort_application(&application_id)?;
    let removed = tauri::async_runtime::spawn_blocking(move || {
        applications::remove_installed_application(&worker_app, &input.id)
    })
    .await
    .map_err(|error| format!("应用移除任务失败：{error}"))??;
    let _ = app.emit_to("main", "application-chat:revoke", &application_id);
    Ok(removed)
}

#[tauri::command]
pub async fn list_application_ui(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
) -> Result<Value, String> {
    let application_ui = application_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || application_ui.catalog(&app))
        .await
        .map_err(|error| format!("读取应用 UI 任务失败：{error}"))?
}

#[tauri::command]
pub async fn execute_application_ui_tool(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    input: ExecuteApplicationUiToolInput,
) -> Result<Value, String> {
    let application_ui = application_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        application_ui.execute(&app, input.application_id, input.tool_name, input.arguments)
    })
    .await
    .map_err(|error| format!("应用工具调用任务失败：{error}"))?
}

#[tauri::command]
pub async fn get_application_ui_document(
    app: AppHandle,
    application_ui: State<'_, ApplicationUiHost>,
    input: GetApplicationUiDocumentInput,
) -> Result<Value, String> {
    let application_ui = application_ui.inner().clone();
    tauri::async_runtime::spawn_blocking(move || application_ui.document(&app, input.application_id))
        .await
        .map_err(|error| format!("读取应用 UI 文档失败：{error}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationChatPostInput {
    connection_id: String,
    message: Value,
}

#[tauri::command]
pub fn connect_application_data(
    app: AppHandle,
    host: State<ApplicationDataHost>,
    application_id: String,
) -> Result<String, Value> {
    host.connect(&app, &application_id)
}

#[tauri::command]
pub async fn request_application_data(
    app: AppHandle,
    host: State<'_, ApplicationDataHost>,
    connection: String,
    request: Value,
) -> Result<Value, String> {
    let host = host.inner().clone();
    Ok(
        tauri::async_runtime::spawn_blocking(move || host.request(&app, &connection, request))
            .await
            .unwrap_or_else(|_| {
                crate::services::application_data::error("INTERNAL_ERROR", "应用数据任务失败")
            }),
    )
}

#[tauri::command]
pub fn disconnect_application_data(host: State<ApplicationDataHost>, connection: String) {
    host.disconnect(&connection);
}

#[tauri::command]
pub fn post_application_chat(
    application_ui: State<'_, ApplicationUiHost>,
    input: ApplicationChatPostInput,
) -> Result<(), String> {
    let kind = input.message.get("type").and_then(Value::as_str);
    if !matches!(
        kind,
        Some("application-chat:response") | Some("application-chat:snapshot")
    ) {
        return Err("无效的应用聊天响应".to_string());
    }
    application_ui.post_chat(&input.connection_id, input.message)
}
