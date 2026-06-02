use git2::{
    BranchType, Delta, DiffDelta, DiffFindOptions, DiffFormat, DiffOptions, ErrorCode, Index,
    ObjectType, Oid, Reference, Repository, RepositoryOpenFlags, Signature, Sort, Status,
    StatusEntry, StatusOptions,
};
use std::{ffi::OsStr, fs, path::Path};

use crate::product_config::{
    app_data_dir_name, version_control_author_email, version_control_author_name,
};

use super::{
    backend::WorkspaceVersionControlBackend,
    types::{
        CreateWorkspaceVersionResult, WorkspaceVersion, WorkspaceVersionBranch,
        WorkspaceVersionControlFileStatus, WorkspaceVersionControlStatus,
        WorkspaceVersionControlStatusCounts, WorkspaceVersionFileContent, WorkspaceVersionFileDiff,
        WorkspaceVersionFileEntry,
    },
};

const DEFAULT_HISTORY_LIMIT: usize = 30;
const GIT_PROVIDER_ID: &str = "git";

pub(super) struct GitVersionControlBackend;

impl WorkspaceVersionControlBackend for GitVersionControlBackend {
    fn status(&self, root: &Path) -> Result<WorkspaceVersionControlStatus, String> {
        let Ok(repo) = open_git_repository(root) else {
            return Ok(empty_version_control_status());
        };

        ensure_git_ignore_rules(root)?;
        read_git_status(&repo)
    }

    fn initialize(&self, root: &Path) -> Result<WorkspaceVersionControlStatus, String> {
        let repo = match open_git_repository(root) {
            Ok(repo) => repo,
            Err(_) => {
                Repository::init(root).map_err(|error| format!("无法初始化 Git 仓库：{error}"))?
            }
        };

        ensure_git_ignore_rules(root)?;
        read_git_status(&repo)
    }

    fn diff_file(
        &self,
        root: &Path,
        relative_path: &str,
    ) -> Result<WorkspaceVersionFileDiff, String> {
        let repo = open_git_repository(root)?;

        let mut options = DiffOptions::new();
        options
            .pathspec(relative_path)
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);

