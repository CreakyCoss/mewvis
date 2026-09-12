use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::AppHandle;
use uuid::Uuid;

use super::plugin_workspaces::{self, WorkspaceInteraction};
use super::plugins::{self, PluginPermission, PluginPermissionStatus};

const MAX_REQUEST_BYTES: usize = 256 * 1024;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const APPLICATION_ID: i32 = 0x49534c50;

pub(crate) fn error(code: &str, message: &str) -> Value {
    json!({"ok": false, "error": {"code": code, "message": message}})
}

#[derive(Clone, Default)]
pub(crate) struct PluginDataHost {
    connections: Arc<Mutex<HashMap<String, String>>>,
}

impl PluginDataHost {
    pub(crate) fn connect(&self, app: &AppHandle, plugin_id: &str) -> Result<String, Value> {
        authorize(app, plugin_id, None)?;
        self.bind(plugin_id)
    }

    fn bind(&self, plugin_id: &str) -> Result<String, Value> {
        let mut connections = self
            .connections
            .lock()
            .map_err(|_| error("INTERNAL_ERROR", "插件数据连接不可用"))?;
        if connections.len() >= 4096 {
            return Err(error("INTERNAL_ERROR", "插件数据连接过多"));
        }
        let connection = Uuid::now_v7().to_string();
        connections.insert(connection.clone(), plugin_id.to_string());
        Ok(connection)
    }

    pub(crate) fn disconnect(&self, connection: &str) {
        if let Ok(mut connections) = self.connections.lock() {
            connections.remove(connection);
        }
    }

    pub(crate) fn revoke(&self, plugin_id: &str) {
        if let Ok(mut connections) = self.connections.lock() {
            connections.retain(|_, owner| owner != plugin_id);
        }
    }

    fn owner(&self, connection: &str) -> Result<String, Value> {
        self.connections
            .lock()
            .ok()
            .and_then(|connections| connections.get(connection).cloned())
            .ok_or_else(|| error("PERMISSION_DENIED", "插件数据连接已失效"))
    }

    pub(crate) fn request(&self, app: &AppHandle, connection: &str, request: Value) -> Value {
        let owner = match self.owner(connection) {
            Ok(owner) => owner,
            Err(error) => return error,
        };
        let permission = match permission_for_request(&request) {
            Ok(permission) => permission,
            Err(error) => return error,
        };
        let check = || {
            if self.owner(connection)? != owner {
                return Err(error("PERMISSION_DENIED", "插件数据连接已失效"));
            }
            authorize(app, &owner, Some(permission))
        };
        if let Err(error) = check() {
            return error;
        }
        let root = match plugins::settings_location(app) {
            Ok(root) => PathBuf::from(root),
            Err(_) => return error("STORAGE_ERROR", "插件数据目录不可用"),
        };
        let interaction = plugin_workspaces::DesktopInteraction::new(app, &owner, &check);
        dispatch_at(&root, &owner, &[permission], request, &interaction)
    }
}

fn authorize(
    app: &AppHandle,
    plugin_id: &str,
    permission: Option<PluginPermission>,
) -> Result<(), Value> {
    let catalog =
        plugins::list_plugins(app).map_err(|_| error("INTERNAL_ERROR", "无法读取插件权限"))?;
    let allowed = catalog.iter().any(|plugin| {
        plugin.id == plugin_id
            && plugin.enabled
            && plugin.permission_status == PluginPermissionStatus::Declared
            && match permission {
                Some(permission) => plugin.permissions.contains(&permission),
                None => {
                    plugin.permissions.contains(&PluginPermission::PluginData)
                        || plugin
                            .permissions
                            .contains(&PluginPermission::PluginWorkspaces)
                }
            }
    });
    if allowed {
        Ok(())
    } else {
        Err(error(
            "PERMISSION_DENIED",
            "插件未启用或未声明所需的 SDK 权限",
        ))
    }
}

fn permission_for_request(request: &Value) -> Result<PluginPermission, Value> {
    let request = decode(request.clone())?;
    match request.method.as_str() {
        "storage.getItem" | "storage.setItem" | "storage.removeItem" | "storage.clear"
        | "storage.keys" => Ok(PluginPermission::PluginData),
        "workspaces.create" | "workspaces.list" | "workspaces.get" => {
            Ok(PluginPermission::PluginWorkspaces)
        }
        _ => Err(error("INVALID_ARGUMENT", "插件数据方法无效")),
    }
}

