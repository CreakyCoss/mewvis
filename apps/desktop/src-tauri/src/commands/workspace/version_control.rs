use crate::services::version_control::{
    self, CreateWorkspaceVersionInput, CreateWorkspaceVersionResult, RestoreWorkspaceVersionInput,
    WorkspaceVersion, WorkspaceVersionBranchInput, WorkspaceVersionControlFileInput,
    WorkspaceVersionControlPathInput, WorkspaceVersionControlStatus, WorkspaceVersionFileContent,
    WorkspaceVersionFileContentInput, WorkspaceVersionFileDiff, WorkspaceVersionFileEntry,
    WorkspaceVersionInput,
};

#[tauri::command]
pub fn get_workspace_version_control_status(
    input: WorkspaceVersionControlPathInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    version_control::get_workspace_version_control_status(input)
}

#[tauri::command]
pub fn initialize_workspace_version_control(
    input: WorkspaceVersionControlPathInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    version_control::initialize_workspace_version_control(input)
}

#[tauri::command]
pub fn get_workspace_version_file_diff(
    input: WorkspaceVersionControlFileInput,
) -> Result<WorkspaceVersionFileDiff, String> {
    version_control::get_workspace_version_file_diff(input)
}

#[tauri::command]
pub fn discard_workspace_version_file_changes(
    input: WorkspaceVersionControlFileInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    version_control::discard_workspace_version_file_changes(input)
}

#[tauri::command]
pub fn create_workspace_version(
    input: CreateWorkspaceVersionInput,
) -> Result<CreateWorkspaceVersionResult, String> {
    version_control::create_workspace_version(input)
}

#[tauri::command]
pub fn list_workspace_versions(
    input: WorkspaceVersionControlPathInput,
) -> Result<Vec<WorkspaceVersion>, String> {
    version_control::list_workspace_versions(input)
}

#[tauri::command]
pub fn list_workspace_version_files(
    input: WorkspaceVersionInput,
) -> Result<Vec<WorkspaceVersionFileEntry>, String> {
    version_control::list_workspace_version_files(input)
}

#[tauri::command]
pub fn read_workspace_version_file(
    input: WorkspaceVersionFileContentInput,
) -> Result<WorkspaceVersionFileContent, String> {
    version_control::read_workspace_version_file(input)
}

#[tauri::command]
pub fn get_workspace_version_commit_file_diff(
    input: WorkspaceVersionFileContentInput,
) -> Result<WorkspaceVersionFileDiff, String> {
    version_control::get_workspace_version_commit_file_diff(input)
}

#[tauri::command]
pub fn restore_workspace_version(
    input: RestoreWorkspaceVersionInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    version_control::restore_workspace_version(input)
}

#[tauri::command]
pub fn create_workspace_version_branch(
    input: WorkspaceVersionBranchInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    version_control::create_workspace_version_branch(input)
}

#[tauri::command]
pub fn switch_workspace_version_branch(
    input: WorkspaceVersionBranchInput,
) -> Result<WorkspaceVersionControlStatus, String> {
    version_control::switch_workspace_version_branch(input)
}