        let head_tree = head_tree(&repo)?;
        let diff = repo
            .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut options))
            .map_err(|error| format!("无法读取文件差异：{error}"))?;

        let mut patch = String::new();
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            match line.origin() {
                '+' | '-' | ' ' => patch.push(line.origin()),
                _ => {}
            }
            patch.push_str(&String::from_utf8_lossy(line.content()));
            true
        })
        .map_err(|error| format!("无法生成文件差异：{error}"))?;

        Ok(WorkspaceVersionFileDiff {
            path: relative_path.to_string(),
            patch,
            before_content: read_head_file_content(&repo, relative_path)?,
            after_content: read_worktree_file_content(root, relative_path)?,
        })
    }

    fn discard_file_changes(
        &self,
        root: &Path,
        relative_path: &str,
    ) -> Result<WorkspaceVersionControlStatus, String> {
        let repo = open_git_repository(root)?;
        let status_file = read_status_files(&repo)?
            .into_iter()
            .find(|file| {
                file.path == relative_path || file.previous_path.as_deref() == Some(relative_path)
            })
            .ok_or_else(|| "该文件没有可撤销的修改".to_string())?;

        let mut index = repo
            .index()
            .map_err(|error| format!("无法读取版本索引：{error}"))?;
        reset_index_to_head(&repo, &mut index)?;
        index
            .write()
            .map_err(|error| format!("无法写入版本索引：{error}"))?;

        if let Some(previous_path) = status_file.previous_path.as_deref() {
            remove_worktree_path(root, &status_file.path)?;
            checkout_head_path(&repo, previous_path)?;
        } else if head_has_path(&repo, &status_file.path)? {
            checkout_head_path(&repo, &status_file.path)?;
        } else {
            remove_worktree_path(root, &status_file.path)?;
        }

        read_git_status(&repo)
    }

    fn create_version(
        &self,
        root: &Path,
        message: &str,
        relative_paths: &[String],
    ) -> Result<CreateWorkspaceVersionResult, String> {
        let repo = open_git_repository(root)?;
        let message = message.trim();
        if message.is_empty() {
            return Err("提交说明不能为空".to_string());
        }

        ensure_git_ignore_rules(root)?;

        let tree_id = stage_paths_for_commit(&repo, root, relative_paths)?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|error| format!("无法读取版本文件树：{error}"))?;

        let parents = head_commit(&repo)?;
        if parents
            .first()
            .is_some_and(|parent| parent.tree_id() == tree_id)
        {
            return Err("没有可提交的文件变更".to_string());
        }
        let parent_refs = parents.iter().collect::<Vec<_>>();
        let signature = repository_signature(&repo)?;
        let oid = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &parent_refs,
            )
            .map_err(|error| format!("无法提交变更：{error}"))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|error| format!("无法读取新提交：{error}"))?;

        Ok(CreateWorkspaceVersionResult {
            version: serialize_version(&commit),
            status: read_git_status(&repo)?,
        })
    }

    fn list_versions(
        &self,
        root: &Path,
        branch_name: Option<&str>,
    ) -> Result<Vec<WorkspaceVersion>, String> {
        let repo = open_git_repository(root)?;
        if repo
            .is_empty()
            .map_err(|error| format!("无法读取版本历史：{error}"))?
        {
            return Ok(Vec::new());
        }

        let mut revwalk = repo
            .revwalk()
            .map_err(|error| format!("无法读取版本历史：{error}"))?;

        if let Some(branch_name) = branch_name.map(str::trim).filter(|name| !name.is_empty()) {
            let branch_name = normalize_branch_name(branch_name)?;
            let branch = repo
                .find_branch(&branch_name, BranchType::Local)
                .map_err(|error| format!("无法找到分支：{error}"))?;
            let target = branch
                .get()
                .peel_to_commit()
                .map_err(|error| format!("无法读取分支历史：{error}"))?;
            revwalk
                .push(target.id())
                .map_err(|error| format!("无法读取分支历史：{error}"))?;
        } else if let Err(error) = revwalk.push_head() {
            if is_unborn_or_missing_head(&error) {
                return Ok(Vec::new());
            }
            return Err(format!("无法读取版本历史：{error}"));
        }
        let _ = revwalk.set_sorting(Sort::TIME);

        let mut versions = Vec::new();
        for oid_result in revwalk.take(DEFAULT_HISTORY_LIMIT) {
            let oid = oid_result.map_err(|error| format!("无法读取版本历史：{error}"))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|error| format!("无法读取版本：{error}"))?;
            versions.push(serialize_version(&commit));
        }

        Ok(versions)
    }

    fn list_version_files(
        &self,
        root: &Path,
        version_id: &str,
    ) -> Result<Vec<WorkspaceVersionFileEntry>, String> {
        let repo = open_git_repository(root)?;
        let commit = version_commit(&repo, version_id)?;
        let commit_tree = commit
            .tree()
            .map_err(|error| format!("无法读取版本文件树：{error}"))?;
        let parent_tree = commit_parent_tree(&commit)?;
        let mut files = Vec::new();

        let mut diff = repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), None)
            .map_err(|error| format!("无法读取提交文件变更：{error}"))?;
        find_similar_files(&mut diff);

        for delta in diff.deltas() {
            let Some(path) = diff_delta_display_path(&delta) else {
                continue;
            };
            let previous_path = diff_delta_previous_path(&delta, &path);
            let status = diff_delta_status_kind(delta.status()).to_string();
            let file = if delta.status() == Delta::Deleted {
                delta.old_file()
            } else {
                delta.new_file()
            };
            let size = repo
                .find_blob(file.id())
                .map(|blob| blob.size())
                .unwrap_or(0);

            files.push(WorkspaceVersionFileEntry {
                name: Path::new(&path)
                    .file_name()
                    .map(|value| value.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.clone()),
                previous_path,
                status,
                path,
                size,
            });
        }

        files.sort_by(|left, right| {
            left.path
                .to_lowercase()
                .cmp(&right.path.to_lowercase())
                .then(left.path.cmp(&right.path))
        });

        Ok(files)
    }

    fn diff_version_file(
        &self,
        root: &Path,
        version_id: &str,
        relative_path: &str,
    ) -> Result<WorkspaceVersionFileDiff, String> {
        let repo = open_git_repository(root)?;
        let commit = version_commit(&repo, version_id)?;
        let commit_tree = commit
            .tree()
            .map_err(|error| format!("无法读取版本文件树：{error}"))?;
        let parent_tree = commit_parent_tree(&commit)?;

        let mut options = DiffOptions::new();
        options.pathspec(relative_path);
        let mut diff = repo
            .diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut options))
            .map_err(|error| format!("无法读取提交文件差异：{error}"))?;
        find_similar_files(&mut diff);

        let mut before_path = relative_path.to_string();
        let mut after_path = relative_path.to_string();
        for delta in diff.deltas() {
            if diff_delta_matches_path(&delta, relative_path) {
                if let Some(path) = delta.old_file().path() {
                    before_path = path_to_display_string(path);
                }
                if let Some(path) = delta.new_file().path() {
                    after_path = path_to_display_string(path);
                }
                break;
            }
        }

        let mut patch = String::new();
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            match line.origin() {
                '+' | '-' | ' ' => patch.push(line.origin()),
                _ => {}
            }
            patch.push_str(&String::from_utf8_lossy(line.content()));
            true
        })
        .map_err(|error| format!("无法生成提交文件差异：{error}"))?;

        Ok(WorkspaceVersionFileDiff {
            path: relative_path.to_string(),
            patch,
            before_content: read_tree_file_content(&repo, parent_tree.as_ref(), &before_path)?,
            after_content: read_tree_file_content(&repo, Some(&commit_tree), &after_path)?,
        })
    }

    fn read_version_file(
        &self,
        root: &Path,
        version_id: &str,
        relative_path: &str,
    ) -> Result<WorkspaceVersionFileContent, String> {
        let repo = open_git_repository(root)?;
        let commit = version_commit(&repo, version_id)?;
        let tree = commit
            .tree()
            .map_err(|error| format!("无法读取版本文件树：{error}"))?;
        let entry = tree
            .get_path(Path::new(relative_path))
            .map_err(|error| format!("无法在版本中找到文件：{error}"))?;
        if entry.kind() != Some(ObjectType::Blob) {
            return Err("只能预览版本中的文件内容".to_string());
        }
        let blob = repo
            .find_blob(entry.id())
            .map_err(|error| format!("无法读取版本文件内容：{error}"))?;

        Ok(WorkspaceVersionFileContent {
            path: relative_path.to_string(),
            content: String::from_utf8_lossy(blob.content()).to_string(),
            size: blob.size(),
        })
    }

    fn restore_version(
        &self,
        root: &Path,
        version_id: &str,
    ) -> Result<WorkspaceVersionControlStatus, String> {
        let repo = open_git_repository(root)?;
        let version_id = version_id.trim();
        if version_id.is_empty() {
            return Err("版本 ID 不能为空".to_string());
        }

        let commit = version_commit(&repo, version_id)?;
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        repo.checkout_tree(commit.as_object(), Some(&mut checkout))
            .map_err(|error| format!("无法恢复工作区文件：{error}"))?;

        read_git_status(&repo)
    }

    fn create_branch(
        &self,
        root: &Path,
        branch_name: &str,
    ) -> Result<WorkspaceVersionControlStatus, String> {
        let repo = open_git_repository(root)?;
        let branch_name = normalize_branch_name(branch_name)?;
        if repo.find_branch(&branch_name, BranchType::Local).is_ok() {
            return Err("分支已存在".to_string());
        }

        let commit = head_commit(&repo)?
            .into_iter()
            .next()
            .ok_or_else(|| "请先提交一次，再创建分支".to_string())?;
        repo.branch(&branch_name, &commit, false)
            .map_err(|error| format!("无法创建分支：{error}"))?;
        repo.set_head(&branch_ref_name(&branch_name))
            .map_err(|error| format!("无法切换到新分支：{error}"))?;

        read_git_status(&repo)
    }

    fn switch_branch(
        &self,
        root: &Path,
        branch_name: &str,
    ) -> Result<WorkspaceVersionControlStatus, String> {
        let repo = open_git_repository(root)?;
        let branch_name = normalize_branch_name(branch_name)?;
        if repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().ok().map(ToString::to_string))
            .as_deref()
            == Some(branch_name.as_str())
        {
            return read_git_status(&repo);
        }

        let dirty_files = read_status_files(&repo)?;
        if !dirty_files.is_empty() {
            return Err("切换分支前请先提交或清理当前变更".to_string());
        }

        let branch = repo
            .find_branch(&branch_name, BranchType::Local)
            .map_err(|error| format!("无法找到分支：{error}"))?;
        let target = branch
            .get()
            .peel_to_commit()
            .map_err(|error| format!("无法读取目标分支：{error}"))?;
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force();
        repo.checkout_tree(target.as_object(), Some(&mut checkout))
            .map_err(|error| format!("无法更新工作区文件：{error}"))?;
        repo.set_head(&branch_ref_name(&branch_name))
            .map_err(|error| format!("无法切换分支：{error}"))?;

        read_git_status(&repo)
    }
}

