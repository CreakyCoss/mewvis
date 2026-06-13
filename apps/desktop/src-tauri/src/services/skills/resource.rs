use std::{fs, path::PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::product_config::app_data_dir_name;

pub(crate) fn bundled_skills_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../resources/skills")
        .clean();
    if dev_path.exists() {
        return Ok(Some(dev_path));
    }

    for candidate in ["_up_/resources/skills", "resources/skills", "skills"] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Skills 资源失败：{error}"))?;
        if path.exists() {
            return Ok(Some(path));
        }
    }

    Ok(None)
}

pub(crate) fn app_skills_path(app: &AppHandle) -> Result<PathBuf, String> {
    let home_dir = app
        .path()
        .home_dir()
        .map_err(|error| format!("无法获取用户主目录：{error}"))?;
    Ok(home_dir.join(app_data_dir_name()).join("skills").clean())
}

pub(crate) fn ensure_app_skills_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app_skills_path(app)?;
    fs::create_dir_all(&path).map_err(|error| format!("无法创建应用 Skills 目录：{error}"))?;
    Ok(path)
}

trait CleanPath {
    fn clean(self) -> Self;
}

impl CleanPath for PathBuf {
    fn clean(self) -> Self {
        let mut cleaned = PathBuf::new();
        for component in self.components() {
            cleaned.push(component);
        }
        cleaned
    }
}
