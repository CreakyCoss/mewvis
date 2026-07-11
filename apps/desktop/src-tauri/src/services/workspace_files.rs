use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathInput {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFilePathInput {
    pub workspace_path: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteWorkspaceFileInput {
    pub workspace_path: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicWorkspaceFileWrite {
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteWorkspaceFilesAtomicInput {
    pub workspace_path: String,
    pub files: Vec<AtomicWorkspaceFileWrite>,
    #[serde(default)]
    pub delete_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtomicWorkspaceFilesResult {
    pub written_paths: Vec<String>,
    pub deleted_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileEntry {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub path: String,
    pub content: String,
    pub updated_at: Option<i64>,
}

const SKIPPED_WORKSPACE_DIRECTORY_NAMES: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "target",
    "coverage",
    "out",
    "venv",
    "__pycache__",
];

pub fn list_workspace_files(input: WorkspacePathInput) -> Result<Vec<WorkspaceFileEntry>, String> {
    let root = workspace_root(&input.workspace_path)?;
    let mut entries = Vec::new();
    collect_entries(&root, &root, &mut entries)?;
    entries.sort_by(|left, right| {
        left.path
            .to_lowercase()
            .cmp(&right.path.to_lowercase())
            .then(left.path.cmp(&right.path))
    });
    Ok(entries)
}

pub fn read_workspace_file(input: WorkspaceFilePathInput) -> Result<WorkspaceFile, String> {
    let root = workspace_root(&input.workspace_path)?;
    let path = resolve_workspace_path(&root, &input.relative_path)?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("无法定位文件：{error}"))?;
    ensure_under_root(&root, &canonical_path)?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("无法读取文件信息：{error}"))?;

    if !metadata.is_file() {
        return Err("只能读取文件".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|error| format!("无法读取文件：{error}"))?;

    Ok(WorkspaceFile {
        path: normalize_relative_path(&input.relative_path),
        content,
        updated_at: updated_at_millis(&metadata),
    })
}

pub fn write_workspace_file(input: WriteWorkspaceFileInput) -> Result<WorkspaceFile, String> {
    let root = workspace_root(&input.workspace_path)?;
    let path = resolve_workspace_path(&root, &input.relative_path)?;

    if path.exists() {
        let canonical_path = path
            .canonicalize()
            .map_err(|error| format!("无法定位文件：{error}"))?;
        ensure_under_root(&root, &canonical_path)?;
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建文件目录：{error}"))?;
        let canonical_parent = parent
            .canonicalize()
            .map_err(|error| format!("无法定位文件目录：{error}"))?;
        ensure_under_root(&root, &canonical_parent)?;
    }

    fs::write(&path, input.content).map_err(|error| format!("无法写入文件：{error}"))?;

    let metadata = path
        .metadata()
        .map_err(|error| format!("无法读取文件信息：{error}"))?;

    Ok(WorkspaceFile {
        path: normalize_relative_path(&input.relative_path),
        content: fs::read_to_string(&path).map_err(|error| format!("无法读取文件：{error}"))?,
        updated_at: updated_at_millis(&metadata),
    })
}

pub fn write_workspace_files_atomic(
    input: WriteWorkspaceFilesAtomicInput,
) -> Result<AtomicWorkspaceFilesResult, String> {
    let root = workspace_root(&input.workspace_path)?;
    if input.files.is_empty() && input.delete_paths.is_empty() {
        return Ok(AtomicWorkspaceFilesResult {
            written_paths: Vec::new(),
            deleted_paths: Vec::new(),
        });
    }

    let transaction_root = root.join(format!(".novel-claw-txn-{}", Uuid::now_v7()));
    let staged_root = transaction_root.join("staged");
    let backup_root = transaction_root.join("backup");
    fs::create_dir_all(&staged_root)
        .map_err(|error| format!("无法创建故事事务临时目录：{error}"))?;

    let result = (|| {
        let mut normalized_write_paths = Vec::new();
        let mut normalized_delete_paths = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        for file in &input.files {
            let normalized = normalize_relative_path(&file.relative_path);
            if !seen_paths.insert(normalized.clone()) {
                return Err(format!("事务包含重复文件路径：{normalized}"));
            }
            let target = resolve_workspace_path(&root, &normalized)?;
            ensure_safe_target_parent(&root, &target)?;
            let staged = staged_root.join(&normalized);
            if let Some(parent) = staged.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("无法创建临时文件目录：{error}"))?;
            }
            fs::write(&staged, &file.content)
                .map_err(|error| format!("无法写入临时文件 {normalized}：{error}"))?;
            normalized_write_paths.push(normalized);
        }

        for raw_path in &input.delete_paths {
            let normalized = normalize_relative_path(raw_path);
            if !seen_paths.insert(normalized.clone()) {
                return Err(format!("事务包含重复文件路径：{normalized}"));
            }
            let target = resolve_workspace_path(&root, &normalized)?;
            ensure_safe_target_parent(&root, &target)?;
            normalized_delete_paths.push(normalized);
        }

        for normalized in normalized_write_paths
            .iter()
            .chain(normalized_delete_paths.iter())
        {
            let target = resolve_workspace_path(&root, normalized)?;
            if target.exists() {
                let metadata = target
                    .symlink_metadata()
                    .map_err(|error| format!("无法读取待备份文件 {normalized}：{error}"))?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Err(format!("事务只能覆盖普通文件：{normalized}"));
                }
                let backup = backup_root.join(normalized);
                if let Some(parent) = backup.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("无法创建备份目录：{error}"))?;
                }
                fs::copy(&target, &backup)
                    .map_err(|error| format!("无法备份文件 {normalized}：{error}"))?;
            }
        }

        let mut applied_paths = Vec::new();
        let apply_result = (|| {
            for normalized in &normalized_write_paths {
                let target = resolve_workspace_path(&root, normalized)?;
                let staged = staged_root.join(normalized);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|error| format!("无法创建目标目录：{error}"))?;
                }
                if target.exists() {
                    fs::remove_file(&target)
                        .map_err(|error| format!("无法替换文件 {normalized}：{error}"))?;
                }
                fs::rename(&staged, &target)
                    .map_err(|error| format!("无法提交文件 {normalized}：{error}"))?;
                applied_paths.push(normalized.clone());
            }
            for normalized in &normalized_delete_paths {
                let target = resolve_workspace_path(&root, normalized)?;
                if target.exists() {
                    fs::remove_file(&target)
                        .map_err(|error| format!("无法删除文件 {normalized}：{error}"))?;
                    applied_paths.push(normalized.clone());
                }
            }
            Ok::<(), String>(())
        })();

        if let Err(error) = apply_result {
            for normalized in applied_paths.iter().rev() {
                let target = resolve_workspace_path(&root, normalized)?;
                let backup = backup_root.join(normalized);
                if target.exists() {
                    let _ = fs::remove_file(&target);
                }
                if backup.exists() {
                    if let Some(parent) = target.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = fs::copy(&backup, &target);
                }
            }
            return Err(error);
        }

        Ok(AtomicWorkspaceFilesResult {
            written_paths: normalized_write_paths,
            deleted_paths: normalized_delete_paths,
        })
    })();

    let _ = fs::remove_dir_all(&transaction_root);
    result
}