fn empty_version_control_status() -> WorkspaceVersionControlStatus {
    WorkspaceVersionControlStatus {
        is_enabled: false,
        provider: None,
        current_ref: None,
        head: None,
        branches: Vec::new(),
        has_versions: false,
        has_changes: false,
        changed_file_count: 0,
        counts: WorkspaceVersionControlStatusCounts::default(),
        files: Vec::new(),
    }
}

fn open_git_repository(root: &Path) -> Result<Repository, String> {
    Repository::open_ext(
        root,
        RepositoryOpenFlags::NO_SEARCH,
        std::iter::empty::<&OsStr>(),
    )
    .map_err(|error| format!("工作区还不是 Git 仓库：{error}"))
}

fn read_git_status(repo: &Repository) -> Result<WorkspaceVersionControlStatus, String> {
    let files = read_status_files(repo)?;
    let mut counts = WorkspaceVersionControlStatusCounts::default();
    for file in &files {
        match file.status.as_str() {
            "added" => counts.added += 1,
            "modified" => counts.modified += 1,
            "deleted" => counts.deleted += 1,
            "renamed" => counts.renamed += 1,
            "typechange" => counts.typechange += 1,
            "conflicted" => counts.conflicted += 1,
            "untracked" => counts.untracked += 1,
            _ => {}
        }
    }

    let (current_ref, head, has_versions) = read_head_summary(repo);
    let branches = list_local_branches(repo)?;
    Ok(WorkspaceVersionControlStatus {
        is_enabled: true,
        provider: Some(GIT_PROVIDER_ID.to_string()),
        current_ref,
        head,
        branches,
        has_versions,
        has_changes: !files.is_empty(),
        changed_file_count: files.len(),
        counts,
        files,
    })
}

fn read_status_files(repo: &Repository) -> Result<Vec<WorkspaceVersionControlFileStatus>, String> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let entries = repo
        .statuses(Some(&mut options))
        .map_err(|error| format!("无法读取版本状态：{error}"))?;
    let mut files = entries
        .iter()
        .filter_map(serialize_status_entry)
        .collect::<Vec<_>>();
    files.sort_by(|left, right| {
        left.path
            .to_lowercase()
            .cmp(&right.path.to_lowercase())
            .then(left.path.cmp(&right.path))
    });

    Ok(files)
}

fn stage_paths_for_commit(
    repo: &Repository,
    root: &Path,
    relative_paths: &[String],
) -> Result<Oid, String> {
    let status_files = read_status_files(repo)?;
    let mut index = repo
        .index()
        .map_err(|error| format!("无法读取版本索引：{error}"))?;
    reset_index_to_head(repo, &mut index)?;

    if relative_paths.is_empty() {
        for file in &status_files {
            stage_status_file(&mut index, root, file)?;
        }
    } else {
        for relative_path in relative_paths {
            let status_file = status_files.iter().find(|file| file.path == *relative_path);
            if let Some(file) = status_file {
                stage_status_file(&mut index, root, file)?;
            } else {
                stage_worktree_path(&mut index, root, relative_path)?;
            }
        }
    }

    index
        .write()
        .map_err(|error| format!("无法写入版本索引：{error}"))?;
    index
        .write_tree()
        .map_err(|error| format!("无法创建提交文件树：{error}"))
}

