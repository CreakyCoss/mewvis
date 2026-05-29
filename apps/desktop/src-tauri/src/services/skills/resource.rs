use std::path::PathBuf;
use tauri::{path::BaseDirectory, AppHandle, Manager};

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
