use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::mpsc,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use uuid::Uuid;

use super::application_data::{
    check_file, check_paths, error, open_database, application_data_root, Request,
};

type Result<T> = std::result::Result<T, Value>;
const MARKER_NAME: &str = "workspace.json";
const MAX_MARKER_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Marker {
    version: u32,
    id: String,
    applications: Vec<String>,
    created_at: u64,
    #[serde(flatten)]
    metadata: BTreeMap<String, Value>,
}

/// Interactions are owned by the host. SDK requests cannot supply an approval flag.
pub(super) trait WorkspaceInteraction {
    fn check_active(&self) -> Result<()> {
        Ok(())
    }
    fn pick_directory(&self) -> Result<Option<PathBuf>> {
        Err(confirmation_unavailable())
    }
    fn confirm_share(&self, _path: &Path, _applications: &[String]) -> Result<bool> {
        Err(confirmation_unavailable())
    }
}

#[cfg(test)]
pub(super) struct NoInteraction;
#[cfg(test)]
impl WorkspaceInteraction for NoInteraction {}

pub(super) struct DesktopInteraction<'a> {
    app: &'a AppHandle,
    owner: &'a str,
    check: &'a dyn Fn() -> Result<()>,
    deadline: Instant,
}

impl<'a> DesktopInteraction<'a> {
    pub(super) fn new(
        app: &'a AppHandle,
        owner: &'a str,
        check: &'a dyn Fn() -> Result<()>,
    ) -> Self {
        Self {
            app,
            owner,
            check,
            deadline: Instant::now() + Duration::from_secs(60),
        }
    }
    fn wait<T>(&self, receiver: mpsc::Receiver<T>) -> Result<T> {
        let value = receiver
            .recv_timeout(self.deadline.saturating_duration_since(Instant::now()))
            .map_err(|_| {
                error(
                    "CONFIRMATION_UNAVAILABLE",
                    "工作区选择或确认已超时，请重新发起",
                )
            })?;
        self.check_active()?;
        Ok(value)
    }
}

impl WorkspaceInteraction for DesktopInteraction<'_> {
    fn check_active(&self) -> Result<()> {
        if Instant::now() >= self.deadline {
            return Err(error(
                "CONFIRMATION_UNAVAILABLE",
                "工作区操作已超时，请重新发起",
            ));
        }
        (self.check)()
    }
    fn pick_directory(&self) -> Result<Option<PathBuf>> {
        self.check_active()?;
        let window = self
            .app
            .get_webview_window("main")
            .ok_or_else(confirmation_unavailable)?;
        if !window.is_visible().unwrap_or(false) {
            return Err(confirmation_unavailable());
        }
        let (sender, receiver) = mpsc::channel();
        self.app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title(format!("为应用 {} 选择工作区目录", self.owner))
            .pick_folder(move |path| {
                let _ = sender.send(path);
            });
        self.wait(receiver)?
            .map(|path| {
                path.into_path()
                    .map_err(|_| error("INVALID_ARGUMENT", "请选择本地工作区目录"))
            })
            .transpose()
    }
    fn confirm_share(&self, path: &Path, applications: &[String]) -> Result<bool> {
        self.check_active()?;
        let window = self
            .app
            .get_webview_window("main")
            .ok_or_else(confirmation_unavailable)?;
        if !window.is_visible().unwrap_or(false) {
            return Err(confirmation_unavailable());
        }
        let (sender, receiver) = mpsc::channel();
        let members = applications
            .iter()
            .map(|id| format!("• {id}"))
            .collect::<Vec<_>>()
            .join("\n");
        self.app.dialog().message(format!(
            "应用 {} 请求使用以下工作区：\n{}\n\n目录中登记的应用：\n{}\n\n允许后，该应用可按现有沙箱和权限档位使用此目录，包括读取、修改和删除其中的文件及聊天记录。共享文件可能互相影响，请确认你信任该应用。",
            self.owner, path.display(), if members.is_empty() { "（无）" } else { &members }
        )).title("共享应用工作区").parent(&window).kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("允许使用".into(), "取消".into()))
            .show(move |approved| { let _ = sender.send(approved); });
        self.wait(receiver)
    }
}

fn confirmation_unavailable() -> Value {
    error(
        "CONFIRMATION_UNAVAILABLE",
        "当前宿主无法选择目录或确认共享，请从应用页面操作",
    )
}
fn storage_error(_: impl std::fmt::Display) -> Value {
    error("STORAGE_ERROR", "应用工作区登记读写失败")
}
fn unavailable(message: &str) -> Value {
    error("WORKSPACE_UNAVAILABLE", message)
}
fn marker_error() -> Value {
    error(
        "WORKSPACE_MARKER_INVALID",
        "工作区标识缺失、损坏或与登记不一致；请保留原文件并检查目录",
    )
}