fn reset_index_to_head(repo: &Repository, index: &mut Index) -> Result<(), String> {
    if let Some(tree) = head_tree(repo)? {
        index
            .read_tree(&tree)
            .map_err(|error| format!("无法重建版本索引：{error}"))?;
    } else {
        index
            .clear()
            .map_err(|error| format!("无法清空版本索引：{error}"))?;
    }

    Ok(())
}

fn head_has_path(repo: &Repository, relative_path: &str) -> Result<bool, String> {
    let Some(tree) = head_tree(repo)? else {
        return Ok(false);
    };

    match tree.get_path(Path::new(relative_path)) {
        Ok(_) => Ok(true),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(false),
        Err(error) => Err(format!("无法读取版本文件：{error}")),
    }
}

fn checkout_head_path(repo: &Repository, relative_path: &str) -> Result<(), String> {
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force().path(relative_path);
    repo.checkout_head(Some(&mut checkout))
        .map_err(|error| format!("无法撤销文件修改 {relative_path}：{error}"))
}

fn remove_worktree_path(root: &Path, relative_path: &str) -> Result<(), String> {
    let path = root.join(relative_path);
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(&path)
            .map_err(|error| format!("无法删除未提交目录 {relative_path}：{error}"))
    } else {
        fs::remove_file(&path)
            .map_err(|error| format!("无法删除未提交文件 {relative_path}：{error}"))
    }
}

fn stage_status_file(
    index: &mut Index,
    root: &Path,
    file: &WorkspaceVersionControlFileStatus,
) -> Result<(), String> {
    if let Some(previous_path) = file.previous_path.as_deref() {
        remove_index_path(index, previous_path)?;
    }
    stage_worktree_path(index, root, &file.path)
}

fn stage_worktree_path(index: &mut Index, root: &Path, relative_path: &str) -> Result<(), String> {
    let path = Path::new(relative_path);
    if root.join(path).exists() {
        index
            .add_path(path)
            .map_err(|error| format!("无法加入文件 {relative_path}：{error}"))
    } else {
        remove_index_path(index, relative_path)
    }
}

fn remove_index_path(index: &mut Index, relative_path: &str) -> Result<(), String> {
    index
        .remove_path(Path::new(relative_path))
        .or_else(|error| {
            if error.code() == ErrorCode::NotFound {
                Ok(())
            } else {
                Err(error)
            }
        })
        .map_err(|error| format!("无法从版本中移除文件 {relative_path}：{error}"))
}

fn read_head_file_content(repo: &Repository, relative_path: &str) -> Result<String, String> {
    let Some(tree) = head_tree(repo)? else {
        return Ok(String::new());
    };

    read_tree_file_content(repo, Some(&tree), relative_path)
}

fn read_tree_file_content(
    repo: &Repository,
    tree: Option<&git2::Tree<'_>>,
    relative_path: &str,
) -> Result<String, String> {
    let Some(tree) = tree else {
        return Ok(String::new());
    };

    let entry = match tree.get_path(Path::new(relative_path)) {
        Ok(entry) => entry,
        Err(error) if error.code() == ErrorCode::NotFound => return Ok(String::new()),
        Err(error) => return Err(format!("无法读取版本文件内容：{error}")),
    };
    let object = entry
        .to_object(repo)
        .map_err(|error| format!("无法读取版本文件对象：{error}"))?;
    let Some(blob) = object.as_blob() else {
        return Ok(String::new());
    };

    Ok(String::from_utf8_lossy(blob.content()).into_owned())
}

fn read_worktree_file_content(root: &Path, relative_path: &str) -> Result<String, String> {
    let path = root.join(relative_path);
    if !path.is_file() {
        return Ok(String::new());
    }

    fs::read(&path)
        .map(|content| String::from_utf8_lossy(&content).into_owned())
        .map_err(|error| format!("无法读取当前文件内容：{error}"))
}

fn commit_parent_tree<'repo>(
    commit: &git2::Commit<'repo>,
) -> Result<Option<git2::Tree<'repo>>, String> {
    if commit.parent_count() == 0 {
        return Ok(None);
    }

    let parent = commit
        .parent(0)
        .map_err(|error| format!("无法读取父提交：{error}"))?;
    parent
        .tree()
        .map(Some)
        .map_err(|error| format!("无法读取父提交文件树：{error}"))
}

fn find_similar_files(diff: &mut git2::Diff<'_>) {
    let mut options = DiffFindOptions::new();
    let _ = diff.find_similar(Some(&mut options));
}

fn diff_delta_display_path(delta: &DiffDelta<'_>) -> Option<String> {
    let file = if delta.status() == Delta::Deleted {
        delta.old_file()
    } else {
        delta.new_file()
    };

    file.path()
        .or_else(|| delta.old_file().path())
        .map(path_to_display_string)
}

fn diff_delta_previous_path(delta: &DiffDelta<'_>, path: &str) -> Option<String> {
    delta
        .old_file()
        .path()
        .map(path_to_display_string)
        .filter(|previous_path| previous_path != path)
}

