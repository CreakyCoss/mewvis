use crate::services::workspace_files::{
    self, AtomicWorkspaceFilesResult, WorkspaceFile, WorkspaceFileEntry, WorkspaceFilePathInput,
    WorkspacePathInput, WriteWorkspaceFileInput, WriteWorkspaceFilesAtomicInput,
};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{ipc::Channel, State};
use uuid::Uuid;

#[derive(Default)]
pub struct WorkspaceFileWatchers {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileWatchInput {
    watch_id: String,
}

#[tauri::command]
pub fn watch_workspace_files(
    watchers: State<'_, WorkspaceFileWatchers>,
    input: WorkspacePathInput,
    on_change: Channel<()>,
) -> Result<String, String> {
    let root = workspace_files::workspace_root(&input.workspace_path)?;
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            if !matches!(event.kind, EventKind::Access(_)) {
                let _ = on_change.send(());
            }
        }
    })
    .map_err(|error| format!("无法创建工作区文件监听：{error}"))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| format!("无法监听工作区目录：{error}"))?;

    let watch_id = Uuid::now_v7().to_string();
    watchers
        .watchers
        .lock()
        .map_err(|_| "无法获取工作区文件监听锁".to_string())?
        .insert(watch_id.clone(), watcher);
    Ok(watch_id)
}

#[tauri::command]
pub fn unwatch_workspace_files(
    watchers: State<'_, WorkspaceFileWatchers>,
    input: WorkspaceFileWatchInput,
) -> Result<(), String> {
    watchers
        .watchers
        .lock()
        .map_err(|_| "无法获取工作区文件监听锁".to_string())?
        .remove(&input.watch_id);
    Ok(())
}

#[tauri::command]
pub fn list_workspace_files(input: WorkspacePathInput) -> Result<Vec<WorkspaceFileEntry>, String> {
    workspace_files::list_workspace_files(input)
}

#[tauri::command]
pub fn read_workspace_file(input: WorkspaceFilePathInput) -> Result<WorkspaceFile, String> {
    workspace_files::read_workspace_file(input)
}

#[tauri::command]
pub fn read_workspace_file_optional(
    input: WorkspaceFilePathInput,
) -> Result<Option<WorkspaceFile>, String> {
    workspace_files::read_workspace_file_optional(input)
}

#[tauri::command]
pub fn write_workspace_file(input: WriteWorkspaceFileInput) -> Result<WorkspaceFile, String> {
    workspace_files::write_workspace_file(input)
}

#[tauri::command]
pub fn write_workspace_files_atomic(
    input: WriteWorkspaceFilesAtomicInput,
) -> Result<AtomicWorkspaceFilesResult, String> {
    workspace_files::write_workspace_files_atomic(input)
}

#[tauri::command]
pub fn delete_workspace_file(input: WorkspaceFilePathInput) -> Result<(), String> {
    workspace_files::delete_workspace_file(input)
}