pub(super) fn dispatch_at(
    root: &Path,
    owner: &str,
    permissions: &[PluginPermission],
    request: Value,
    interaction: &dyn WorkspaceInteraction,
) -> Value {
    let permission = match permission_for_request(&request) {
        Ok(permission) => permission,
        Err(error) => return error,
    };
    if owner.is_empty() || !permissions.contains(&permission) {
        return error("PERMISSION_DENIED", "插件未声明所需的 SDK 权限");
    }
    if let Err(error) = interaction.check_active() {
        return error;
    }
    if permission == PluginPermission::PluginWorkspaces {
        match plugin_workspaces::request_at(root, owner, decode(request).unwrap(), interaction) {
            Ok(value) if value.to_string().len() <= MAX_RESPONSE_BYTES => {
                json!({"ok":true,"value":value})
            }
            Ok(_) => error("STORAGE_ERROR", "插件数据响应超过 4 MiB"),
            Err(error) => error,
        }
    } else {
        request_at(root, owner, true, request)
    }
}

fn authorize_enabled(allowed: bool) -> Result<(), Value> {
    if allowed {
        Ok(())
    } else {
        Err(error(
            "PERMISSION_DENIED",
            "插件未启用或未声明 plugin-data 权限",
        ))
    }
}

/** Shared namespace layout used by configuration, SDK data and ordinary plugin files. */
pub(crate) fn plugin_data_root(root: &Path, plugin_id: &str) -> PathBuf {
    super::plugin_paths::plugin_directory(root, plugin_id)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Request {
    version: u8,
    pub method: String,
    pub params: Option<Value>,
}

enum Operation {
    Get(String),
    Set(String, Value),
    Remove(String),
    Clear,
    Keys,
}

fn decode(request: Value) -> Result<Request, Value> {
    if request.to_string().len() > MAX_REQUEST_BYTES {
        return Err(error("INVALID_ARGUMENT", "插件数据请求超过 256 KiB"));
    }
    let request: Request = serde_json::from_value(request)
        .map_err(|_| error("INVALID_ARGUMENT", "插件数据请求格式无效"))?;
    if request.version != 1 {
        return Err(error("CAPABILITY_UNAVAILABLE", "不支持的插件数据协议版本"));
    }
    Ok(request)
}

fn parse(request: Value) -> Result<Operation, Value> {
    let request = decode(request)?;
    let invalid = || error("INVALID_ARGUMENT", "插件存储方法或参数无效");
    match request.method.as_str() {
        "storage.clear" | "storage.keys" => {
            if request.params.is_some() {
                return Err(invalid());
            }
            Ok(if request.method == "storage.clear" {
                Operation::Clear
            } else {
                Operation::Keys
            })
        }
        "storage.getItem" | "storage.setItem" | "storage.removeItem" => {
            let params = request
                .params
                .as_ref()
                .and_then(Value::as_object)
                .ok_or_else(invalid)?;
            let key = params
                .get("key")
                .and_then(Value::as_str)
                .ok_or_else(invalid)?;
            if key.len() > 4096 {
                return Err(error("INVALID_ARGUMENT", "插件存储键超过 4096 字节"));
            }
            let set = request.method == "storage.setItem";
            if params.len() != if set { 2 } else { 1 } {
                return Err(invalid());
            }
            Ok(match request.method.as_str() {
                "storage.getItem" => Operation::Get(key.into()),
                "storage.removeItem" => Operation::Remove(key.into()),
                _ => {
                    let value = params.get("value").ok_or_else(invalid)?;
                    validate_json(value, 0).map_err(|_| invalid())?;
                    Operation::Set(key.into(), value.clone())
                }
            })
        }
        _ => Err(invalid()),
    }
}

fn validate_json(value: &Value, depth: usize) -> Result<(), ()> {
    if depth > 100 {
        return Err(());
    }
    match value {
        Value::Array(values) => values
            .iter()
            .try_for_each(|value| validate_json(value, depth + 1)),
        Value::Object(values) => values
            .values()
            .try_for_each(|value| validate_json(value, depth + 1)),
        _ => Ok(()),
    }
}

fn request_at(root: &Path, plugin_id: &str, allowed: bool, request: Value) -> Value {
    if let Err(response) = authorize_enabled(allowed) {
        return response;
    }
    if plugin_id.is_empty() {
        return error("PERMISSION_DENIED", "插件身份无效");
    }
    let operation = match parse(request) {
        Ok(operation) => operation,
        Err(response) => return response,
    };
    match execute(root, plugin_id, operation) {
        Ok(value) if value.to_string().len() <= MAX_RESPONSE_BYTES => {
            json!({"ok": true, "value": value})
        }
        Ok(_) => error("STORAGE_ERROR", "插件数据响应超过 4 MiB"),
        Err(_) => error("STORAGE_ERROR", "插件业务数据读写失败"),
    }
}

fn execute(
    root: &Path,
    plugin_id: &str,
    operation: Operation,
) -> Result<Value, Box<dyn std::error::Error>> {
    let Some(conn) = open_database(root, plugin_id, matches!(operation, Operation::Set(..)))?
    else {
        return Ok(if matches!(operation, Operation::Keys) {
            json!([])
        } else {
            Value::Null
        });
    };
    Ok(match operation {
        Operation::Get(key) => {
            let value: Option<String> = conn
                .query_row("SELECT value FROM plugin_kv WHERE key=?1", [key], |row| {
                    row.get(0)
                })
                .optional()?;
            match value {
                Some(value) => serde_json::from_str(&value)?,
                None => Value::Null,
            }
        }
        Operation::Set(key, value) => {
            conn.execute("INSERT INTO plugin_kv(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, value.to_string()])?;
            Value::Null
        }
        Operation::Remove(key) => {
            conn.execute("DELETE FROM plugin_kv WHERE key=?1", [key])?;
            Value::Null
        }
        Operation::Clear => {
            conn.execute("DELETE FROM plugin_kv", [])?;
            Value::Null
        }
        Operation::Keys => {
            let mut statement = conn.prepare("SELECT key FROM plugin_kv ORDER BY key")?;
            let keys = statement
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            json!(keys)
        }
    })
}

pub(super) fn open_database(
    root: &Path,
    plugin_id: &str,
    create: bool,
) -> Result<Option<Connection>, Box<dyn std::error::Error>> {
    let directory = plugin_data_root(root, plugin_id);
    let database = directory.join("storage.sqlite");
    check_paths(root, &directory)?;
    for suffix in ["", "-journal", "-wal", "-shm"] {
        check_file(&directory.join(format!("storage.sqlite{suffix}")))?;
    }
    if !database.exists() && !create {
        return Ok(None);
    }
    if !directory.exists() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            fs::DirBuilder::new()
                .recursive(true)
                .mode(0o700)
                .create(&directory)?;
        }
        #[cfg(not(unix))]
        fs::create_dir_all(&directory)?;
    }
    if !database.exists() {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        if let Err(error) = options.open(&database) {
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(error.into());
            }
        }
    }
    check_paths(root, &directory)?;
    check_file(&database)?;
    let conn = Connection::open(&database)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let application: i32 = conn.query_row("PRAGMA application_id", [], |row| row.get(0))?;
    if version > 2 || (application != 0 && application != APPLICATION_ID) {
        return Err("插件数据库版本不可用".into());
    }
    conn.execute_batch("PRAGMA synchronous=FULL;")?;
    if version < 2 {
        conn.execute_batch(&format!(
            "BEGIN IMMEDIATE;
             CREATE TABLE IF NOT EXISTS plugin_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS plugin_workspaces (
                 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, path TEXT UNIQUE NOT NULL,
                 is_default INTEGER NOT NULL CHECK(is_default IN (0,1))
             );
             CREATE UNIQUE INDEX IF NOT EXISTS plugin_workspace_default ON plugin_workspaces(is_default) WHERE is_default=1;
             PRAGMA application_id={APPLICATION_ID};
             PRAGMA user_version=2;
             COMMIT;"
        ))?;
    }
    Ok(Some(conn))
}

