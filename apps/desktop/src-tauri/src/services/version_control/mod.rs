mod backend;
mod git;
mod types;

use std::path::{Component, PathBuf};

use backend::WorkspaceVersionControlBackend;
use git::GitVersionControlBackend;

use super::workspace_paths::workspace_root;

pub use types::{
    CreateWorkspaceVersionInput, CreateWorkspaceVersionResult, RestoreWorkspaceVersionInput,
    WorkspaceVersion, WorkspaceVersionBranchInput, WorkspaceVersionControlFileInput,
    WorkspaceVersionControlPathInput, WorkspaceVersionControlStatus, WorkspaceVersionFileContent,
    WorkspaceVersionFileContentInput, WorkspaceVersionFileDiff, WorkspaceVersionFileEntry,
    WorkspaceVersionInput,
};

fn default_backend() -> impl WorkspaceVersionControlBackend {
    GitVersionControlBackend
}

pub fn get_workspace_version_control_status(
    input: WorkspaceVersionControlPathInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().status(&root)
}

pub fn initialize_workspace_version_control(
    input: WorkspaceVersionControlPathInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().initialize(&root)
}

pub fn get_workspace_version_file_diff(
    input: WorkspaceVersionControlFileInput,
) -> Result<WorkspaceVersionFileDiff, String> {
    let root = workspace_root(&input.workspace_path)?;
    let relative_path = normalize_relative_path(&input.relative_path)?;
    default_backend().diff_file(&root, &relative_path)
}

pub fn discard_workspace_version_file_changes(
    input: WorkspaceVersionControlFileInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    let root = workspace_root(&input.workspace_path)?;
    let relative_path = normalize_relative_path(&input.relative_path)?;
    default_backend().discard_file_changes(&root, &relative_path)
}

pub fn create_workspace_version(
    input: CreateWorkspaceVersionInput,
) -> Result<CreateWorkspaceVersionResult, String> {
    let root = workspace_root(&input.workspace_path)?;
    let relative_paths = normalize_relative_paths(input.relative_paths.unwrap_or_default())?;
    default_backend().create_version(&root, &input.message, &relative_paths)
}

pub fn list_workspace_versions(
    input: WorkspaceVersionControlPathInput,
) -> Result<Vec<WorkspaceVersion>, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().list_versions(&root, input.branch_name.as_deref())
}

pub fn list_workspace_version_files(
    input: WorkspaceVersionInput,
) -> Result<Vec<WorkspaceVersionFileEntry>, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().list_version_files(&root, &input.version_id)
}

pub fn read_workspace_version_file(
    input: WorkspaceVersionFileContentInput,
) -> Result<WorkspaceVersionFileContent, String> {
    let root = workspace_root(&input.workspace_path)?;
    let relative_path = normalize_relative_path(&input.relative_path)?;
    default_backend().read_version_file(&root, &input.version_id, &relative_path)
}

pub fn get_workspace_version_commit_file_diff(
    input: WorkspaceVersionFileContentInput,
) -> Result<WorkspaceVersionFileDiff, String> {
    let root = workspace_root(&input.workspace_path)?;
    let relative_path = normalize_relative_path(&input.relative_path)?;
    default_backend().diff_version_file(&root, &input.version_id, &relative_path)
}

pub fn restore_workspace_version(
    input: RestoreWorkspaceVersionInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().restore_version(&root, &input.version_id)
}

pub fn create_workspace_version_branch(
    input: WorkspaceVersionBranchInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().create_branch(&root, &input.branch_name)
}

pub fn switch_workspace_version_branch(
    input: WorkspaceVersionBranchInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    let root = workspace_root(&input.workspace_path)?;
    default_backend().switch_branch(&root, &input.branch_name)
}

fn normalize_relative_path(path: &str) -> Result<String, String> {
    let normalized = path.trim().replace('\\', "/").trim_matches('/').to_string();
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

    Ok(normalized)
}

fn normalize_relative_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut normalized_paths = Vec::new();
    for path in paths {
        let normalized = normalize_relative_path(&path)?;
        if !normalized_paths.contains(&normalized) {
            normalized_paths.push(normalized);
        }
    }
    Ok(normalized_paths)
}
