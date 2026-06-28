use super::runtime_files::{
    append_agent_diagnostic, hide_subprocess_window, path_for_node, resolve_agent_runtime_cli_path,
    resolve_node_binary,
};
use crate::product_config::product_env_var;
use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};
use tauri::AppHandle;

pub(super) struct AgentRuntimeProcessConfig {
    pub runtime_cli_path: PathBuf,
    pub node_binary: PathBuf,
    runtime_dir: Option<PathBuf>,
}

pub(super) fn resolve_agent_runtime_process_config(
    app: &AppHandle,
) -> Result<AgentRuntimeProcessConfig, String> {
    let runtime_cli_path = resolve_agent_runtime_cli_path(app)?;
    let node_binary = resolve_node_binary(app)?;
    let runtime_dir = runtime_cli_path.parent().map(PathBuf::from);

    Ok(AgentRuntimeProcessConfig {
        runtime_cli_path,
        node_binary,
        runtime_dir,
    })
}

pub(super) fn build_agent_runtime_command(
    config: &AgentRuntimeProcessConfig,
    extra_env: impl IntoIterator<Item = (String, String)>,
) -> Command {
    let node_binary_arg = path_for_node(&config.node_binary);
    let runtime_cli_path_arg = path_for_node(&config.runtime_cli_path);

    let mut command = Command::new(&node_binary_arg);
    command
        .arg(&runtime_cli_path_arg)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(runtime_dir) = &config.runtime_dir {
        command.env("PI_PACKAGE_DIR", path_for_node(runtime_dir));
    }
    for (key, value) in extra_env.into_iter().chain(product_agent_runtime_env()) {
        command.env(key, value);
    }
    hide_subprocess_window(&mut command);

    command
}

pub(super) fn agent_runtime_settings_env(app: &AppHandle) -> Vec<(String, String)> {
    match crate::db::config_db::agent_runtime_settings(app) {
        Ok(settings) => settings
            .default_collaboration_executor_id
            .map(|executor_id| {
                (
                    "AGENT_RUNTIME_DEFAULT_COLLABORATION_EXECUTOR".to_string(),
                    executor_id,
                )
            })
            .into_iter()
            .collect(),
        Err(error) => {
            append_agent_diagnostic(
                app,
                format!("agent runtime settings unavailable error={error}"),
            );
            Vec::new()
        }
    }
}

fn product_agent_runtime_env() -> Vec<(String, String)> {
    [
        (
            product_env_var("AGENT_RUNTIME_DEFAULT_COLLABORATION_EXECUTOR"),
            "AGENT_RUNTIME_DEFAULT_COLLABORATION_EXECUTOR".to_string(),
        ),
        (
            product_env_var("AGENT_RUNTIME_COLLABORATION_EXECUTOR"),
            "AGENT_RUNTIME_COLLABORATION_EXECUTOR".to_string(),
        ),
    ]
    .into_iter()
    .filter_map(|(source, target)| {
        std::env::var(source)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(|value| (target, value))
    })
    .collect()
}

pub(super) fn spawn_agent_runtime(
    app: &AppHandle,
    label: &str,
    extra_env: impl IntoIterator<Item = (String, String)>,
) -> Result<(Child, AgentRuntimeProcessConfig), String> {
    let config = resolve_agent_runtime_process_config(app)?;
    let mut command_env = agent_runtime_settings_env(app);
    command_env.extend(extra_env);
    let command = build_agent_runtime_command(&config, command_env);
    let child = spawn_agent_runtime_command(app, command, label, &config.node_binary, label)?;

    Ok((child, config))
}

pub(super) fn spawn_agent_runtime_command(
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