fn diff_delta_matches_path(delta: &DiffDelta<'_>, relative_path: &str) -> bool {
    delta
        .new_file()
        .path()
        .map(path_to_display_string)
        .as_deref()
        == Some(relative_path)
        || delta
            .old_file()
            .path()
            .map(path_to_display_string)
            .as_deref()
            == Some(relative_path)
}

fn diff_delta_status_kind(status: Delta) -> &'static str {
    match status {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Renamed => "renamed",
        Delta::Typechange => "typechange",
        Delta::Conflicted => "conflicted",
        _ => "modified",
    }
}

fn serialize_status_entry(entry: StatusEntry<'_>) -> Option<WorkspaceVersionControlFileStatus> {
    let status = entry.status();
    if status.is_empty() || status.is_ignored() {
        return None;
    }

    let path = status_entry_path(&entry)?;
    let previous_path = status_entry_previous_path(&entry, &path);
    let kind = status_kind(status).to_string();
    Some(WorkspaceVersionControlFileStatus {
        path,
        previous_path,
        status: kind,
        is_staged: has_index_status(status),
        is_worktree: has_worktree_status(status),
    })
}

fn status_entry_path(entry: &StatusEntry<'_>) -> Option<String> {
    entry
        .head_to_index()
        .and_then(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
        .or_else(|| {
            entry
                .index_to_workdir()
                .and_then(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
        })
        .map(path_to_display_string)
}

fn status_entry_previous_path(entry: &StatusEntry<'_>, path: &str) -> Option<String> {
    entry
        .head_to_index()
        .and_then(|delta| delta.old_file().path())
        .or_else(|| {
            entry
                .index_to_workdir()
                .and_then(|delta| delta.old_file().path())
        })
        .map(path_to_display_string)
        .filter(|previous_path| previous_path != path)
}

fn status_kind(status: Status) -> &'static str {
    if status.contains(Status::CONFLICTED) {
        "conflicted"
    } else if status.contains(Status::INDEX_RENAMED) || status.contains(Status::WT_RENAMED) {
        "renamed"
    } else if status.contains(Status::INDEX_TYPECHANGE) || status.contains(Status::WT_TYPECHANGE) {
        "typechange"
    } else if status.contains(Status::INDEX_DELETED) || status.contains(Status::WT_DELETED) {
        "deleted"
    } else if status.contains(Status::INDEX_NEW) {
        "added"
    } else if status.contains(Status::WT_NEW) {
        "untracked"
    } else {
        "modified"
    }
}

fn has_index_status(status: Status) -> bool {
    status.contains(Status::INDEX_NEW)
        || status.contains(Status::INDEX_MODIFIED)
        || status.contains(Status::INDEX_DELETED)
        || status.contains(Status::INDEX_RENAMED)
        || status.contains(Status::INDEX_TYPECHANGE)
}

fn has_worktree_status(status: Status) -> bool {
    status.contains(Status::WT_NEW)
        || status.contains(Status::WT_MODIFIED)
        || status.contains(Status::WT_DELETED)
        || status.contains(Status::WT_RENAMED)
        || status.contains(Status::WT_TYPECHANGE)
}

fn read_head_summary(repo: &Repository) -> (Option<String>, Option<String>, bool) {
    match repo.head() {
        Ok(head) => (
            head.shorthand().ok().map(ToString::to_string),
            head.target().map(short_oid),
            true,
        ),
        Err(error) if is_unborn_or_missing_head(&error) => (None, None, false),
        Err(_) => (None, None, false),
    }
}

fn list_local_branches(repo: &Repository) -> Result<Vec<WorkspaceVersionBranch>, String> {
    let mut branches = Vec::new();
    let branch_iter = repo
        .branches(Some(BranchType::Local))
        .map_err(|error| format!("无法读取分支列表：{error}"))?;

    for branch_result in branch_iter {
        let (branch, _) = branch_result.map_err(|error| format!("无法读取分支：{error}"))?;
        let Some(name) = branch
            .name()
            .map_err(|error| format!("无法读取分支名称：{error}"))?
        else {
            continue;
        };
        branches.push(WorkspaceVersionBranch {
            name: name.to_string(),
            short_head: branch.get().target().map(short_oid),
            is_current: branch.is_head(),
        });
    }

    branches.sort_by(|left, right| {
        right
            .is_current
            .cmp(&left.is_current)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then(left.name.cmp(&right.name))
    });
    Ok(branches)
}

fn normalize_branch_name(branch_name: &str) -> Result<String, String> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err("分支名称不能为空".to_string());
    }
    if branch_name == "HEAD" || branch_name.chars().any(char::is_whitespace) {
        return Err("分支名称不能包含空白字符或使用 HEAD".to_string());
    }

    let ref_name = branch_ref_name(branch_name);
    if !Reference::is_valid_name(&ref_name) {
        return Err("分支名称不是有效的 Git 分支名".to_string());
    }

    Ok(branch_name.to_string())
}

fn branch_ref_name(branch_name: &str) -> String {
    format!("refs/heads/{branch_name}")
}

fn head_commit(repo: &Repository) -> Result<Vec<git2::Commit<'_>>, String> {
    match repo.head() {
        Ok(head) => Ok(vec![head
            .peel_to_commit()
            .map_err(|error| format!("无法读取当前提交：{error}"))?]),
        Err(error) if is_unborn_or_missing_head(&error) => Ok(Vec::new()),
        Err(error) => Err(format!("无法读取当前提交：{error}")),
    }
}

