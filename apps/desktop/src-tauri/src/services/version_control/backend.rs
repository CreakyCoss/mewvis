use std::path::Path;

use super::types::{
    CreateWorkspaceVersionResult, WorkspaceVersion, WorkspaceVersionControlStatus,
    WorkspaceVersionFileContent, WorkspaceVersionFileDiff, WorkspaceVersionFileEntry,
};

pub(super) trait WorkspaceVersionControlBackend {
    fn status(&self, root: &Path) -> Result<WorkspaceVersionControlStatus, String>;
    fn initialize(&self, root: &Path) -> Result<WorkspaceVersionControlStatus, String>;
    fn diff_file(
        &self,
        root: &Path,
        relative_path: &str,
    ) -> Result<WorkspaceVersionFileDiff, String>;
    fn discard_file_changes(
        &self,
        root: &Path,
        relative_path: &str,
    ) -> Result<WorkspaceVersionControlStatus, String>;
    fn create_version(
        &self,
        root: &Path,
        message: &str,
        relative_paths: &[String],
    ) -> Result<CreateWorkspaceVersionResult, String>;
    fn list_versions(
        &self,
        root: &Path,
        branch_name: Option<&str>,
    ) -> Result<Vec<WorkspaceVersion>, String>;
    fn list_version_files(
        &self,
        root: &Path,
        version_id: &str,
    ) -> Result<Vec<WorkspaceVersionFileEntry>, String>;
    fn diff_version_file(
        &self,
        root: &Path,
        version_id: &str,
        relative_path: &str,
    ) -> Result<WorkspaceVersionFileDiff, String>;
    fn read_version_file(
        &self,
        root: &Path,
        version_id: &str,
        relative_path: &str,
    ) -> Result<WorkspaceVersionFileContent, String>;
    fn restore_version(
        &self,
        root: &Path,
        version_id: &str,
    ) -> Result<WorkspaceVersionControlStatus, String>;
    fn create_branch(
        &self,
        root: &Path,
        branch_name: &str,
    ) -> Result<WorkspaceVersionControlStatus, String>;
    fn switch_branch(
        &self,
        root: &Path,
        branch_name: &str,
    ) -> Result<WorkspaceVersionControlStatus, String>;
}
