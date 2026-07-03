use crate::services::workspace_paths::{
    display_workspace_relative, ensure_under_root, sanitize_session_id, workspace_app_data_dir,
    workspace_root,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashSet,
    ffi::OsString,
    fs,
    path::{Component, Path, PathBuf},
};

const TAVERN_DIR_NAME: &str = "tavern";
const INDEX_FILE_NAME: &str = "index.json";
const META_FILE_NAME: &str = "meta.json";
const ROOM_FILE_NAME: &str = "room.json";
const MESSAGES_FILE_NAME: &str = "messages.json";
const CONVERSATION_FILE_NAME: &str = "conversation.json";
const TAVERN_STATE_VERSION: u8 = 4;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTavernStateInput {
    pub workspace_path: String,
    pub story_id: Option<String>,
    pub tavern_id: Option<String>,
    pub runtime_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTavernStateInput {
    pub workspace_path: String,
    pub story_id: Option<String>,
    pub tavern_id: Option<String>,
    pub runtime_path: Option<String>,
    pub state: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearTavernStateInput {
    pub workspace_path: String,
    pub story_id: Option<String>,
    pub tavern_id: Option<String>,
    pub runtime_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TavernIndex {
    version: u8,
    active_room_id: String,
    room_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TavernSessionMeta {
    id: String,
    title: String,
    path: String,
    workspace_id: Option<String>,
    active_scene_id: Option<String>,
    active_scene_instance_id: Option<String>,
    active_run_id: Option<String>,
    system_preset_id: Option<String>,
    locked: bool,
    created_at: i64,
    updated_at: i64,
    message_count: usize,
}

pub fn load_tavern_state(input: LoadTavernStateInput) -> Result<Option<Value>, String> {
    let dir = tavern_dir(
        &input.workspace_path,
        input.runtime_path.as_deref(),
        input.story_id.as_deref(),
        input.tavern_id.as_deref(),
    )?;
    if !dir.exists() {
        return Ok(None);
    }

    let index_path = dir.join(INDEX_FILE_NAME);
    if !index_path.exists() {
        return Ok(None);
    }

    let index = read_json_file::<TavernIndex>(&index_path)
        .map_err(|error| format!("无法解析酒馆索引：{error}"))?;
    if index.version != TAVERN_STATE_VERSION {
        return Ok(None);
    }
    let mut rooms = Vec::new();
    let mut messages_by_instance = Map::new();

    for room_id in index.room_ids {
        let room_dir = tavern_session_dir(&dir, &room_id)?;
        if !room_dir.exists() {
            continue;
        }

        let room = match read_json_file::<Value>(&room_dir.join(ROOM_FILE_NAME)) {
            Ok(room) => room,
            Err(_) => continue,
        };
        if value_string(&room, "id").is_none() {
            continue;
        }

        if let Some(Value::Object(instance_messages)) =
            read_optional_json_file::<Value>(&room_dir.join(CONVERSATION_FILE_NAME))?
        {
            for (instance_id, messages) in instance_messages {
                messages_by_instance.insert(instance_id, messages);
            }
        }

        rooms.push(room);
    }

    if rooms.is_empty() {
        return Ok(None);
    }

    let active_room_id = if rooms
        .iter()
        .any(|room| value_string(room, "id").as_deref() == Some(index.active_room_id.as_str()))
    {
        index.active_room_id
    } else {
        value_string(&rooms[0], "id").unwrap_or_default()
    };

    let mut state = Map::new();
    state.insert("version".to_string(), Value::from(TAVERN_STATE_VERSION));
    state.insert("activeRoomId".to_string(), Value::from(active_room_id));
    state.insert("rooms".to_string(), Value::Array(rooms));
    state.insert(
        "messagesByInstance".to_string(),
        Value::Object(messages_by_instance),
    );

    Ok(Some(Value::Object(state)))
}

pub fn save_tavern_state(input: SaveTavernStateInput) -> Result<Value, String> {
    let dir = tavern_dir(
        &input.workspace_path,
        input.runtime_path.as_deref(),
        input.story_id.as_deref(),
        input.tavern_id.as_deref(),
    )?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建酒馆目录：{error}"))?;
    let dir_display = tavern_dir_display(&input.workspace_path, &dir)?;

    let rooms = input
        .state
        .get("rooms")
        .and_then(Value::as_array)
        .ok_or_else(|| "酒馆状态缺少 rooms".to_string())?;
    let active_room_id = input
        .state
        .get("activeRoomId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let messages_by_instance = input
        .state
        .get("messagesByInstance")
        .and_then(Value::as_object)
        .ok_or_else(|| "酒馆状态缺少 messagesByInstance".to_string())?;

    let mut room_ids = Vec::new();
    let mut room_id_set = HashSet::new();
    for room in rooms {
        let Some(room_id) = value_string(room, "id") else {
            continue;
        };
        let room_id = sanitize_session_id(&room_id)?;
        room_ids.push(room_id.clone());
        room_id_set.insert(room_id.clone());

        let room_dir = tavern_session_dir(&dir, &room_id)?;
        fs::create_dir_all(&room_dir).map_err(|error| format!("无法创建酒馆会话目录：{error}"))?;

        let messages = active_scene_messages(room, messages_by_instance);
        let conversation = collect_room_scene_messages(room, messages_by_instance);
        write_json_file(&room_dir.join(ROOM_FILE_NAME), room)?;
        write_json_file(&room_dir.join(MESSAGES_FILE_NAME), &messages)?;
        write_json_file(&room_dir.join(CONVERSATION_FILE_NAME), &conversation)?;
        write_json_file(
            &room_dir.join(META_FILE_NAME),
            &tavern_session_meta(&room_id, room, &messages, &dir_display),
        )?;
    }

    remove_stale_tavern_session_dirs(&dir, &room_id_set)?;

    write_json_file(
        &dir.join(INDEX_FILE_NAME),
        &TavernIndex {
            version: TAVERN_STATE_VERSION,
            active_room_id,
            room_ids,
        },
    )?;

    Ok(input.state)
}

pub fn clear_tavern_state(input: ClearTavernStateInput) -> Result<(), String> {
    let dir = tavern_dir(
        &input.workspace_path,
        input.runtime_path.as_deref(),
        input.story_id.as_deref(),
        input.tavern_id.as_deref(),
    )?;
    if !dir.exists() {
        return Ok(());
    }

    let root = workspace_root(&input.workspace_path)?;
    ensure_under_root(&root, &dir)?;
    fs::remove_dir_all(dir).map_err(|error| format!("无法清空酒馆运行时：{error}"))
}

fn tavern_session_meta(
    room_id: &str,
    room: &Value,
    messages: &Value,
    dir_display: &str,
) -> TavernSessionMeta {
    TavernSessionMeta {
        id: room_id.to_string(),
        title: value_string(room, "title").unwrap_or_else(|| "未命名酒馆".to_string()),
        path: format!("{}/{}/{}", dir_display, room_id, META_FILE_NAME),
        workspace_id: value_string(room, "workspaceId"),
        active_scene_id: value_string(room, "activeSceneId"),
        active_scene_instance_id: value_string(room, "activeSceneInstanceId"),
        active_run_id: value_string(room, "activeRunId"),
        system_preset_id: value_string(room, "systemPresetId"),
        locked: room.get("locked").and_then(Value::as_bool).unwrap_or(false),
        created_at: value_i64(room, "createdAt").unwrap_or(0),
        updated_at: value_i64(room, "updatedAt").unwrap_or(0),
        message_count: messages.as_array().map(Vec::len).unwrap_or(0),
    }
}

fn collect_room_scene_messages(room: &Value, messages_by_instance: &Map<String, Value>) -> Value {
    let mut instance_ids = HashSet::new();
    if let Some(active_instance_id) = value_string(room, "activeSceneInstanceId") {
        instance_ids.insert(active_instance_id);
    }
    if let Some(instances) = room.get("sceneInstances").and_then(Value::as_array) {
        for instance in instances {
            if let Some(instance_id) = value_string(instance, "id") {
                instance_ids.insert(instance_id);
            }
        }
    }

    let mut conversation = Map::new();
    for instance_id in instance_ids {
        if let Some(messages) = messages_by_instance.get(&instance_id) {
            conversation.insert(instance_id, messages.clone());
        }
    }

    Value::Object(conversation)
}

fn active_scene_messages(room: &Value, messages_by_instance: &Map<String, Value>) -> Value {
    value_string(room, "activeSceneInstanceId")
        .and_then(|instance_id| messages_by_instance.get(&instance_id).cloned())
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

fn tavern_dir(
    workspace_path: &str,
    runtime_path: Option<&str>,
    story_id: Option<&str>,
    tavern_id: Option<&str>,
) -> Result<PathBuf, String> {
    let root = workspace_root(workspace_path)?;
    if let Some(runtime_path) = runtime_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let dir = PathBuf::from(runtime_path);
        let dir = if dir.is_absolute() {
            dir
        } else {
            root.join(dir)
        };
        let dir = normalize_runtime_path(&dir)?;
        ensure_safe_runtime_path(&root, &dir)?;
        return Ok(dir);
    }

    match (story_id, tavern_id) {
        (Some(_), Some(_)) => Err("故事酒馆运行目录必须由调用方传入".to_string()),
        _ => Ok(workspace_app_data_dir(&root).join(TAVERN_DIR_NAME)),
    }
}

fn tavern_session_dir(dir: &Path, session_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(session_id)?;
    let path = dir.join(id);
    ensure_under_root(dir, &path)?;
    Ok(path)
}

fn ensure_safe_runtime_path(root: &Path, dir: &Path) -> Result<(), String> {
    if dir
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("酒馆运行目录不能包含上级路径".to_string());
    }
    ensure_under_root(root, dir)
}

fn normalize_runtime_path(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|error| format!("无法定位酒馆运行目录：{error}"));
    }

    let mut existing = path;
    let mut missing = Vec::<OsString>::new();
    while !existing.exists() {
        if let Some(name) = existing.file_name() {
            missing.push(name.to_os_string());
        }
        existing = existing
            .parent()
            .ok_or_else(|| "无法定位酒馆运行目录的上级目录".to_string())?;
    }

    let mut normalized = existing
        .canonicalize()
        .map_err(|error| format!("无法定位酒馆运行目录的上级目录：{error}"))?;
    for component in missing.into_iter().rev() {
        normalized.push(component);
    }
    Ok(normalized)
}

fn tavern_dir_display(workspace_path: &str, dir: &Path) -> Result<String, String> {
    display_workspace_relative(workspace_path, dir)
}

fn read_json_file<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path).map_err(|error| format!("无法读取文件：{error}"))?;
    serde_json::from_str::<T>(&content).map_err(|error| format!("无法解析 JSON：{error}"))
}