pub(super) fn check_paths(root: &Path, directory: &Path) -> std::io::Result<()> {
    for path in directory
        .ancestors()
        .take_while(|path| *path != root.parent().unwrap_or(root))
    {
        match fs::symlink_metadata(path) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(std::io::Error::other("插件数据目录不能重定向"))
            }
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    Ok(())
}

pub(super) fn check_file(path: &Path) -> std::io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                return Err(std::io::Error::other("插件数据库文件不能重定向"));
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if metadata.nlink() != 1 {
                    return Err(std::io::Error::other("插件数据库不能使用硬链接"));
                }
            }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            Self(std::env::temp_dir().join(format!("isle-storage-{}", Uuid::now_v7())))
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn call(root: &Path, owner: &str, method: &str, params: Option<Value>) -> Value {
        let mut request = json!({"version":1,"method":method});
        if let Some(params) = params {
            request["params"] = params;
        }
        request_at(root, owner, true, request)
    }

    #[test]
    fn persists_across_connections_and_isolates_owners() {
        let f = Fixture::new();
        for owner in ["@example/one", "@example/two"] {
            assert_eq!(
                call(
                    &f.0,
                    owner,
                    "storage.setItem",
                    Some(json!({"key":"state","value":{"owner":owner,"nested":[null,1,true]}}))
                )["ok"],
                true
            );
        }
        for owner in ["@example/one", "@example/two"] {
            assert_eq!(
                call(&f.0, owner, "storage.getItem", Some(json!({"key":"state"})))["value"]
                    ["owner"],
                owner
            );
        }
        assert_ne!(plugin_data_root(&f.0, "a/b"), plugin_data_root(&f.0, "a-b"));
        assert!(plugin_data_root(&f.0, "../../outside").starts_with(&f.0));
    }

    #[test]
    fn denied_and_invalid_calls_have_no_filesystem_side_effects() {
        let f = Fixture::new();
        assert_eq!(
            request_at(
                &f.0,
                "one",
                false,
                json!({"version":1,"method":"storage.setItem","params":{"key":"k","value":1}})
            )["error"]["code"],
            "PERMISSION_DENIED"
        );
        for request in [
            json!({"version":1,"method":"storage.clear","pluginId":"two"}),
            json!({"version":1,"method":"storage.getItem","params":{"key":"k","path":"/other"}}),
        ] {
            assert_eq!(
                request_at(&f.0, "one", true, request)["error"]["code"],
                "INVALID_ARGUMENT"
            );
        }
        assert!(!f.0.exists());
        assert_eq!(
            call(
                &f.0,
                "one",
                "storage.getItem",
                Some(json!({"key":"missing"}))
            )["value"],
            Value::Null
        );
        assert!(!f.0.exists());
    }

    #[test]
    fn clear_only_deletes_business_keys_and_handles_arbitrary_keys() {
        let f = Fixture::new();
        for key in ["", "__proto__", "workspaces", "'; DROP TABLE plugin_kv; --"] {
            assert_eq!(
                call(
                    &f.0,
                    "one",
                    "storage.setItem",
                    Some(json!({"key":key,"value":false}))
                )["ok"],
                true
            );
        }
        let root = plugin_data_root(&f.0, "one");
        fs::write(root.join("settings.yaml"), "keep: true").unwrap();
        fs::create_dir(root.join("workspace")).unwrap();
        let conn = Connection::open(root.join("storage.sqlite")).unwrap();
        conn.execute_batch("CREATE TABLE workspace_registry (id TEXT); INSERT INTO workspace_registry VALUES ('keep');").unwrap();
        drop(conn);
        assert_eq!(
            call(&f.0, "one", "storage.keys", None)["value"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(call(&f.0, "one", "storage.clear", None)["ok"], true);
        assert_eq!(call(&f.0, "one", "storage.keys", None)["value"], json!([]));
        assert_eq!(
            fs::read_to_string(root.join("settings.yaml")).unwrap(),
            "keep: true"
        );
        assert!(root.join("workspace").is_dir());
        let conn = Connection::open(root.join("storage.sqlite")).unwrap();
        assert_eq!(
            conn.query_row("SELECT id FROM workspace_registry", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "keep"
        );
    }

    #[test]
    fn connection_binding_cannot_be_reused_after_revocation() {
        let host = PluginDataHost::default();
        let one = host.bind("one").unwrap();
        let two = host.bind("two").unwrap();
        assert_eq!(host.owner(&one).unwrap(), "one");
        host.revoke("one");
        assert!(host.owner(&one).is_err());
        assert_eq!(host.owner(&two).unwrap(), "two");
        host.disconnect(&two);
        assert!(host.owner(&two).is_err());
        assert!(PluginDataHost::default().owner(&one).is_err());
    }

    #[test]
    fn concurrent_writers_keep_distinct_keys() {
        let f = Fixture::new();
        let workers: Vec<_> = (0..8)
            .map(|index| {
                let root = f.0.clone();
                std::thread::spawn(move || {
                    call(
                        &root,
                        "one",
                        "storage.setItem",
                        Some(json!({"key":index.to_string(),"value":index})),
                    )
                })
            })
            .collect();
        for worker in workers {
            assert_eq!(worker.join().unwrap()["ok"], true);
        }
        assert_eq!(
            call(&f.0, "one", "storage.keys", None)["value"]
                .as_array()
                .unwrap()
                .len(),
            8
        );
    }

    #[test]
    #[ignore = "requires built PluginHost and Node; included by test:plugin-host:data"]
    fn native_sdk_uses_sqlite_and_recovers_after_process_restart() {
        use std::io::{BufRead, BufReader, Write};
        use std::process::{Child, ChildStdin, Command, Stdio};
        use std::sync::mpsc;
        struct Node {
            child: Child,
            input: ChildStdin,
            output: mpsc::Receiver<Value>,
            host: PluginDataHost,
            root: PathBuf,
            tokens: Vec<String>,
            sequence: u64,
        }
        impl Drop for Node {
            fn drop(&mut self) {
                for token in &self.tokens {
                    self.host.disconnect(token);
                }
                let _ = self.child.kill();
                let _ = self.child.wait();
            }
        }
        impl Node {
            fn rpc(&mut self, method: &str, params: Value) -> Value {
                self.sequence += 1;
                let id = self.sequence;
                writeln!(
                    self.input,
                    "{}",
                    json!({"id":id,"method":method,"params":params})
                )
                .unwrap();
                self.input.flush().unwrap();
                loop {
                    let message = self
                        .output
                        .recv_timeout(Duration::from_secs(15))
                        .expect("plugin data RPC timed out");
                    if message["type"] == "plugin-data:request" {
                        let response = match self
                            .host
                            .owner(message["connection"].as_str().unwrap_or(""))
                        {
                            Ok(owner) => dispatch_at(
                                &self.root,
                                &owner,
                                if owner == "data-only" {
                                    &[PluginPermission::PluginData]
                                } else {
                                    &[
                                        PluginPermission::PluginData,
                                        PluginPermission::PluginWorkspaces,
                                    ]
                                },
                                message["request"].clone(),
                                &plugin_workspaces::NoInteraction,
                            ),
                            Err(response) => response,
                        };
                        writeln!(self.input,"{}",json!({"type":"plugin-data:response","id":message["id"],"response":response})).unwrap();
                        self.input.flush().unwrap();
                    } else if message["id"] == id {
                        return message;
                    }
                }
            }
            fn start(root: &Path) -> Self {
                let desktop = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
                let service = desktop.join("agent-runtime/dist/plugin-host/service.mjs");
                assert!(
                    service.is_file(),
                    "run pnpm --filter desktop test:plugin-host:data"
                );
                let node = desktop.join(if cfg!(windows) {
                    "agent-runtime/dist/node.exe"
                } else {
                    "agent-runtime/dist/node"
                });
                let mut child = Command::new(node)
                    .arg(service)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::inherit())
                    .spawn()
                    .unwrap();
                let input = child.stdin.take().unwrap();
                let stdout = child.stdout.take().unwrap();
                let (sender, output) = mpsc::channel();
                std::thread::spawn(move || {
                    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                        if let Ok(value) = serde_json::from_str(&line) {
                            if sender.send(value).is_err() {
                                break;
                            }
                        }
                    }
                });
                let mut instance = Self {
                    child,
                    input,
                    output,
                    host: PluginDataHost::default(),
                    root: root.into(),
                    tokens: vec![],
                    sequence: 0,
                };
                let mut plugins = vec![];
                for owner in ["one", "two", "data-only", "denied"] {
                    let package = root.join("fixtures").join(owner);
                    fs::create_dir_all(&package).unwrap();
                    fs::write(
                        package.join("package.json"),
                        json!({"name":owner,"type":"module"}).to_string(),
                    )
                    .unwrap();
                    fs::write(package.join("index.js"),format!(r#"
                        export const inject = ['tools','storage','workspaces'];
                        export function apply(ctx) {{
                            ctx.tools.register({{
                                name: '{owner}_storage', description: 'storage fixture', parameters: {{type:'object'}},
                                output: {{schema: {{type:'object'}}, render: (_args,value) => [{{type:'text',text:JSON.stringify(value)}}]}},
                                async execute(args) {{
                                    try {{
                                        const value = args.method.startsWith('workspaces.')
                                            ? await ctx.workspaces[args.method.slice(11)](args.value ?? args.key)
                                            : await ctx.storage[args.method](args.key,args.value);
                                        return {{value: value ?? null}};
                                    }}
                                    catch (error) {{ return {{error:error.code}}; }}
                                }}
                            }});
                        }}
                    "#)).unwrap();
                    let token = if owner != "denied" {
                        let token = instance.host.bind(owner).unwrap();
                        instance.tokens.push(token.clone());
                        Some(token)
                    } else {
                        None
                    };
                    plugins.push(json!({"kind":"isle","id":owner,"name":owner,"version":"1.0.0","description":"fixture","source":"installed",
                        "entry":package.join("index.js"),"packageRoot":package,"permissions":if owner == "denied" {vec![]} else if owner == "data-only" {vec!["plugin-data"]} else {vec!["plugin-data","plugin-workspaces"]},
                        "permissionStatus":"declared","dataConnection":token}));
                }
                let response =
                    instance.rpc("configure", json!({"settingsPath":root,"plugins":plugins}));
                assert!(response.get("error").is_none(), "{response}");
                for plugin in response["result"]["plugins"].as_array().unwrap() {
                    assert!(plugin["error"].is_null(), "{plugin}");
                }
                instance
            }
            fn storage(&mut self, owner: &str, method: &str, key: &str, value: Value) -> Value {
                let response = self.rpc("execute",json!({"pluginId":owner,"toolName":format!("{owner}_storage"),"arguments":{"method":method,"key":key,"value":value}}));
                assert!(response.get("error").is_none(), "{response}");
                response["result"]["value"].clone()
            }
        }
        let f = Fixture::new();
        let mut node = Node::start(&f.0);
        assert_eq!(
            node.storage("one", "setItem", "state", json!({"cursor":120}))["value"],
            Value::Null
        );
        assert_eq!(
            node.storage("two", "getItem", "state", Value::Null)["value"],
            Value::Null
        );
        assert_eq!(
            node.storage("denied", "setItem", "state", json!("no"))["error"],
            "PERMISSION_DENIED"
        );
        assert!(!plugin_data_root(&f.0, "denied").exists());
        let created = node.storage(
            "one",
            "workspaces.create",
            "",
            json!({"name":"Native project","path":f.0.join("project")}),
        );
        assert!(created["value"]["id"].is_string(), "{created}");
        assert_eq!(
            node.storage("two", "workspaces.get", "", created["value"]["id"].clone())["error"],
            "WORKSPACE_NOT_FOUND"
        );
        assert_eq!(
            node.storage("data-only", "workspaces.list", "", Value::Null)["error"],
            "PERMISSION_DENIED"
        );
        assert!(!plugin_data_root(&f.0, "data-only").exists());
        node.host.revoke("one");
        assert_eq!(
            node.storage("one", "getItem", "state", Value::Null)["error"],
            "PERMISSION_DENIED"
        );
        drop(node);
        let mut reopened = Node::start(&f.0);
        assert_eq!(
            reopened.storage("one", "workspaces.get", "", created["value"]["id"].clone())["value"],
            created["value"]
        );

        assert_eq!(
            reopened.storage("one", "getItem", "state", Value::Null)["value"],
            json!({"cursor":120})
        );
        assert_eq!(
            reopened.storage("two", "getItem", "state", Value::Null)["value"],
            Value::Null
        );
    }

    #[cfg(unix)]
    #[test]
    fn symlink_and_hardlink_redirection_are_rejected() {
        use std::os::unix::fs::symlink;
        let f = Fixture::new();
        let directory = plugin_data_root(&f.0, "one");
        fs::create_dir_all(&directory).unwrap();
        let other = f.0.join("other.sqlite");
        fs::write(&other, "untouched").unwrap();
        let database = directory.join("storage.sqlite");
        symlink(&other, &database).unwrap();
        assert_eq!(
            call(
                &f.0,
                "one",
                "storage.setItem",
                Some(json!({"key":"x","value":1}))
            )["error"]["code"],
            "STORAGE_ERROR"
        );
        fs::remove_file(&database).unwrap();
        fs::hard_link(&other, &database).unwrap();
        assert_eq!(
            call(&f.0, "one", "storage.clear", None)["error"]["code"],
            "STORAGE_ERROR"
        );
        assert_eq!(fs::read_to_string(&other).unwrap(), "untouched");
    }
}
