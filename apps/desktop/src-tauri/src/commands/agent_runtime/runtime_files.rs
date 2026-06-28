use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::product_config::product_env_var;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(super) fn resolve_node_binary(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var(product_env_var("NODE")) {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    let bundled_names = if cfg!(windows) {
        vec!["node.exe"]
    } else {
        vec!["node"]
    };

    for name in bundled_names {
        if cfg!(debug_assertions) {
            let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join(format!("../agent-runtime/dist/{name}"))
                .clean();
            if dev_path.exists() {
                return Ok(dev_path);
            }
        }

        for candidate in [
            format!("_up_/agent-runtime/dist/{name}"),
            format!("agent-runtime/dist/{name}"),
            format!("dist/{name}"),
            name.to_string(),
        ] {
            let path = app
                .path()
                .resolve(&candidate, BaseDirectory::Resource)
                .map_err(|error| format!("定位 Node 运行时失败：{error}"))?;
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Ok(PathBuf::from("node"))
}

pub(super) fn resolve_agent_runtime_cli_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var(product_env_var("AGENT_RUNTIME")) {
        let path = PathBuf::from(path);
        if path.exists() {
            return Ok(path);
        }
    }

    if cfg!(debug_assertions) {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../agent-runtime/dist/cli.js")
            .clean();
        if dev_path.exists() {
            return Ok(dev_path);
        }
    }

    for candidate in [
        "_up_/agent-runtime/dist/cli.js",
        "agent-runtime/dist/cli.js",
        "dist/index.js",
        "cli.js",
        "index.js",
    ] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Agent runtime CLI 失败：{error}"))?;
        if path.exists() {
            return Ok(path);
        }
    }

    Err("未找到 Agent runtime，请先运行 pnpm --filter desktop build:agent-runtime".to_string())
}

pub(super) fn append_agent_diagnostic(app: &AppHandle, message: impl AsRef<str>) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("agent-runtime.log");
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let _ = writeln!(file, "[{timestamp}] {}", message.as_ref());
}

pub(super) fn path_for_node(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = value.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    value.to_string()
}

#[cfg(windows)]
pub(super) fn hide_subprocess_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(super) fn hide_subprocess_window(_command: &mut Command) {}

pub(super) trait CleanPath {
    fn clean(self) -> Self;
}

impl CleanPath for PathBuf {
    fn clean(self) -> Self {
        let mut cleaned = PathBuf::new();
        for component in self.components() {
            cleaned.push(component);
        }
        cleaned
    }
}
