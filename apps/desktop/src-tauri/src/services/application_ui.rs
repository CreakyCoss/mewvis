use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};

use super::application_data::ApplicationDataHost;
use super::applications;
use crate::product_config::product_env_var;

const STDERR_TAIL_LINES: usize = 30;

#[derive(Clone, Default)]
pub(crate) struct ApplicationUiHost {
    inner: Arc<ApplicationUiHostInner>,
}

#[derive(Default)]
struct ApplicationUiHostInner {
    process: Mutex<Option<ApplicationUiProcess>>,
    chat_writer: Mutex<Option<(String, Arc<Mutex<ChildStdin>>)>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationUiConfiguration {
    settings_path: String,
    applications: Vec<ApplicationUiRuntimeApplication>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationUiRuntimeApplication {
    kind: applications::ApplicationRuntimeKind,
    id: String,
    name: String,
    version: String,
    description: String,
    source: String,
    entry: String,
    package_root: String,
    patch_path: Option<String>,
    permissions: Vec<applications::ApplicationPermission>,
    agent_access: Option<crate::commands::agent_runtime::AgentAccess>,
    permission_status: applications::ApplicationPermissionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    data_connection: Option<String>,
}

struct ApplicationUiProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    responses: mpsc::Receiver<Value>,
    connection_id: String,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
    signature: String,
    next_request_id: u64,
    data_host: ApplicationDataHost,
    data_connections: Vec<String>,
}

impl ApplicationUiHost {
    pub(crate) fn tool_policy(
        &self,
        app: &AppHandle,
        application_id: String,
        policy: Option<Value>,
    ) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if !configuration
            .applications
            .iter()
            .any(|application| application.id == application_id)
        {
            return Err("应用未启用或不存在".into());
        }
        let method = if policy.is_some() {
            "toolPolicy.set"
        } else {
            "toolPolicy.get"
        };
        self.request(
            app,
            configuration,
            method,
            json!({ "applicationId": application_id, "policy": policy }),
        )
    }

    pub(crate) fn post_chat(&self, connection_id: &str, message: Value) -> Result<(), String> {
        let writer = self
            .inner
            .chat_writer
            .lock()
            .map_err(|_| "应用聊天连接已损坏".to_string())?;
        let (current, stdin) = writer
            .as_ref()
            .ok_or_else(|| "应用聊天连接已关闭".to_string())?;
        if current != connection_id {
            return Err("应用聊天连接已过期".to_string());
        }
        write_message(stdin, &message)
    }

    pub(crate) fn catalog(&self, app: &AppHandle) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if configuration.applications.is_empty() {
            self.invalidate()?;
            return Ok(json!({ "applications": [] }));
        }
        self.request(app, configuration, "catalog", Value::Null)
    }

    pub(crate) fn execute(
        &self,
        app: &AppHandle,
        application_id: String,
        tool_name: String,
        arguments: Value,
    ) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if configuration.applications.is_empty() {
            return Err("没有已启用的 UI 应用。".to_string());
        }
        self.request(
            app,
            configuration,
            "execute",
            json!({
                "applicationId": application_id,
                "toolName": tool_name,
                "arguments": arguments,
            }),
        )
    }

    pub(crate) fn document(&self, app: &AppHandle, application_id: String) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if configuration.applications.is_empty() {
            return Err("没有已启用的 UI 应用。".to_string());
        }
        self.request(
            app,
            configuration,
            "uiDocument",
            json!({ "applicationId": application_id }),
        )
    }

    pub(crate) fn invalidate(&self) -> Result<(), String> {
        let mut process = self
            .inner
            .process
            .lock()
            .map_err(|_| "Application UI Host 状态已损坏。".to_string())?;
        if let Some(mut current) = process.take() {
            current.stop();
        }
        *self
            .inner
            .chat_writer
            .lock()
            .map_err(|_| "应用聊天连接已损坏".to_string())? = None;
        Ok(())
    }

    fn request(
        &self,
        app: &AppHandle,
        mut configuration: ApplicationUiConfiguration,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let signature = serde_json::to_string(&configuration)
            .map_err(|error| format!("无法生成 Application UI Host 配置签名：{error}"))?;
        let mut slot = self
            .inner
            .process
            .lock()
            .map_err(|_| "Application UI Host 状态已损坏。".to_string())?;

        let reusable = match slot.as_mut() {
            Some(process) if process.signature == signature => process
                .child
                .try_wait()
                .map_err(|error| format!("无法检查 Application UI Host 状态：{error}"))?
                .is_none(),
            _ => false,
        };
        if !reusable {
            if let Some(mut current) = slot.take() {
                current.stop();
            }
            let mut process = ApplicationUiProcess::spawn(app, signature, &mut configuration)?;
            *self
                .inner
                .chat_writer
                .lock()
                .map_err(|_| "应用聊天连接已损坏".to_string())? =
                Some((process.connection_id.clone(), process.stdin.clone()));
            process.request(
                "configure",
                serde_json::to_value(&configuration)
                    .map_err(|error| format!("无法序列化 Application UI Host 配置：{error}"))?,
            )?;
            *slot = Some(process);
        }

        let result = slot
            .as_mut()
            .ok_or_else(|| "Application UI Host 未能启动。".to_string())?
            .request(method, params);
        if result.is_err() {
            if let Some(mut current) = slot.take() {
                current.stop();
            }
        }
        result
    }
}

