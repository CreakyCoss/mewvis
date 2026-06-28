use super::runtime_files::{path_for_node, CleanPath};
use crate::services::{
    skills::{app_skills_path, bundled_skills_path},
    workspace_paths::workspace_app_data_dir,
};
use std::path::PathBuf;
use tauri::AppHandle;

pub(super) fn bundled_skills_path_for_runtime(app: &AppHandle) -> Result<Option<String>, String> {
    bundled_skills_path(app).map(|path| path.map(|path| path_for_node(&path)))
}

pub(super) fn app_skill_paths_for_runtime(app: &AppHandle) -> Result<Vec<String>, String> {
    let path = app_skills_path(app)?;
    if path.exists() && path.is_dir() {
        Ok(vec![path_for_node(&path)])
    } else {
        Ok(Vec::new())
    }
}

pub(super) fn workspace_skill_paths_for_runtime(workspace_path: &str) -> Vec<String> {
    let workspace = PathBuf::from(workspace_path);

    [
        workspace_app_data_dir(&workspace).join("skills"),
        workspace.join(".codex/skills"),
        workspace.join(".agents/skills"),
    ]
    .into_iter()
    .map(|path| path.clean())
    .filter(|path| path.exists() && path.is_dir())
    .map(|path| path_for_node(&path))
    .collect()
}
