use super::bridge::{
    append_agent_diagnostic, hide_subprocess_window, path_for_node, resolve_agent_bridge_path,
    resolve_node_binary,
};
use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};
use tauri::AppHandle;

pub(super) struct AgentBridgeProcessConfig {
    pub bridge_path: PathBuf,
    pub node_binary: PathBuf,
    bridge_dir: Option<PathBuf>,
}

pub(super) fn resolve_agent_bridge_process_config(
    app: &AppHandle,
) -> Result<AgentBridgeProcessConfig, String> {
    let bridge_path = resolve_agent_bridge_path(app)?;
    let node_binary = resolve_node_binary(app)?;
    let bridge_dir = bridge_path.parent().map(PathBuf::from);

    Ok(AgentBridgeProcessConfig {
        bridge_path,
        node_binary,
        bridge_dir,
    })
}

pub(super) fn build_agent_bridge_command(
    config: &AgentBridgeProcessConfig,
    extra_env: impl IntoIterator<Item = (String, String)>,
) -> Command {
    let node_binary_arg = path_for_node(&config.node_binary);
    let bridge_path_arg = path_for_node(&config.bridge_path);

    let mut command = Command::new(&node_binary_arg);
    command
        .arg(&bridge_path_arg)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(bridge_dir) = &config.bridge_dir {
        command.env("PI_PACKAGE_DIR", path_for_node(bridge_dir));
    }
    for (key, value) in extra_env {
        command.env(key, value);
    }
    hide_subprocess_window(&mut command);

    command
}

pub(super) fn spawn_agent_bridge(
    app: &AppHandle,
    label: &str,
    extra_env: impl IntoIterator<Item = (String, String)>,
) -> Result<(Child, AgentBridgeProcessConfig), String> {
    let config = resolve_agent_bridge_process_config(app)?;
    let command = build_agent_bridge_command(&config, extra_env);
    let child = spawn_agent_bridge_command(app, command, label, &config.node_binary, label)?;

    Ok((child, config))
}

pub(super) fn spawn_agent_bridge_command(
    app: &AppHandle,
    mut command: Command,
    label: &str,
    node_binary: &Path,
    diagnostic_context: impl AsRef<str>,
) -> Result<Child, String> {
    command.spawn().map_err(|error| {
        append_agent_diagnostic(
            app,
            format!("{} spawn failed error={error}", diagnostic_context.as_ref()),
        );
        format!(
            "启动 {label} 失败：{error}。Node 路径：{}",
            node_binary.display()
        )
    })
}
