use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Read},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
pub struct BackendConnection {
    url: String,
    token: String,
}

struct BackendProcess {
    child: Child,
    input: Option<ChildStdin>,
    connection: BackendConnection,
    #[cfg(windows)]
    _job: WindowsJob,
}

impl Drop for BackendProcess {
    fn drop(&mut self) {
        // EOF is the shutdown request. Node owns graceful cleanup of every worker.
        self.input.take();
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if matches!(self.child.try_wait(), Ok(Some(_))) {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        #[cfg(unix)]
        unsafe {
            // The server and its descendants belong to the group created at spawn.
            libc::kill(-(self.child.id() as i32), libc::SIGKILL);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        // WindowsJob closes after this method and kills remaining descendants.
    }
}

#[derive(Default)]
pub struct NodeBackend {
    process: Mutex<Option<BackendProcess>>,
    stopping: AtomicBool,
}

impl NodeBackend {
    fn connection(&self, app: &AppHandle) -> Result<BackendConnection, String> {
        if self.stopping.load(Ordering::SeqCst) {
            return Err("桌面正在退出".into());
        }
        let mut current = self.process.lock().map_err(|_| "Node 服务状态不可用")?;
        if let Some(process) = current.as_mut() {
            if process
                .child
                .try_wait()
                .map_err(|e| e.to_string())?
                .is_some()
            {
                return Err("Node 服务已退出，请重新打开应用".into());
            }
            return Ok(process.connection.clone());
        }
        let process = start(app, &self.stopping)?;
        let connection = process.connection.clone();
        *current = Some(process);
        Ok(connection)
    }

    pub fn shutdown(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut current) = self.process.lock() {
            current.take();
        }
    }
}

#[tauri::command]
pub async fn get_backend_connection(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<BackendConnection, String> {
    if window.label() != "main" {
        return Err("只有主窗口可以获取后端连接".into());
    }
    tauri::async_runtime::spawn_blocking(move || app.state::<NodeBackend>().connection(&app))
        .await
        .map_err(|e| e.to_string())?
}

fn runtime_directory(app: &AppHandle) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../agent-runtime/dist");
        if path.join("server/cli.mjs").is_file() {
            return path.canonicalize().map_err(|e| e.to_string());
        }
    }
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let path = resources.join("_up_/_up_/agent-runtime/dist");
    if path.join("server/cli.mjs").is_file() {
        return Ok(path);
    }
    Err("未找到 Node 后端，请重新构建桌面运行资源".into())
}

fn start(app: &AppHandle, stopping: &AtomicBool) -> Result<BackendProcess, String> {
    let runtime = runtime_directory(app)?;
    let binary = runtime.join(if cfg!(windows) { "node.exe" } else { "node" });
    let mut command = Command::new(binary);
    command
        .arg(runtime.join("server/cli.mjs"))
        .arg("--desktop")
        .env("ISLE_SERVER_RESOURCES", &runtime)
        .env("ISLE_SERVER_PORT", "0")
        .env_remove("ISLE_SERVER_TOKEN")
        .env_remove("ISLE_DESKTOP_DEV_ORIGIN")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    if cfg!(debug_assertions) {
        if let Some(url) = app.config().build.dev_url.as_ref() {
            command.env(
                "ISLE_DESKTOP_DEV_ORIGIN",
                url.origin().ascii_serialization(),
            );
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 Node 后端失败：{e}"))?;
    #[cfg(windows)]
    let job = match WindowsJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    let output = child.stdout.take().ok_or("无法读取 Node 启动状态")?;
    let input = child.stdin.take();
    // Own the process before any fallible readiness work, including timeout and bad JSON.
    let mut process = BackendProcess {
        child,
        input,
        connection: BackendConnection {
            url: String::new(),
            token: String::new(),
        },
        #[cfg(windows)]
        _job: job,
    };
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        let mut bytes = Vec::new();
        let result = reader
            .by_ref()
            .take(16 * 1024)
            .read_until(b'\n', &mut bytes)
            .map_err(|e| e.to_string())
            .and_then(|_| parse_ready(&bytes));
        let _ = sender.send(result);
        // Readiness contains the credential; it must never be copied to logs.
        let _ = std::io::copy(&mut reader, &mut std::io::sink());
    });
    let deadline = Instant::now() + Duration::from_secs(60);
    process.connection = loop {
        if stopping.load(Ordering::SeqCst) {
            return Err("桌面正在退出".into());
        }
        if Instant::now() >= deadline {
            return Err("等待 Node 后端启动超时，请检查后端启动日志".into());
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(result) => break result?,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err("Node 后端启动连接已关闭".into())
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    };
    Ok(process)
}

fn parse_ready(bytes: &[u8]) -> Result<BackendConnection, String> {
    #[derive(Deserialize)]
    struct Ready {
        r#type: String,
        url: String,
        token: String,
    }
    let invalid = || "Node 后端启动握手无效".to_string();
    let ready: Ready = serde_json::from_slice(bytes).map_err(|_| invalid())?;
    let url = tauri::Url::parse(&ready.url).map_err(|_| invalid())?;
    if ready.r#type != "ready"
        || url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || ready.token.len() != 64
        || !ready.token.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(invalid());
    }
    Ok(BackendConnection {
        url: ready.url.trim_end_matches('/').into(),
        token: ready.token,
    })
}

#[cfg(windows)]
struct WindowsJob(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
unsafe impl Send for WindowsJob {}
#[cfg(windows)]
impl WindowsJob {
    fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::*;
        unsafe {
            let job = Self(CreateJobObjectW(std::ptr::null(), std::ptr::null()));
            if job.0.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
                || AssignProcessToJobObject(job.0, child.as_raw_handle() as _) == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(job)
        }
    }
}
#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn readiness_accepts_only_private_loopback_connection() {
        let token = "a".repeat(64);
        let ready = |url: &str| {
            serde_json::to_vec(&serde_json::json!({"type":"ready","url":url,"token":token}))
                .unwrap()
        };
        assert!(parse_ready(&ready("http://127.0.0.1:12345")).is_ok());
        for url in [
            "https://127.0.0.1:12345",
            "http://evil.test:12345",
            "http://127.0.0.1",
            "http://x@127.0.0.1:12345",
            "http://127.0.0.1:12345/api",
        ] {
            assert!(parse_ready(&ready(url)).is_err());
        }
        assert!(parse_ready(b"not json").is_err());
    }
}
