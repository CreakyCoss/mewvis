use crate::services::workspace_paths::{
    ensure_under_root, sanitize_session_id, workspace_app_data_dir, workspace_root,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

const TAVERN_DIR_NAME: &str = "tavern";
const INDEX_FILE_NAME: &str = "index.json";
const META_FILE_NAME: &str = "meta.json";
const ROOM_FILE_NAME: &str = "room.json";
const MESSAGES_FILE_NAME: &str = "messages.json";
const CONVERSATION_FILE_NAME: &str = "conversation.json";
const TAVERN_STATE_VERSION: u8 = 2;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTavernStateInput {
    pub workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTavernStateInput {
    pub workspace_path: String,
    pub state: Value,
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
    system_preset_id: Option<String>,
    locked: bool,
    created_at: i64,
    updated_at: i64,
    message_count: usize,
}

pub fn load_tavern_state(input: LoadTavernStateInput) -> Result<Option<Value>, String> {
    let dir = tavern_dir(&input.workspace_path)?;
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
    let mut messages_by_scene = Map::new();

    for room_id in index.room_ids {
        let room_dir = tavern_session_dir(&input.workspace_path, &room_id)?;
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

        if let Some(Value::Object(scene_messages)) =
            read_optional_json_file::<Value>(&room_dir.join(CONVERSATION_FILE_NAME))?
        {
            for (scene_id, messages) in scene_messages {
                messages_by_scene.insert(scene_id, messages);
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
        "messagesByScene".to_string(),
        Value::Object(messages_by_scene),
    );

    Ok(Some(Value::Object(state)))
}

pub fn save_tavern_state(input: SaveTavernStateInput) -> Result<Value, String> {
    let dir = tavern_dir(&input.workspace_path)?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建酒馆目录：{error}"))?;

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
    let messages_by_scene = input
        .state
        .get("messagesByScene")
        .and_then(Value::as_object)
        .ok_or_else(|| "酒馆状态缺少 messagesByScene".to_string())?;

    let mut room_ids = Vec::new();
    let mut room_id_set = HashSet::new();
    for room in rooms {
        let Some(room_id) = value_string(room, "id") else {
            continue;
        };
        let room_id = sanitize_session_id(&room_id)?;
        room_ids.push(room_id.clone());
        room_id_set.insert(room_id.clone());

        let room_dir = tavern_session_dir(&input.workspace_path, &room_id)?;
        fs::create_dir_all(&room_dir).map_err(|error| format!("无法创建酒馆会话目录：{error}"))?;

        let messages = active_scene_messages(room, messages_by_scene);
        let conversation = collect_room_scene_messages(room, messages_by_scene);
        write_json_file(&room_dir.join(ROOM_FILE_NAME), room)?;
        write_json_file(&room_dir.join(MESSAGES_FILE_NAME), &messages)?;
        write_json_file(&room_dir.join(CONVERSATION_FILE_NAME), &conversation)?;
        write_json_file(
            &room_dir.join(META_FILE_NAME),
            &tavern_session_meta(&room_id, room, &messages),
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

fn tavern_session_meta(room_id: &str, room: &Value, messages: &Value) -> TavernSessionMeta {
    TavernSessionMeta {
        id: room_id.to_string(),
        title: value_string(room, "title").unwrap_or_else(|| "未命名酒馆".to_string()),
        path: format!("{}/{}/{}", tavern_dir_display(), room_id, META_FILE_NAME),
        workspace_id: value_string(room, "workspaceId"),
        active_scene_id: value_string(room, "activeSceneId"),
        system_preset_id: value_string(room, "systemPresetId"),
        locked: room.get("locked").and_then(Value::as_bool).unwrap_or(false),
        created_at: value_i64(room, "createdAt").unwrap_or(0),
        updated_at: value_i64(room, "updatedAt").unwrap_or(0),
        message_count: messages.as_array().map(Vec::len).unwrap_or(0),
    }
}

fn collect_room_scene_messages(
    room: &Value,
    messages_by_scene: &Map<String, Value>,
) -> Value {
    let mut scene_ids = HashSet::new();
    if let Some(active_scene_id) = value_string(room, "activeSceneId") {
        scene_ids.insert(active_scene_id);
    }
    if let Some(scenes) = room.get("scenes").and_then(Value::as_array) {
        for scene in scenes {
            if let Some(scene_id) = value_string(scene, "id") {
                scene_ids.insert(scene_id);
            }
        }
    }

    let mut conversation = Map::new();
    for scene_id in scene_ids {
        if let Some(messages) = messages_by_scene.get(&scene_id) {
            conversation.insert(scene_id, messages.clone());
        }
    }

    Value::Object(conversation)
}

fn active_scene_messages(room: &Value, messages_by_scene: &Map<String, Value>) -> Value {
    value_string(room, "activeSceneId")
        .and_then(|scene_id| messages_by_scene.get(&scene_id).cloned())
        .unwrap_or_else(|| Value::Array(Vec::new()))
}

fn tavern_dir(workspace_path: &str) -> Result<PathBuf, String> {
    Ok(workspace_app_data_dir(&workspace_root(workspace_path)?).join(TAVERN_DIR_NAME))
}

fn tavern_session_dir(workspace_path: &str, session_id: &str) -> Result<PathBuf, String> {
    let id = sanitize_session_id(session_id)?;
    let dir = tavern_dir(workspace_path)?;
    let path = dir.join(id);
    ensure_under_root(&dir, &path)?;
    Ok(path)
}

fn tavern_dir_display() -> String {
    format!(
        "{}/{}",
        crate::product_config::app_data_dir_name(),
        TAVERN_DIR_NAME
    )
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
        let message = json!({
            "id": "message-one",
            "roomId": room_id,
            "role": "user",
            "content": "开场",
            "createdAt": 3,
            "status": "done"
        });
        let mut messages_by_scene = Map::new();
        messages_by_scene.insert(scene_id.to_string(), Value::Array(vec![message]));

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
                "scenes": [{ "id": scene_id, "title": "默认场景" }],
                "memory": "长期记忆",
                "createdAt": 1,
                "updatedAt": 2
            }]),
        );
        state.insert(
            "messagesByScene".to_string(),
            Value::Object(messages_by_scene),
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
            .get("messagesByScene")
            .and_then(Value::as_object)
            .and_then(|items| items.get("scene-main"))
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
            state: test_tavern_state("workspace-a", room_id),
        })
        .expect("save tavern state");

        assert!(workspace.tavern_session_dir(room_id).exists());
        assert!(!stale_dir.exists());
    }
}