impl Drop for ApplicationUiHostInner {
    fn drop(&mut self) {
        if let Ok(slot) = self.process.get_mut() {
            if let Some(mut process) = slot.take() {
                process.stop();
            }
        }
    }
}

impl ApplicationUiProcess {
    fn spawn(
        app: &AppHandle,
        signature: String,
        configuration: &mut ApplicationUiConfiguration,
    ) -> Result<Self, String> {
        let node = applications::resolve_node_binary(app)?;
        let service = resolve_service_path(app)?;
        let mut command = Command::new(&node);
        command
            .arg(&service)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        applications::hide_subprocess_window(&mut command);
        let mut child = command.spawn().map_err(|error| {
            format!(
                "启动 Application UI Host 失败：{error}。Node：{}；服务：{}",
                node.display(),
                service.display()
            )
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Application UI Host 标准输入不可用。".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Application UI Host 标准输出不可用。".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Application UI Host 标准错误不可用。".to_string())?;
        let stderr_tail = Arc::new(Mutex::new(VecDeque::new()));
        let stderr_target = stderr_tail.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Ok(mut tail) = stderr_target.lock() {
                    tail.push_back(line);
                    while tail.len() > STDERR_TAIL_LINES {
                        tail.pop_front();
                    }
                }
            }
        });

        let stdin = Arc::new(Mutex::new(stdin));
        let data_host = app.state::<ApplicationDataHost>().inner().clone();
        let data_connections: Vec<String> = configuration
            .applications
            .iter_mut()
            .filter_map(|application| {
                let token = data_host.connect(app, &application.id).ok();
                application.data_connection = token.clone();
                token
            })
            .collect();
        let data_reader = data_host.clone();
        let data_writer = stdin.clone();
        let connection_id = format!(
            "{}-{}",
            child.id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let reader_connection = connection_id.clone();
        let event_app = app.clone();
        let (sender, responses) = mpsc::channel();
        thread::spawn(move || {
            route_application_output(BufReader::new(stdout), sender, |mut message| {
                if message.get("type").and_then(Value::as_str) == Some("application-data:request") {
                    let id = message.get("id").cloned().unwrap_or(Value::Null);
                    let token = message
                        .get("connection")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned();
                    let data_reader = data_reader.clone();
                    let data_writer = data_writer.clone();
                    let event_app = event_app.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        let response = data_reader.request(
                            &event_app,
                            &token,
                            message.get("request").cloned().unwrap_or(Value::Null),
                        );
                        let _ = write_message(
                            &data_writer,
                            &json!({"type":"application-data:response", "id":id, "response":response}),
                        );
                    });
                    return;
                }
                if let Some(object) = message.as_object_mut() {
                    object.insert(
                        "connectionId".to_string(),
                        Value::String(reader_connection.clone()),
                    );
                    let _ = event_app.emit_to("main", "application-chat:request", &message);
                }
            });
            let _ = event_app.emit_to("main", "application-chat:disconnect", &reader_connection);
        });
        Ok(Self {
            child,
            stdin,
            responses,
            connection_id,
            stderr_tail,
            signature,
            next_request_id: 1,
            data_host,
            data_connections,
        })
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        if let Some(status) = self
            .child
            .try_wait()
            .map_err(|error| format!("无法检查 Application UI Host 状态：{error}"))?
        {
            return Err(format!(
                "Application UI Host 已退出（{status}）。{}",
                self.stderr_summary()
            ));
        }

        let id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);
        write_message(
            &self.stdin,
            &json!({ "id": id, "method": method, "params": params }),
        )?;
        loop {
            let response = self
                .responses
                .recv_timeout(Duration::from_secs(90))
                .map_err(|error| {
                    format!(
                        "Application UI Host 响应中断：{error}。{}",
                        self.stderr_summary()
                    )
                })?;
            if response.get("id").and_then(Value::as_u64) != Some(id) {
                if response.get("id").is_none() || response.get("id") == Some(&Value::Null) {
                    if let Some(message) =
                        response.pointer("/error/message").and_then(Value::as_str)
                    {
                        return Err(message.to_string());
                    }
                }
                continue;
            }
            if let Some(message) = response.pointer("/error/message").and_then(Value::as_str) {
                return Err(message.to_string());
            }
            return response
                .get("result")
                .cloned()
                .ok_or_else(|| "Application UI Host 响应缺少 result。".to_string());
        }
    }

    fn stop(&mut self) {
        for token in self.data_connections.drain(..) {
            self.data_host.disconnect(&token);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn stderr_summary(&self) -> String {
        let Ok(tail) = self.stderr_tail.lock() else {
            return String::new();
        };
        if tail.is_empty() {
            String::new()
        } else {
            format!("\n{}", tail.iter().cloned().collect::<Vec<_>>().join("\n"))
        }
    }
}

impl Drop for ApplicationUiProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

fn configuration(app: &AppHandle) -> Result<ApplicationUiConfiguration, String> {
    let applications = applications::list_applications(app)?
        .into_iter()
        .filter(|application| application.enabled)
        .map(|application| ApplicationUiRuntimeApplication {
            kind: application.runtime_kind,
            id: application.id.clone(),
            name: application.name,
            version: application.version,
            description: application.description,
            source: application.source,
            entry: application.entry,
            package_root: application.path,
            patch_path: application.dsh_patch,
            permissions: application.permissions,
            agent_access: application.agent_access,
            permission_status: application.permission_status,
            data_connection: None,
        })
        .collect();
    Ok(ApplicationUiConfiguration {
        settings_path: applications::settings_location(app)?,
        applications,
    })
}

pub(crate) fn resolve_service_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var(product_env_var("APPLICATION_HOST")) {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    if cfg!(debug_assertions) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../agent-runtime/dist/app-host/service.mjs");
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "开发模式缺少 Application UI Host：{}。请在 apps/desktop 运行 pnpm build:agent-runtime。",
            path.display()
        ));
    }
    for candidate in [
        "_up_/agent-runtime/dist/app-host/service.mjs",
        "agent-runtime/dist/app-host/service.mjs",
        "dist/app-host/service.mjs",
        "app-host/service.mjs",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Application UI Host 失败：{error}"))?;
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("未找到 Application UI Host，请重新构建桌面端。".to_string())
}