pub fn delete_workspace_file(input: WorkspaceFilePathInput) -> Result<(), String> {
    let root = workspace_root(&input.workspace_path)?;
    let path = resolve_workspace_path(&root, &input.relative_path)?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("无法定位文件：{error}"))?;
    ensure_under_root(&root, &canonical_path)?;
    let metadata = canonical_path
        .metadata()
        .map_err(|error| format!("无法读取文件信息：{error}"))?;

    if !metadata.is_file() {
        return Err("只能删除文件".to_string());
    }

    fs::remove_file(&canonical_path).map_err(|error| format!("无法删除文件：{error}"))
}

fn workspace_root(path: &str) -> Result<PathBuf, String> {
    PathBuf::from(path.trim())
        .canonicalize()
        .map_err(|error| format!("无法定位工作区目录：{error}"))
}

fn resolve_workspace_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_path(relative_path);

    if normalized.is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    let relative = PathBuf::from(&normalized);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("文件路径必须位于工作区内".to_string());
    }

    Ok(root.join(relative))
}

fn ensure_safe_target_parent(root: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        let canonical = target
            .canonicalize()
            .map_err(|error| format!("无法定位目标文件：{error}"))?;
        ensure_under_root(root, &canonical)?;
    }
    let mut parent = target.parent();
    while let Some(candidate) = parent {
        if candidate.exists() {
            let canonical = candidate
                .canonicalize()
                .map_err(|error| format!("无法定位目标目录：{error}"))?;
            return ensure_under_root(root, &canonical);
        }
        parent = candidate.parent();
    }
    Err("无法定位目标文件父目录".to_string())
}

fn collect_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<WorkspaceFileEntry>,
) -> Result<(), String> {
    let read_dir = fs::read_dir(current).map_err(|error| format!("无法读取目录：{error}"))?;

    for item in read_dir {
        let item = item.map_err(|error| format!("无法读取目录项：{error}"))?;
        let path = item.path();
        let file_name = item.file_name().to_string_lossy().to_string();
        let file_type = item
            .file_type()
            .map_err(|error| format!("无法读取文件类型：{error}"))?;

        if should_skip(&file_name, file_type.is_dir()) || file_type.is_symlink() {
            continue;
        }

        let metadata = item
            .metadata()
            .map_err(|error| format!("无法读取文件信息：{error}"))?;
        let is_directory = metadata.is_dir();
        let relative = path
            .strip_prefix(root)
            .map_err(|error| format!("无法计算相对路径：{error}"))?
            .to_string_lossy()
            .replace('\\', "/");

        entries.push(WorkspaceFileEntry {
            path: relative,
            name: file_name,
            is_directory,
            size: metadata.is_file().then_some(metadata.len()),
            updated_at: updated_at_millis(&metadata),
        });

        if is_directory {
            collect_entries(root, &path, entries)?;
        }
    }

    Ok(())
}

