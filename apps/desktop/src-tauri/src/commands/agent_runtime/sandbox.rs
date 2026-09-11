use std::{
    io::Read,
    process::Stdio,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::AppHandle;

use super::runtime_files::{
    agent_runtime_entry_name, hide_subprocess_window, resolve_agent_runtime_cli_path,
    resolve_node_binary,
};

static SETUP_LOCK: Mutex<()> = Mutex::new(());

fn run_control_blocking(app: AppHandle, action: &'static str) -> Result<serde_json::Value, String> {
    let _guard = SETUP_LOCK
        .lock()
        .map_err(|_| "沙箱管理状态不可用。".to_string())?;
    let program = resolve_agent_runtime_cli_path(&app)?
        .with_file_name(agent_runtime_entry_name("sandboxControl")?);
    if !program.is_file() {
        return Err("未找到沙箱管理程序，请重新构建或安装应用。".into());
    }
    let mut command = std::process::Command::new(resolve_node_binary(&app)?);
    command
        .arg(&program)
        .arg(action)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(parent) = program.parent() {
        command.current_dir(parent);
    }
    hide_subprocess_window(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| format!("启动沙箱管理程序失败：{error}"))?;
    let stdout = child.stdout.take().ok_or("无法读取沙箱状态。")?;
    let stderr = child.stderr.take().ok_or("无法读取沙箱诊断。")?;
    let read = |mut stream: Box<dyn Read + Send>| {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            stream.read_to_end(&mut bytes).map(|_| bytes)
        })
    };
    let output = read(Box::new(stdout));
    let errors = read(Box::new(stderr));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            break status;
        }
        if started.elapsed() > Duration::from_secs(180) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("沙箱管理操作超时，请重新检测初始化状态。".into());
        }
        thread::sleep(Duration::from_millis(100));
    };
    let stdout = output
        .join()
        .map_err(|_| "读取沙箱状态失败。")?
        .map_err(|e| e.to_string())?;
    let stderr = errors
        .join()
        .map_err(|_| "读取沙箱诊断失败。")?
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(String::from_utf8_lossy(&stderr).trim().to_string());
    }
    serde_json::from_slice(&stdout).map_err(|error| format!("沙箱状态响应无效：{error}"))
}

async fn run_control(app: AppHandle, action: &'static str) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || run_control_blocking(app, action))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_agent_runtime_sandbox_status(app: AppHandle) -> Result<serde_json::Value, String> {
    run_control(app, "status").await
}

#[tauri::command]
pub async fn initialize_agent_runtime_sandbox(app: AppHandle) -> Result<serde_json::Value, String> {
    run_control(app, "install").await
}