fn read_optional_json_file<T: serde::de::DeserializeOwned>(
    path: &Path,
) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }

    read_json_file::<T>(path).map(Some)
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("无法序列化酒馆数据：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存酒馆数据：{error}"))
}

fn remove_stale_tavern_session_dirs(
    dir: &Path,
    active_room_ids: &HashSet<String>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|error| format!("无法读取酒馆目录：{error}"))? {
        let entry = entry.map_err(|error| format!("无法读取酒馆目录项：{error}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(room_id) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if active_room_ids.contains(room_id) {
            continue;
        }

        ensure_under_root(dir, &path)?;
        fs::remove_dir_all(path).map_err(|error| format!("无法删除旧酒馆会话：{error}"))?;
    }

    Ok(())
}

fn value_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn value_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64).or_else(|| {
        value
            .get(key)
            .and_then(Value::as_u64)
            .map(|item| item as i64)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    struct TestWorkspace {
        path: PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "{}-{name}-{}",
                crate::product_config::bundle_name(),
                Uuid::now_v7()
            ));
            fs::create_dir_all(&path).expect("create test workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().to_string()
        }

        fn app_data_dir(&self) -> PathBuf {
            workspace_app_data_dir(&self.path)
        }

        fn tavern_session_dir(&self, room_id: &str) -> PathBuf {
            self.app_data_dir().join(TAVERN_DIR_NAME).join(room_id)
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn test_tavern_state(workspace_id: &str, room_id: &str) -> Value {
        let scene_id = "scene-main";
        let scene_instance_id = "scene-instance-main";
        let message = json!({
            "id": "message-one",
            "roomId": room_id,
            "sceneId": scene_id,
            "sceneInstanceId": scene_instance_id,
            "role": "user",
            "content": "开场",
            "createdAt": 3,
            "status": "done"
        });
        let mut messages_by_instance = Map::new();
        messages_by_instance.insert(scene_instance_id.to_string(), Value::Array(vec![message]));

        let mut state = Map::new();
        state.insert("version".to_string(), Value::from(TAVERN_STATE_VERSION));
        state.insert("activeRoomId".to_string(), Value::from(room_id));
        state.insert(
            "rooms".to_string(),
            json!([{
                "id": room_id,
                "workspaceId": workspace_id,
                "locked": false,
                "title": "测试酒馆",
                "storyOutline": "",
                "storyGoal": "",
                "activeSceneId": scene_id,
                "activeSceneInstanceId": scene_instance_id,
                "scenes": [{ "id": scene_id, "title": "默认场景" }],
                "sceneInstances": [{ "id": scene_instance_id, "sceneId": scene_id }],
                "memory": "长期记忆",
                "createdAt": 1,
                "updatedAt": 2
            }]),
        );
        state.insert(
            "messagesByInstance".to_string(),
            Value::Object(messages_by_instance),
        );
        Value::Object(state)
    }

    #[test]
    fn save_tavern_state_splits_room_files_and_loads_state() {
        let workspace = TestWorkspace::new("tavern-save-load");
        let room_id = "room-20260616-153012-001-test";
        let state = test_tavern_state("workspace-a", room_id);

        save_tavern_state(SaveTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: None,
            tavern_id: None,
            runtime_path: None,
            state,
        })
        .expect("save tavern state");

        let session_dir = workspace.tavern_session_dir(room_id);
        assert!(session_dir.join(META_FILE_NAME).exists());
        assert!(session_dir.join(ROOM_FILE_NAME).exists());
        assert!(session_dir.join(MESSAGES_FILE_NAME).exists());
        assert!(session_dir.join(CONVERSATION_FILE_NAME).exists());

        let loaded = load_tavern_state(LoadTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: None,
            tavern_id: None,
            runtime_path: None,
        })
        .expect("load tavern state")
        .expect("state exists");

        assert_eq!(
            loaded.get("activeRoomId").and_then(Value::as_str),
            Some(room_id)
        );
        assert_eq!(
            loaded
                .get("rooms")
                .and_then(Value::as_array)
                .and_then(|rooms| rooms.first())
                .and_then(|room| room.get("id"))
                .and_then(Value::as_str),
            Some(room_id)
        );
        assert!(loaded
            .get("messagesByInstance")
            .and_then(Value::as_object)
            .and_then(|items| items.get("scene-instance-main"))
            .and_then(Value::as_array)
            .is_some_and(|messages| messages.len() == 1));
    }

    #[test]
    fn load_tavern_state_discards_v1_index() {
        let workspace = TestWorkspace::new("tavern-v1-discard");
        let dir = workspace.app_data_dir().join(TAVERN_DIR_NAME);
        fs::create_dir_all(&dir).expect("create tavern dir");
        write_json_file(
            &dir.join(INDEX_FILE_NAME),
            &TavernIndex {
                version: 1,
                active_room_id: "room-old".to_string(),
                room_ids: vec!["room-old".to_string()],
            },
        )
        .expect("write v1 index");

        let loaded = load_tavern_state(LoadTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: None,
            tavern_id: None,
            runtime_path: None,
        })
        .expect("load tavern state");

        assert!(loaded.is_none());
    }

    #[test]
    fn save_tavern_state_removes_stale_room_dirs() {
        let workspace = TestWorkspace::new("tavern-remove-stale");
        let room_id = "room-current";
        let stale_dir = workspace.tavern_session_dir("room-stale");
        fs::create_dir_all(&stale_dir).expect("create stale tavern session dir");

        save_tavern_state(SaveTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: None,
            tavern_id: None,
            runtime_path: None,
            state: test_tavern_state("workspace-a", room_id),
        })
        .expect("save tavern state");

        assert!(workspace.tavern_session_dir(room_id).exists());
        assert!(!stale_dir.exists());
    }

    #[test]
    fn story_tavern_state_uses_story_workspace_runtime_dir() {
        let workspace = TestWorkspace::new("story-tavern-runtime");
        let room_id = "main";
        let runtime_dir = workspace
            .path
            .join(".tavern")
            .join("story-one")
            .join("main");
        let runtime_path = runtime_dir.to_string_lossy().to_string();

        save_tavern_state(SaveTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: Some("story-one".to_string()),
            tavern_id: Some("main".to_string()),
            runtime_path: Some(runtime_path.clone()),
            state: test_tavern_state("story-one", room_id),
        })
        .expect("save story tavern state");

        assert!(runtime_dir.join(INDEX_FILE_NAME).exists());
        assert!(runtime_dir.join(room_id).join(ROOM_FILE_NAME).exists());

        let loaded = load_tavern_state(LoadTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: Some("story-one".to_string()),
            tavern_id: Some("main".to_string()),
            runtime_path: Some(runtime_path.clone()),
        })
        .expect("load story tavern state")
        .expect("state exists");

        assert_eq!(
            loaded.get("activeRoomId").and_then(Value::as_str),
            Some(room_id)
        );

        clear_tavern_state(ClearTavernStateInput {
            workspace_path: workspace.path_string(),
            story_id: Some("story-one".to_string()),
            tavern_id: Some("main".to_string()),
            runtime_path: Some(runtime_path),
        })
        .expect("clear story tavern state");
        assert!(!runtime_dir.exists());
    }
}