fn should_skip(file_name: &str, is_directory: bool) -> bool {
    file_name == "workspace.db"
        || (file_name.starts_with('.') && file_name != ".gitignore")
        || (is_directory && SKIPPED_WORKSPACE_DIRECTORY_NAMES.contains(&file_name))
}

fn normalize_relative_path(path: &str) -> String {
    path.trim().replace('\\', "/").trim_matches('/').to_string()
}

fn ensure_under_root(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("文件路径必须位于工作区内".to_string())
    }
}

fn updated_at_millis(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        delete_workspace_file, list_workspace_files, write_workspace_files_atomic,
        AtomicWorkspaceFileWrite, WorkspaceFilePathInput, WorkspacePathInput,
        WriteWorkspaceFilesAtomicInput,
    };

    struct TestWorkspace {
        path: PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos();
            let path = env::temp_dir().join(format!("novel-claw-files-{name}-{timestamp}"));
            fs::create_dir_all(&path).expect("create test workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().to_string()
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn list_workspace_files_includes_gitignore_but_skips_other_hidden_files() {
        let workspace = TestWorkspace::new("gitignore");
        fs::write(workspace.path.join(".gitignore"), "*.tmp\n").expect("write gitignore");
        fs::write(workspace.path.join(".hidden.md"), "hidden\n").expect("write hidden");
        fs::write(workspace.path.join("draft.md"), "draft\n").expect("write draft");
        fs::write(workspace.path.join("workspace.db"), "db\n").expect("write db");

        let files = list_workspace_files(WorkspacePathInput {
            workspace_path: workspace.path_string(),
        })
        .expect("list files");

        assert!(files.iter().any(|file| file.path == ".gitignore"));
        assert!(files.iter().any(|file| file.path == "draft.md"));
        assert!(!files.iter().any(|file| file.path == ".hidden.md"));
        assert!(!files.iter().any(|file| file.path == "workspace.db"));
    }

    #[test]
    fn list_workspace_files_skips_dependency_and_build_directories() {
        let workspace = TestWorkspace::new("large-dirs");
        fs::create_dir_all(workspace.path.join("node_modules/pkg")).expect("create node_modules");
        fs::create_dir_all(workspace.path.join("dist/assets")).expect("create dist");
        fs::create_dir_all(workspace.path.join("target/debug")).expect("create target");
        fs::write(workspace.path.join("node_modules/pkg/index.js"), "module\n")
            .expect("write node module");
        fs::write(workspace.path.join("dist/assets/app.js"), "build\n").expect("write dist");
        fs::write(workspace.path.join("target/debug/app"), "binary\n").expect("write target");
        fs::write(workspace.path.join("draft.md"), "draft\n").expect("write draft");

        let files = list_workspace_files(WorkspacePathInput {
            workspace_path: workspace.path_string(),
        })
        .expect("list files");

        assert!(files.iter().any(|file| file.path == "draft.md"));
        assert!(!files
            .iter()
            .any(|file| file.path.starts_with("node_modules")));
        assert!(!files.iter().any(|file| file.path.starts_with("dist")));
        assert!(!files.iter().any(|file| file.path.starts_with("target")));
    }

    #[test]
    fn atomic_write_updates_multiple_files_and_deletes_stale_file() {
        let workspace = TestWorkspace::new("atomic-write");
        fs::create_dir_all(workspace.path.join("story")).expect("create story dir");
        fs::write(workspace.path.join("story/stale.json"), "{}\n").expect("write stale file");

        let result = write_workspace_files_atomic(WriteWorkspaceFilesAtomicInput {
            workspace_path: workspace.path_string(),
            files: vec![
                AtomicWorkspaceFileWrite {
                    relative_path: "story/book.json".to_string(),
                    content: "{\"kind\":\"story-book\"}\n".to_string(),
                },
                AtomicWorkspaceFileWrite {
                    relative_path: "story/manifest.json".to_string(),
                    content: "{\"revision\":1}\n".to_string(),
                },
            ],
            delete_paths: vec!["story/stale.json".to_string()],
        })
        .expect("atomic write");

        assert_eq!(result.written_paths.len(), 2);
        assert!(workspace.path.join("story/book.json").is_file());
        assert!(workspace.path.join("story/manifest.json").is_file());
        assert!(!workspace.path.join("story/stale.json").exists());
    }

    #[test]
    fn delete_workspace_file_removes_file_inside_workspace() {
        let workspace = TestWorkspace::new("delete");
        let draft_path = workspace.path.join("draft.md");
        fs::write(&draft_path, "draft\n").expect("write draft");

        delete_workspace_file(WorkspaceFilePathInput {
            workspace_path: workspace.path_string(),
            relative_path: "draft.md".to_string(),
        })
        .expect("delete draft");

        assert!(!draft_path.exists());
        let files = list_workspace_files(WorkspacePathInput {
            workspace_path: workspace.path_string(),
        })
        .expect("list files");
        assert!(!files.iter().any(|file| file.path == "draft.md"));
    }
}