pub(super) fn request_at(
    root: &Path,
    owner: &str,
    request: Request,
    interaction: &dyn WorkspaceInteraction,
) -> Result<Value> {
    let invalid = || error("INVALID_ARGUMENT", "工作区方法或参数无效");
    match request.method.as_str() {
        "workspaces.create" => {
            let args = request
                .params
                .as_ref()
                .and_then(Value::as_object)
                .ok_or_else(invalid)?;
            if args.keys().any(|key| key != "name" && key != "path") {
                return Err(invalid());
            }
            let name = args
                .get("name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|name| !name.is_empty() && name.len() <= 512)
                .ok_or_else(invalid)?;
            let path = match args.get("path") {
                Some(value) => PathBuf::from(
                    value
                        .as_str()
                        .map(str::trim)
                        .filter(|path| !path.is_empty() && path.len() <= 32 * 1024)
                        .ok_or_else(invalid)?,
                ),
                None => match interaction.pick_directory()? {
                    Some(path) => path,
                    None => return Ok(Value::Null),
                },
            };
            interaction.check_active()?;
            Ok(create(root, owner, name, &path, interaction)?
                .map(|workspace| json!(workspace))
                .unwrap_or(Value::Null))
        }
        "workspaces.list" => {
            if request.params.is_some() {
                return Err(invalid());
            }
            if !load(root, owner)?
                .iter()
                .any(|workspace| workspace.is_default)
            {
                let path = application_data_root(root, owner).join("workspace");
                // list never opens a chooser or joins an untrusted marker after a data reset.
                struct DefaultInteraction<'a>(&'a dyn WorkspaceInteraction);
                impl WorkspaceInteraction for DefaultInteraction<'_> {
                    fn check_active(&self) -> Result<()> {
                        self.0.check_active()
                    }
                }
                create(
                    root,
                    owner,
                    "默认工作区",
                    &path,
                    &DefaultInteraction(interaction),
                )?;
            }
            Ok(json!(load(root, owner)?))
        }
        "workspaces.get" => {
            let args = request
                .params
                .as_ref()
                .and_then(Value::as_object)
                .ok_or_else(invalid)?;
            let id = args
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .ok_or_else(invalid)?;
            if args.len() != 1 {
                return Err(invalid());
            }
            let workspace = load(root, owner)?
                .into_iter()
                .find(|workspace| workspace.id == id)
                .ok_or_else(|| error("WORKSPACE_NOT_FOUND", "当前应用未登记此工作区"))?;
            validate_record(&workspace, owner)?;
            Ok(json!(workspace))
        }
        _ => Err(invalid()),
    }
}

fn load_from(conn: &Connection) -> Result<Vec<Workspace>> {
    let mut query = conn
        .prepare(
            "SELECT id,name,path,is_default FROM application_workspaces ORDER BY is_default DESC,rowid",
        )
        .map_err(storage_error)?;
    let rows = query
        .query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                is_default: row.get(3)?,
            })
        })
        .map_err(storage_error)?;
    rows.collect::<std::result::Result<Vec<_>, _>>()
        .map_err(storage_error)
}

fn load(root: &Path, owner: &str) -> Result<Vec<Workspace>> {
    match open_database(root, owner, false).map_err(storage_error)? {
        Some(conn) => load_from(&conn),
        None => Ok(vec![]),
    }
}

fn normalize(path: &Path) -> Result<PathBuf> {
    crate::db::setup::normalize_workspace_path(path)
        .map_err(|message| error("INVALID_ARGUMENT", &message))
}

fn marker_path(path: &Path) -> PathBuf {
    path.join(".isle").join(MARKER_NAME)
}

fn read_marker(path: &Path) -> Result<Option<Marker>> {
    check_paths(path, &path.join(".isle")).map_err(|_| marker_error())?;
    let file = marker_path(path);
    check_file(&file).map_err(|_| marker_error())?;
    let metadata = match fs::metadata(&file) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(marker_error()),
    };
    if metadata.len() > MAX_MARKER_BYTES {
        return Err(marker_error());
    }
    let marker: Marker = serde_json::from_slice(&fs::read(&file).map_err(|_| marker_error())?)
        .map_err(|_| marker_error())?;
    if marker.version != 1
        || Uuid::parse_str(&marker.id).is_err()
        || marker.applications.len() > 1024
        || marker
            .applications
            .iter()
            .any(|id| id.is_empty() || id.len() > 512 || id.chars().any(char::is_control))
        || marker
            .applications
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != marker.applications.len()
    {
        return Err(marker_error());
    }
    Ok(Some(marker))
}

fn validate_record(workspace: &Workspace, owner: &str) -> Result<()> {
    let path = Path::new(&workspace.path);
    if !path.is_dir() || normalize(path).ok().as_deref() != Some(path) {
        return Err(unavailable("已登记的工作区目录丢失、移动或不可访问"));
    }
    let marker = read_marker(path)?.ok_or_else(marker_error)?;
    if marker.id != workspace.id || !marker.applications.iter().any(|id| id == owner) {
        return Err(marker_error());
    }
    Ok(())
}

