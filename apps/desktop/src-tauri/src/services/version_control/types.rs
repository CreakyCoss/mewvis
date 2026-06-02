use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionControlPathInput {
    pub workspace_path: String,
    #[serde(default)]
    pub branch_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionControlFileInput {
    pub workspace_path: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionInput {
    pub workspace_path: String,
    pub version_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionFileContentInput {
    pub workspace_path: String,
    pub version_id: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceVersionInput {
    pub workspace_path: String,
    pub message: String,
    #[serde(default)]
    pub relative_paths: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionBranchInput {
    pub workspace_path: String,
    pub branch_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreWorkspaceVersionInput {
    pub workspace_path: String,
    pub version_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionControlStatus {
    pub is_enabled: bool,
    pub provider: Option<String>,
    pub current_ref: Option<String>,
    pub head: Option<String>,
    pub branches: Vec<WorkspaceVersionBranch>,
    pub has_versions: bool,
    pub has_changes: bool,
    pub changed_file_count: usize,
    pub counts: WorkspaceVersionControlStatusCounts,
    pub files: Vec<WorkspaceVersionControlFileStatus>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionControlStatusCounts {
    pub added: usize,
    pub modified: usize,
    pub deleted: usize,
    pub renamed: usize,
    pub typechange: usize,
    pub conflicted: usize,
    pub untracked: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionControlFileStatus {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub is_staged: bool,
    pub is_worktree: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionBranch {
    pub name: String,
    pub short_head: Option<String>,
    pub is_current: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionFileDiff {
    pub path: String,
    pub patch: String,
    pub before_content: String,
    pub after_content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersion {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionFileEntry {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub name: String,
    pub size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceVersionFileContent {
    pub path: String,
    pub content: String,
    pub size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceVersionResult {
    pub version: WorkspaceVersion,
    pub status: WorkspaceVersionControlStatus,
}
