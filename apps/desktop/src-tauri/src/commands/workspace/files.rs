use crate::services::workspace_files::{
    self, AtomicWorkspaceFilesResult, WorkspaceFile, WorkspaceFileEntry, WorkspaceFilePathInput,
    WorkspacePathInput, WriteWorkspaceFileInput, WriteWorkspaceFilesAtomicInput,
};

#[tauri::command]
pub fn list_workspace_files(input: WorkspacePathInput) -> Result<Vec<WorkspaceFileEntry>, String> {
    workspace_files::list_workspace_files(input)
}

#[tauri::command]
pub fn read_workspace_file(input: WorkspaceFilePathInput) -> Result<WorkspaceFile, String> {
    workspace_files::read_workspace_file(input)
}

#[tauri::command]
pub fn write_workspace_file(input: WriteWorkspaceFileInput) -> Result<WorkspaceFile, String> {
    workspace_files::write_workspace_file(input)
}

#[tauri::command]
pub fn write_workspace_files_atomic(
    input: WriteWorkspaceFilesAtomicInput,
) -> Result<AtomicWorkspaceFilesResult, String> {
    workspace_files::write_workspace_files_atomic(input)
}

#[tauri::command]
pub fn delete_workspace_file(input: WorkspaceFilePathInput) -> Result<(), String> {
    workspace_files::delete_workspace_file(input)
}