fn head_tree(repo: &Repository) -> Result<Option<git2::Tree<'_>>, String> {
    match repo.head() {
        Ok(head) => {
            let commit = head
                .peel_to_commit()
                .map_err(|error| format!("无法读取当前提交：{error}"))?;
            commit
                .tree()
                .map(Some)
                .map_err(|error| format!("无法读取当前文件树：{error}"))
        }
        Err(error) if is_unborn_or_missing_head(&error) => Ok(None),
        Err(error) => Err(format!("无法读取当前提交：{error}")),
    }
}

fn version_commit<'repo>(
    repo: &'repo Repository,
    version_id: &str,
) -> Result<git2::Commit<'repo>, String> {
    let version_id = version_id.trim();
    if version_id.is_empty() {
        return Err("版本 ID 不能为空".to_string());
    }

    let object = repo
        .revparse_single(version_id)
        .map_err(|error| format!("无法定位版本：{error}"))?;
    object
        .peel_to_commit()
        .map_err(|error| format!("只能读取提交型版本：{error}"))
}

fn is_unborn_or_missing_head(error: &git2::Error) -> bool {
    matches!(error.code(), ErrorCode::UnbornBranch | ErrorCode::NotFound)
}

fn repository_signature(repo: &Repository) -> Result<Signature<'_>, String> {
    repo.signature()
        .or_else(|_| {
            Signature::now(
                version_control_author_name(),
                version_control_author_email(),
            )
        })
        .map_err(|error| format!("无法创建提交签名：{error}"))
}

fn serialize_version(commit: &git2::Commit<'_>) -> WorkspaceVersion {
    let id = commit.id().to_string();
    WorkspaceVersion {
        short_id: short_oid(commit.id()),
        id,
        summary: commit
            .summary()
            .ok()
            .flatten()
            .unwrap_or("未命名版本")
            .to_string(),
        author_name: commit.author().name().unwrap_or("Unknown").to_string(),
        timestamp: commit.time().seconds().saturating_mul(1000),
    }
}

fn short_oid(oid: Oid) -> String {
    oid.to_string().chars().take(8).collect()
}

fn ensure_git_ignore_rules(root: &Path) -> Result<(), String> {
    let gitignore_path = root.join(".gitignore");
    let mut content = fs::read_to_string(&gitignore_path).unwrap_or_default();
    let required_entries = [
        ".DS_Store",
        "workspace.db",
        "workspace.db-*",
        &format!("{}/", app_data_dir_name()),
    ];
    let existing_lines = content
        .lines()
        .map(str::trim)
        .collect::<std::collections::BTreeSet<_>>();
    let missing = required_entries
        .iter()
        .filter(|entry| !existing_lines.contains(entry.trim()))
        .copied()
        .collect::<Vec<_>>();
    if missing.is_empty() {
        return Ok(());
    }

    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    if !content.is_empty() {
        content.push('\n');
    }
    content.push_str("# Novel Claw local data\n");
    for entry in missing {
        content.push_str(entry);
        content.push('\n');
    }
    fs::write(&gitignore_path, content).map_err(|error| format!("无法写入 .gitignore：{error}"))
}

