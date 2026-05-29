use super::bridge::{path_for_node, CleanPath};
use crate::services::skills::bundled_skills_path;
use std::path::PathBuf;
use tauri::AppHandle;

pub(super) fn bundled_skills_path_for_bridge(app: &AppHandle) -> Result<Option<String>, String> {
    bundled_skills_path(app).map(|path| path.map(|path| path_for_node(&path)))
}

pub(super) fn workspace_skill_paths_for_bridge(workspace_path: &str) -> Vec<String> {
    let workspace = PathBuf::from(workspace_path);

    [".novel-claw/skills", ".codex/skills", ".agents/skills"]
        .into_iter()
        .map(|path| workspace.join(path).clean())
        .filter(|path| path.exists() && path.is_dir())
        .map(|path| path_for_node(&path))
        .collect()
}
