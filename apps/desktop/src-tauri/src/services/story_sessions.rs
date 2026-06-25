use crate::services::workspace_paths::{ensure_under_root, workspace_app_data_dir, workspace_root};
use serde::Deserialize;
use serde_json::Value;
use std::{fs, path::PathBuf};

const STORY_DIR_NAME: &str = "story";
const STORY_STATE_FILE_NAME: &str = "state.json";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadStoryStateInput {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStoryStateInput {
    pub workspace_path: String,
    pub state: Value,
}

pub fn load_story_state(input: LoadStoryStateInput) -> Result<Option<Value>, String> {
    let path = story_state_path(&input.workspace_path)?;
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|error| format!("无法读取故事状态：{error}"))?;
    serde_json::from_str::<Value>(&content)
        .map(Some)
        .map_err(|error| format!("无法解析故事状态：{error}"))
}

pub fn save_story_state(input: SaveStoryStateInput) -> Result<Value, String> {
    let dir = story_dir(&input.workspace_path)?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建故事目录：{error}"))?;
    let path = dir.join(STORY_STATE_FILE_NAME);
    ensure_under_root(&dir, &path)?;

    let content = serde_json::to_string_pretty(&input.state)
        .map_err(|error| format!("无法序列化故事状态：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存故事状态：{error}"))?;
    Ok(input.state)
}

fn story_dir(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(workspace_app_data_dir(&workspace_root(workspace_path)?).join(STORY_DIR_NAME))
}

fn story_state_path(workspace_path: &str) -> Result<PathBuf, String> {
    let dir = story_dir(workspace_path)?;
    let path = dir.join(STORY_STATE_FILE_NAME);
    ensure_under_root(&dir, &path)?;
    Ok(path)
}
