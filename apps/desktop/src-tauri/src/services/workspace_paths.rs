use std::path::{Path, PathBuf};

use crate::product_config::app_data_dir_name;

pub(crate) fn workspace_root(path: &str) -> Result<PathBuf, String> {
    PathBuf::from(path.trim())
        .canonicalize()
        .map_err(|error| format!("无法定位工作区目录：{error}"))
}

pub(crate) fn workspace_app_data_dir(root: &Path) -> PathBuf {
    root.join(app_data_dir_name())
}

pub(crate) fn display_workspace_relative(
    workspace_path: &str,
    path: &Path,
) -> Result<String, String> {
    let root = workspace_root(workspace_path)?;
    Ok(path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string())
}

pub(crate) fn ensure_under_root(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("工作区数据路径必须位于工作区内".to_string())
    }
}

pub(crate) fn sanitize_session_id(session_id: &str) -> Result<String, String> {
    let id = session_id.trim().trim_end_matches(".json");
    if id.is_empty()
        || id.contains('/')
        || id.contains('\\')
        || id.contains("..")
        || id.starts_with('.')
    {
        return Err("聊天记录 ID 不合法".to_string());
    }
    Ok(id.to_string())
}