fn path_to_display_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::GIT_PROVIDER_ID;
    use crate::services::version_control::{
        create_workspace_version, create_workspace_version_branch,
        discard_workspace_version_file_changes, get_workspace_version_commit_file_diff,
        get_workspace_version_control_status, get_workspace_version_file_diff,
        initialize_workspace_version_control, list_workspace_version_files,
        list_workspace_versions, read_workspace_version_file, restore_workspace_version,
        switch_workspace_version_branch, CreateWorkspaceVersionInput, RestoreWorkspaceVersionInput,
        WorkspaceVersionBranchInput, WorkspaceVersionControlFileInput,
        WorkspaceVersionControlPathInput, WorkspaceVersionFileContentInput, WorkspaceVersionInput,
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
            let path = env::temp_dir().join(format!("novel-claw-git-{name}-{timestamp}"));
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
    fn local_version_control_lifecycle_creates_and_restores_versions() {
        let workspace = TestWorkspace::new("lifecycle");
        let draft_path = workspace.path.join("draft.md");
        let outline_path = workspace.path.join("outline").join("plan.md");
        let hidden_path = workspace.path.join(".hidden-note.md");
        let ds_store_path = workspace.path.join(".DS_Store");
        fs::create_dir_all(outline_path.parent().expect("outline parent")).expect("create outline");
        fs::write(&draft_path, "chapter one\n").expect("write draft");
        fs::write(&outline_path, "full workspace snapshot\n").expect("write outline");
        fs::write(&hidden_path, "hidden but versioned\n").expect("write hidden file");
        fs::write(&ds_store_path, "finder metadata").expect("write ds store");

        let status = initialize_workspace_version_control(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("init git");
        assert!(status.is_enabled);
        assert_eq!(status.provider.as_deref(), Some(GIT_PROVIDER_ID));
        assert!(workspace.path.join(".gitignore").exists());
        assert!(status.files.iter().any(|file| file.path == "draft.md"));
        assert!(status
            .files
            .iter()
            .any(|file| file.path == ".hidden-note.md"));
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "outline/plan.md"));
        assert!(!status.files.iter().any(|file| file.path == ".DS_Store"));

        let empty_versions = list_workspace_versions(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("list empty versions");
        assert!(empty_versions.is_empty());

        let version = create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "initial version".to_string(),
            relative_paths: None,
        })
        .expect("create initial version")
        .version;
        assert_eq!(version.summary, "initial version");

        let version_files = list_workspace_version_files(WorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            version_id: version.id.clone(),
        })
        .expect("list version files");
        assert_eq!(version_files.len(), 4);
        assert!(version_files
            .iter()
            .any(|file| file.path == ".hidden-note.md"));
        assert!(version_files.iter().any(|file| file.path == "draft.md"));
        assert!(version_files
            .iter()
            .any(|file| file.path == "outline/plan.md"));
        assert!(!version_files.iter().any(|file| file.path == ".DS_Store"));
        assert!(version_files
            .iter()
            .all(|file| file.status == "added" && file.previous_path.is_none()));

        let version_file = read_workspace_version_file(WorkspaceVersionFileContentInput {
            workspace_path: workspace.path_string(),
            version_id: version.id.clone(),
            relative_path: "outline/plan.md".to_string(),
        })
        .expect("read version file");
        assert_eq!(version_file.content, "full workspace snapshot\n");

        let clean_status = get_workspace_version_control_status(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("read clean status");
        assert!(!clean_status.has_changes);

        fs::write(&draft_path, "chapter two\n").expect("modify draft");
        let changed_status =
            get_workspace_version_control_status(WorkspaceVersionControlPathInput {
                workspace_path: workspace.path_string(),
                branch_name: None,
            })
            .expect("read changed status");
        assert!(changed_status.has_changes);
        assert!(changed_status
            .files
            .iter()
            .any(|file| file.path == "draft.md" && file.status == "modified"));

        let diff = get_workspace_version_file_diff(WorkspaceVersionControlFileInput {
            workspace_path: workspace.path_string(),
            relative_path: "draft.md".to_string(),
        })
        .expect("read diff");
        assert!(diff.patch.contains("-chapter one"));
        assert!(diff.patch.contains("+chapter two"));
        assert!(diff.patch.contains("chapter two"));
        assert_eq!(diff.before_content, "chapter one\n");
        assert_eq!(diff.after_content, "chapter two\n");

        let second_version = create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "second version".to_string(),
            relative_paths: None,
        })
        .expect("create second version")
        .version;
        assert_eq!(second_version.summary, "second version");

        let second_version_files = list_workspace_version_files(WorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            version_id: second_version.id.clone(),
        })
        .expect("list second version changed files");
        assert_eq!(second_version_files.len(), 1);
        assert_eq!(second_version_files[0].path, "draft.md");
        assert_eq!(second_version_files[0].status, "modified");

        let second_version_diff =
            get_workspace_version_commit_file_diff(WorkspaceVersionFileContentInput {
                workspace_path: workspace.path_string(),
                version_id: second_version.id.clone(),
                relative_path: "draft.md".to_string(),
            })
            .expect("read second version diff");
        assert_eq!(second_version_diff.before_content, "chapter one\n");
        assert_eq!(second_version_diff.after_content, "chapter two\n");
        assert!(second_version_diff.patch.contains("-chapter one"));
        assert!(second_version_diff.patch.contains("+chapter two"));

        fs::remove_file(&outline_path).expect("delete outline");
        let delete_version = create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "delete outline".to_string(),
            relative_paths: None,
        })
        .expect("create delete version")
        .version;
        let delete_version_files = list_workspace_version_files(WorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            version_id: delete_version.id.clone(),
        })
        .expect("list delete version files");
        assert_eq!(delete_version_files.len(), 1);
        assert_eq!(delete_version_files[0].path, "outline/plan.md");
        assert_eq!(delete_version_files[0].status, "deleted");

        let delete_version_diff =
            get_workspace_version_commit_file_diff(WorkspaceVersionFileContentInput {
                workspace_path: workspace.path_string(),
                version_id: delete_version.id,
                relative_path: "outline/plan.md".to_string(),
            })
            .expect("read delete version diff");
        assert_eq!(
            delete_version_diff.before_content,
            "full workspace snapshot\n"
        );
        assert_eq!(delete_version_diff.after_content, "");

        let restored_status = restore_workspace_version(RestoreWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            version_id: version.id,
        })
        .expect("restore version");
        assert!(restored_status.has_changes);
        assert_eq!(
            fs::read_to_string(&draft_path).expect("read restored draft"),
            "chapter one\n"
        );

        let versions = list_workspace_versions(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("list versions");
        assert!(versions.iter().any(|item| item.id == second_version.id));
    }

    #[test]
    fn local_version_control_can_commit_selected_files_only() {
        let workspace = TestWorkspace::new("partial");
        let alpha_path = workspace.path.join("alpha.md");
        let beta_path = workspace.path.join("beta.md");
        fs::write(&alpha_path, "alpha one\n").expect("write alpha");
        fs::write(&beta_path, "beta one\n").expect("write beta");

        initialize_workspace_version_control(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("init git");
        create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "initial".to_string(),
            relative_paths: None,
        })
        .expect("create initial");

        fs::write(&alpha_path, "alpha two\n").expect("modify alpha");
        fs::write(&beta_path, "beta two\n").expect("modify beta");
        let version = create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "alpha only".to_string(),
            relative_paths: Some(vec!["alpha.md".to_string()]),
        })
        .expect("create partial")
        .version;

        let alpha_in_version = read_workspace_version_file(WorkspaceVersionFileContentInput {
            workspace_path: workspace.path_string(),
            version_id: version.id.clone(),
            relative_path: "alpha.md".to_string(),
        })
        .expect("read alpha in version");
        assert_eq!(alpha_in_version.content, "alpha two\n");

        let beta_in_version = read_workspace_version_file(WorkspaceVersionFileContentInput {
            workspace_path: workspace.path_string(),
            version_id: version.id,
            relative_path: "beta.md".to_string(),
        })
        .expect("read beta in version");
        assert_eq!(beta_in_version.content, "beta one\n");

        let status = get_workspace_version_control_status(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("read status");
        assert!(status.has_changes);
        assert_eq!(status.changed_file_count, 1);
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "beta.md" && file.status == "modified"));
    }

    #[test]
    fn local_version_control_can_discard_file_changes() {
        let workspace = TestWorkspace::new("discard");
        let note_path = workspace.path.join("note.md");
        let new_path = workspace.path.join("new.md");
        fs::write(&note_path, "one\n").expect("write note");

        initialize_workspace_version_control(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("init git");
        create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "initial".to_string(),
            relative_paths: None,
        })
        .expect("create initial");

        fs::write(&note_path, "two\n").expect("modify note");
        fs::write(&new_path, "new\n").expect("write new");
        let changed_status =
            get_workspace_version_control_status(WorkspaceVersionControlPathInput {
                workspace_path: workspace.path_string(),
                branch_name: None,
            })
            .expect("read changed status");
        assert!(changed_status
            .files
            .iter()
            .any(|file| file.path == "note.md" && file.status == "modified"));
        assert!(changed_status
            .files
            .iter()
            .any(|file| file.path == "new.md" && file.status == "untracked"));

        let modified_discard_status =
            discard_workspace_version_file_changes(WorkspaceVersionControlFileInput {
                workspace_path: workspace.path_string(),
                relative_path: "note.md".to_string(),
            })
            .expect("discard modified file");
        assert_eq!(
            fs::read_to_string(&note_path).expect("read restored note"),
            "one\n"
        );
        assert!(!modified_discard_status
            .files
            .iter()
            .any(|file| file.path == "note.md"));
        assert!(modified_discard_status
            .files
            .iter()
            .any(|file| file.path == "new.md" && file.status == "untracked"));

        let new_discard_status =
            discard_workspace_version_file_changes(WorkspaceVersionControlFileInput {
                workspace_path: workspace.path_string(),
                relative_path: "new.md".to_string(),
            })
            .expect("discard new file");
        assert!(!new_path.exists());
        assert!(!new_discard_status.has_changes);

        fs::remove_file(&note_path).expect("delete note");
        let delete_status =
            discard_workspace_version_file_changes(WorkspaceVersionControlFileInput {
                workspace_path: workspace.path_string(),
                relative_path: "note.md".to_string(),
            })
            .expect("discard deleted file");
        assert_eq!(
            fs::read_to_string(&note_path).expect("read restored deleted note"),
            "one\n"
        );
        assert!(!delete_status.has_changes);
    }

    #[test]
    fn local_version_control_can_create_and_switch_branches() {
        let workspace = TestWorkspace::new("branches");
        let draft_path = workspace.path.join("draft.md");
        fs::write(&draft_path, "main draft\n").expect("write draft");

        initialize_workspace_version_control(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: None,
        })
        .expect("init git");
        let main_version = create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "main version".to_string(),
            relative_paths: None,
        })
        .expect("create main version")
        .version;

        let branch_status = create_workspace_version_branch(WorkspaceVersionBranchInput {
            workspace_path: workspace.path_string(),
            branch_name: "draft-a".to_string(),
        })
        .expect("create branch");
        assert_eq!(branch_status.current_ref.as_deref(), Some("draft-a"));
        assert!(branch_status
            .branches
            .iter()
            .any(|branch| branch.name == "draft-a" && branch.is_current));

        fs::write(&draft_path, "branch draft\n").expect("modify branch draft");
        let branch_version = create_workspace_version(CreateWorkspaceVersionInput {
            workspace_path: workspace.path_string(),
            message: "branch version".to_string(),
            relative_paths: None,
        })
        .expect("create branch version")
        .version;

        let draft_versions = list_workspace_versions(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: Some("draft-a".to_string()),
        })
        .expect("list draft branch versions");
        assert!(draft_versions
            .iter()
            .any(|version| version.id == branch_version.id));
        assert!(draft_versions
            .iter()
            .any(|version| version.id == main_version.id));

        let master_versions = list_workspace_versions(WorkspaceVersionControlPathInput {
            workspace_path: workspace.path_string(),
            branch_name: Some("master".to_string()),
        })
        .expect("list master versions while on draft branch");
        assert!(master_versions
            .iter()
            .any(|version| version.id == main_version.id));
        assert!(!master_versions
            .iter()
            .any(|version| version.id == branch_version.id));

        let switched_status = switch_workspace_version_branch(WorkspaceVersionBranchInput {
            workspace_path: workspace.path_string(),
            branch_name: "master".to_string(),
        })
        .expect("switch branch");
        assert_eq!(switched_status.current_ref.as_deref(), Some("master"));
        assert_eq!(
            fs::read_to_string(&draft_path).expect("read switched draft"),
            "main draft\n"
        );
    }
}
