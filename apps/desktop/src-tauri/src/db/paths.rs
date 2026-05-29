use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

pub fn config_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    config_db_path_from_home(home_dir)
}

pub fn default_config_db_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    config_db_path_from_home(home_dir)
}

fn config_db_path_from_home(home_dir: PathBuf) -> Result<PathBuf, String> {
    let config_dir = home_dir.join(".novel-claw");
    fs::create_dir_all(&config_dir).map_err(|error| format!("无法创建配置目录：{error}"))?;
    Ok(config_dir.join("config.db"))
}