fn write_message(stdin: &Arc<Mutex<ChildStdin>>, message: &Value) -> Result<(), String> {
    let mut writer = stdin.lock().map_err(|_| "应用输入连接已损坏".to_string())?;
    serde_json::to_writer(&mut *writer, message).map_err(|error| error.to_string())?;
    writer
        .write_all(b"\n")
        .and_then(|_| writer.flush())
        .map_err(|error| error.to_string())
}

// Keep reading while the ordinary request waits; chat replies may be needed to finish that request.
fn route_application_output(reader: impl BufRead, responses: mpsc::Sender<Value>, chat: impl Fn(Value)) {
    for line in reader.lines().map_while(Result::ok) {
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if matches!(
            message.get("type").and_then(Value::as_str),
            Some("application-chat:request" | "application-data:request")
        ) {
            chat(message);
        } else if responses.send(message).is_err() {
            break;
        }
    }
}

#[cfg(test)]
mod chat_bridge_tests {
    use super::*;
    use std::cell::RefCell;
    use std::io::Cursor;
    #[test]
    fn chat_and_data_notifications_do_not_consume_normal_rpc_responses() {
        let (sender, receiver) = mpsc::channel();
        let notifications = RefCell::new(Vec::new());
        let lines = concat!(
            "diagnostic text\n",
            "{\"type\":\"application-chat:request\",\"id\":\"1\",\"applicationId\":\"fixture\"}\n",
            "{\"id\":1,\"result\":{\"ok\":true}}\n",
            "{\"type\":\"application-chat:request\",\"id\":\"2\"}\n",
            "{\"type\":\"application-data:request\",\"id\":\"3\",\"connection\":\"fixture\",\"request\":{\"version\":1,\"method\":\"storage.keys\"}}\n"
        );
        route_application_output(Cursor::new(lines), sender, |message| {
            notifications.borrow_mut().push(message)
        });
        assert_eq!(notifications.borrow().len(), 3);
        assert_eq!(
            receiver.recv().unwrap(),
            json!({"id": 1, "result": {"ok": true}})
        );
        assert!(receiver.recv().is_err());
    }
}
