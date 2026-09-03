use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use super::plugins;
use crate::product_config::product_env_var;

const STDERR_TAIL_LINES: usize = 30;

#[derive(Clone, Default)]
pub(crate) struct PluginUiHost {
    inner: Arc<PluginUiHostInner>,
}

#[derive(Default)]
struct PluginUiHostInner {
    process: Mutex<Option<PluginUiProcess>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginUiConfiguration {
    settings_path: String,
    plugins: Vec<PluginUiRuntimePlugin>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginUiRuntimePlugin {
    id: String,
    name: String,
    version: String,
    description: String,
    source: String,
    specifier: String,
    package_root: String,
    patch_path: String,
    package_name: String,
}

struct PluginUiProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
    signature: String,
    next_request_id: u64,
}

impl PluginUiHost {
    pub(crate) fn catalog(&self, app: &AppHandle) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if configuration.plugins.is_empty() {
            self.invalidate()?;
            return Ok(json!({ "plugins": [] }));
        }
        self.request(app, configuration, "catalog", Value::Null)
    }

    pub(crate) fn execute(
        &self,
        app: &AppHandle,
        plugin_id: String,
        tool_name: String,
        arguments: Value,
    ) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if configuration.plugins.is_empty() {
            return Err("没有已启用的 UI 插件。".to_string());
        }
        self.request(
            app,
            configuration,
            "execute",
            json!({
                "pluginId": plugin_id,
                "toolName": tool_name,
                "arguments": arguments,
            }),
        )
    }

    pub(crate) fn document(&self, app: &AppHandle, plugin_id: String) -> Result<Value, String> {
        let configuration = configuration(app)?;
        if configuration.plugins.is_empty() {
            return Err("没有已启用的 UI 插件。".to_string());
        }
        self.request(
            app,
            configuration,
            "uiDocument",
            json!({ "pluginId": plugin_id }),
        )
    }

    pub(crate) fn invalidate(&self) -> Result<(), String> {
        let mut process = self
            .inner
            .process
            .lock()
            .map_err(|_| "Plugin UI Host 状态已损坏。".to_string())?;
        if let Some(mut current) = process.take() {
            current.stop();
        }
        Ok(())
    }

    fn request(
        &self,
        app: &AppHandle,
        configuration: PluginUiConfiguration,
        method: &str,
        params: Value,
    ) -> Result<Value, String> {
        let signature = serde_json::to_string(&configuration)
            .map_err(|error| format!("无法生成 Plugin UI Host 配置签名：{error}"))?;
        let mut slot = self
            .inner
            .process
            .lock()
            .map_err(|_| "Plugin UI Host 状态已损坏。".to_string())?;

        let reusable = match slot.as_mut() {
            Some(process) if process.signature == signature => process
                .child
                .try_wait()
                .map_err(|error| format!("无法检查 Plugin UI Host 状态：{error}"))?
                .is_none(),
            _ => false,
        };
        if !reusable {
            if let Some(mut current) = slot.take() {
                current.stop();
            }
            let mut process = PluginUiProcess::spawn(app, signature)?;
            process.request(
                "configure",
                serde_json::to_value(&configuration)
                    .map_err(|error| format!("无法序列化 Plugin UI Host 配置：{error}"))?,
            )?;
            *slot = Some(process);
        }

        let result = slot
            .as_mut()
            .ok_or_else(|| "Plugin UI Host 未能启动。".to_string())?
            .request(method, params);
        if result.is_err() {
            if let Some(mut current) = slot.take() {
                current.stop();
            }
        }
        result
    }
}

impl Drop for PluginUiHostInner {
    fn drop(&mut self) {
        if let Ok(slot) = self.process.get_mut() {
            if let Some(mut process) = slot.take() {
                process.stop();
            }
        }
    }
}

impl PluginUiProcess {
    fn spawn(app: &AppHandle, signature: String) -> Result<Self, String> {
        let node = plugins::resolve_node_binary(app)?;
        let service = resolve_service_path(app)?;
        let mut command = Command::new(&node);
        command
            .arg(&service)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        plugins::hide_subprocess_window(&mut command);
        let mut child = command.spawn().map_err(|error| {
            format!(
                "启动 Plugin UI Host 失败：{error}。Node：{}；服务：{}",
                node.display(),
                service.display()
            )
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Plugin UI Host 标准输入不可用。".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Plugin UI Host 标准输出不可用。".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Plugin UI Host 标准错误不可用。".to_string())?;
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

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            stderr_tail,
            signature,
            next_request_id: 1,
        })
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        if let Some(status) = self
            .child
            .try_wait()
            .map_err(|error| format!("无法检查 Plugin UI Host 状态：{error}"))?
        {
            return Err(format!(
                "Plugin UI Host 已退出（{status}）。{}",
                self.stderr_summary()
            ));
        }

        let id = self.next_request_id;
        self.next_request_id = self.next_request_id.saturating_add(1);
        serde_json::to_writer(
            &mut self.stdin,
            &json!({ "id": id, "method": method, "params": params }),
        )
        .map_err(|error| format!("无法写入 Plugin UI Host 请求：{error}"))?;
        self.stdin
            .write_all(b"\n")
            .and_then(|_| self.stdin.flush())
            .map_err(|error| format!("无法发送 Plugin UI Host 请求：{error}"))?;

        loop {
            let mut line = String::new();
            let read = self
                .stdout
                .read_line(&mut line)
                .map_err(|error| format!("无法读取 Plugin UI Host 响应：{error}"))?;
            if read == 0 {
                return Err(format!(
                    "Plugin UI Host 在响应前关闭。{}",
                    self.stderr_summary()
                ));
            }
            let response = match serde_json::from_str::<Value>(&line) {
                Ok(response) => response,
                Err(_) => {
                    self.push_diagnostic(line.trim().to_string());
                    continue;
                }
            };
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
                .ok_or_else(|| "Plugin UI Host 响应缺少 result。".to_string());
        }
    }

    fn stop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn push_diagnostic(&self, line: String) {
        if line.is_empty() {
            return;
        }
        if let Ok(mut tail) = self.stderr_tail.lock() {
            tail.push_back(line);
            while tail.len() > STDERR_TAIL_LINES {
                tail.pop_front();
            }
        }
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

impl Drop for PluginUiProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

fn configuration(app: &AppHandle) -> Result<PluginUiConfiguration, String> {
    let plugins = plugins::list_dsh_plugins(app)?
        .into_iter()
        .filter(|plugin| plugin.enabled)
        .map(|plugin| PluginUiRuntimePlugin {
            id: plugin.id.clone(),
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            source: plugin.source,
            specifier: plugin.specifier,
            package_root: plugin.path,
            patch_path: plugin.dsh_patch,
            package_name: plugin.id,
        })
        .collect();
    Ok(PluginUiConfiguration {
        settings_path: plugins::dsh_settings_location(app)?,
        plugins,
    })
}

fn resolve_service_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var(product_env_var("PLUGIN_HOST")) {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    if cfg!(debug_assertions) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../agent-runtime/dist/plugin-host/service.mjs");
        if path.is_file() {
            return Ok(path);
        }
    }
    for candidate in [
        "_up_/agent-runtime/dist/plugin-host/service.mjs",
        "agent-runtime/dist/plugin-host/service.mjs",
        "dist/plugin-host/service.mjs",
        "plugin-host/service.mjs",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Plugin UI Host 失败：{error}"))?;
        if path.is_file() {
            return Ok(path);
        }
    }
    Err("未找到 Plugin UI Host，请重新构建桌面端。".to_string())
}