fn existing(
    root: &Path,
    owner: &str,
    path: &Path,
    marker: Option<&Marker>,
) -> Result<Option<Workspace>> {
    let records = load(root, owner)?;
    if let Some(record) = records
        .iter()
        .find(|record| Path::new(&record.path) == path)
    {
        validate_record(record, owner)?;
        return Ok(Some(record.clone()));
    }
    // A moved/copied marker cannot silently rebind an existing local workspace ID.
    if marker.is_some_and(|marker| records.iter().any(|record| record.id == marker.id)) {
        return Err(marker_error());
    }
    Ok(None)
}

fn lock(path: &Path) -> Result<File> {
    check_file(path).map_err(storage_error)?;
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path).map_err(storage_error)?;
    let until = Instant::now() + Duration::from_secs(5);
    loop {
        match file.try_lock() {
            Ok(()) => return Ok(file),
            Err(std::fs::TryLockError::WouldBlock) if Instant::now() < until => {
                std::thread::sleep(Duration::from_millis(10))
            }
            Err(_) => return Err(unavailable("工作区正在被其他操作更新，请稍后重试")),
        }
    }
}

fn write_marker(path: &Path, marker: &Marker) -> Result<()> {
    let contents = serde_json::to_vec_pretty(marker).map_err(storage_error)?;
    if contents.len() > MAX_MARKER_BYTES as usize {
        return Err(marker_error());
    }
    let temporary = path
        .join(".isle")
        .join(format!("workspace-{}.tmp", Uuid::now_v7()));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&contents)?;
        file.sync_all()?;
        fs::rename(&temporary, marker_path(path))?;
        #[cfg(unix)]
        File::open(path.join(".isle"))?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.map_err(storage_error)
}

fn create(
    root: &Path,
    owner: &str,
    name: &str,
    selected: &Path,
    interaction: &dyn WorkspaceInteraction,
) -> Result<Option<Workspace>> {
    let path = normalize(selected)?;
    let snapshot = read_marker(&path)?;
    if let Some(record) = existing(root, owner, &path, snapshot.as_ref())? {
        return Ok(Some(record));
    }
    if let Some(marker) = &snapshot {
        if !interaction.confirm_share(&path, &marker.applications)? {
            return Ok(None);
        }
    }
    interaction.check_active()?;
    check_paths(root, root).map_err(storage_error)?;
    fs::create_dir_all(root).map_err(storage_error)?;
    let _registry_lock = lock(&root.join(".workspaces.lock"))?;
    if normalize(selected)? != path {
        return Err(unavailable("所选目录已变化，请重新选择"));
    }
    if let Some(record) = existing(root, owner, &path, read_marker(&path)?.as_ref())? {
        return Ok(Some(record));
    }
    if read_marker(&path)? != snapshot {
        return Err(unavailable(
            "工作区成员或标识已变化，请重新发起以确认最新信息",
        ));
    }
    fs::create_dir_all(path.join(".isle")).map_err(|_| unavailable("无法创建工作区目录"))?;
    check_paths(&path, &path.join(".isle")).map_err(|_| marker_error())?;
    let _marker_lock = lock(&path.join(".isle").join("workspace.lock"))?;
    if read_marker(&path)? != snapshot {
        return Err(unavailable(
            "工作区成员或标识已变化，请重新发起以确认最新信息",
        ));
    }
    interaction.check_active()?;
    let mut conn = open_database(root, owner, true)
        .map_err(storage_error)?
        .ok_or_else(|| storage_error("missing database"))?;
    let tx = conn.transaction().map_err(storage_error)?;
    let mut marker = snapshot.unwrap_or_else(|| Marker {
        version: 1,
        id: Uuid::now_v7().to_string(),
        applications: vec![],
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        metadata: BTreeMap::new(),
    });
    if !marker.applications.iter().any(|id| id == owner) {
        marker.applications.push(owner.into());
    }
    let workspace = Workspace {
        id: marker.id.clone(),
        name: name.into(),
        path: path.to_string_lossy().into_owned(),
        is_default: path == normalize(&application_data_root(root, owner).join("workspace"))?,
    };
    tx.execute(
        "INSERT INTO application_workspaces(id,name,path,is_default) VALUES(?1,?2,?3,?4)",
        params![
            workspace.id,
            workspace.name,
            workspace.path,
            workspace.is_default
        ],
    )
    .map_err(storage_error)?;
    for suffix in ["", "-journal", "-wal", "-shm"] {
        check_file(&path.join(format!("workspace.db{suffix}")))
            .map_err(|_| unavailable("工作区数据库文件不可用"))?;
    }
    crate::db::setup::initialize_workspace_directory(&path)
        .map_err(|_| unavailable("工作区初始化失败，请检查目录和原有数据库"))?;
    write_marker(&path, &marker)?;
    tx.commit().map_err(storage_error)?;
    Ok(Some(workspace))
}

#[cfg(test)]
mod tests;
