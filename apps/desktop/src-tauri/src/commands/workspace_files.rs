use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathInput {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFilePathInput {
    pub workspace_path: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteWorkspaceFileInput {
    pub workspace_path: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub path: String,
    pub content: String,
    pub updated_at: Option<i64>,
}

#[tauri::command]
pub fn list_workspace_files(input: WorkspacePathInput) -> Result<Vec<WorkspaceFileEntry>, String> {
    let root = workspace_root(&input.workspace_path)?;
    let mut entries = Vec::new();
    collect_entries(&root, &root, &mut entries)?;
    entries.sort_by(|left, right| {
        left.path
            .to_lowercase()
            .cmp(&right.path.to_lowercase())
            .then(left.path.cmp(&right.path))
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_workspace_file(input: WorkspaceFilePathInput) -> Result<WorkspaceFile, String> {
    let root = workspace_root(&input.workspace_path)?;
    let path = resolve_workspace_path(&root, &input.relative_path)?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("无法定位文件：{error}"))?;
    ensure_under_root(&root, &canonical_path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("无法读取文件信息：{error}"))?;

    if !metadata.is_file() {
        return Err("只能读取文件".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|error| format!("无法读取文件：{error}"))?;

    Ok(WorkspaceFile {
        path: normalize_relative_path(&input.relative_path),
        content,
        updated_at: updated_at_millis(&metadata),
    })
}

#[tauri::command]
pub fn write_workspace_file(input: WriteWorkspaceFileInput) -> Result<WorkspaceFile, String> {
    let root = workspace_root(&input.workspace_path)?;
    let path = resolve_workspace_path(&root, &input.relative_path)?;

    if path.exists() {
        let canonical_path = path
            .canonicalize()
            .map_err(|error| format!("无法定位文件：{error}"))?;
        ensure_under_root(&root, &canonical_path)?;
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建文件目录：{error}"))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|error| format!("无法定位文件目录：{error}"))?;
        ensure_under_root(&root, &canonical_parent)?;
    }

    fs::write(&path, input.content).map_err(|error| format!("无法写入文件：{error}"))?;

    let metadata = path
        .metadata()
        .map_err(|error| format!("无法读取文件信息：{error}"))?;

    Ok(WorkspaceFile {
        path: normalize_relative_path(&input.relative_path),
        content: fs::read_to_string(&path).map_err(|error| format!("无法读取文件：{error}"))?,
        updated_at: updated_at_millis(&metadata),
    })
}

fn workspace_root(path: &str) -> Result<PathBuf, String> {
    PathBuf::from(path.trim())
        .canonicalize()
        .map_err(|error| format!("无法定位工作区目录：{error}"))
}

fn resolve_workspace_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_path(relative_path);

    if normalized.is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    let relative = PathBuf::from(&normalized);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("文件路径必须位于工作区内".to_string());
    }

    Ok(root.join(relative))
}

fn collect_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<WorkspaceFileEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(current).map_err(|error| format!("无法读取目录：{error}"))?;

    for item in read_dir {
        let item = item.map_err(|error| format!("无法读取目录项：{error}"))?;
        let path = item.path();
        let file_name = item.file_name().to_string_lossy().to_string();
        let file_type = item
            .file_type()
            .map_err(|error| format!("无法读取文件类型：{error}"))?;

        if should_skip(&file_name) || file_type.is_symlink() {
            continue;
        }

        let metadata = item
            .metadata()
            .map_err(|error| format!("无法读取文件信息：{error}"))?;
        let is_directory = metadata.is_dir();
        let relative = path
            .strip_prefix(root)
            .map_err(|error| format!("无法计算相对路径：{error}"))?
            .to_string_lossy()
            .replace('\\', "/");

        entries.push(WorkspaceFileEntry {
            path: relative,
            name: file_name,
            is_directory,
            size: metadata.is_file().then_some(metadata.len()),
            updated_at: updated_at_millis(&metadata),
        });

        if is_directory {
            collect_entries(root, &path, entries)?;
        }
    }

    Ok(())
}

fn should_skip(file_name: &str) -> bool {
    file_name == "workspace.db" || file_name.starts_with('.')
}

fn normalize_relative_path(path: &str) -> String {
    path.trim().replace('\\', "/").trim_matches('/').to_string()
}

fn ensure_under_root(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("文件路径必须位于工作区内".to_string())
    }
}

fn updated_at_millis(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
}
