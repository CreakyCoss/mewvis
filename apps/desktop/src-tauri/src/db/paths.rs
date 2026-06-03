use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

use crate::product_config::{app_data_dir_name, default_workspace_dir_name};

pub fn config_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("config.db"))
}

pub fn default_workspace_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(default_workspace_dir_name()))
}

pub fn rag_index_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("rag").join("index.sqlite"))
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    app_data_dir_from_home(home_dir)
}

pub fn default_config_db_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    Ok(app_data_dir_from_home(home_dir)?.join("config.db"))
}

fn app_data_dir_from_home(home_dir: PathBuf) -> Result<PathBuf, String> {
    let config_dir = home_dir.join(app_data_dir_name());
    fs::create_dir_all(&config_dir).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(config_dir)
}
