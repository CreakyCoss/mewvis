use std::path::{Component, Path, PathBuf};

use crate::services::workspace_paths::{workspace_app_data_dir, workspace_root};

fn sanitize_relative_session_root_dir(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    let mut sanitized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Normal(segment) => {
                let segment_text = segment.to_string_lossy();
                if segment_text.is_empty()
                    || segment_text == "."
                    || segment_text == ".."
                    || segment_text.contains("..")
                    || segment_text.starts_with('.')
                {
                    return Err("sessionRootDir 相对路径不合法".to_string());
                }
                sanitized.push(segment);
            }
            _ => return Err("sessionRootDir 相对路径不合法".to_string()),
        }
    }

    if sanitized.as_os_str().is_empty() {
        return Err("sessionRootDir 不能为空".to_string());
    }

    Ok(sanitized)
}

pub(super) fn resolve_session_root_dir(
    workspace_path: &str,
    session_root_dir: &str,
) -> Result<String, String> {
    resolve_optional_session_root_dir(Some(workspace_path), Some(session_root_dir))?
        .ok_or_else(|| "sessionRootDir 不能为空".to_string())
}

pub(super) fn resolve_optional_session_root_dir(
    workspace_path: Option<&str>,
    session_root_dir: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(raw_session_root_dir) = session_root_dir else {
        return Ok(None);
    };
    let trimmed = raw_session_root_dir.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let path = PathBuf::from(trimmed);
    if path.is_absolute() {
        return Ok(Some(path.to_string_lossy().to_string()));
    }

    let Some(workspace_path) = workspace_path else {
        return Err("相对 sessionRootDir 需要 workspacePath".to_string());
    };
    let workspace = workspace_root(workspace_path)?;
    let app_data_dir = workspace_app_data_dir(&workspace);
    Ok(Some(
        app_data_dir
            .join(sanitize_relative_session_root_dir(trimmed)?)
            .to_string_lossy()
            .to_string(),
    ))
}
