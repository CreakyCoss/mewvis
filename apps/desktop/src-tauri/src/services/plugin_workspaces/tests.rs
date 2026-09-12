use super::super::{plugin_data::dispatch_at, plugins::PluginPermission};
use super::*;
use std::{
    cell::{Cell, RefCell},
    sync::{Arc, Barrier},
};

struct Fixture {
    base: PathBuf,
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let base = std::env::temp_dir().join(format!("isle-workspaces-{}", Uuid::now_v7()));
        fs::create_dir_all(&base).unwrap();
        let base = fs::canonicalize(base).unwrap();
        Self {
            root: base.join("plugins"),
            base,
        }
    }
    fn call(
        &self,
        owner: &str,
        method: &str,
        params: Option<Value>,
        interaction: &dyn WorkspaceInteraction,
    ) -> Value {
        call(
            &self.root,
            owner,
            &[
                PluginPermission::PluginWorkspaces,
                PluginPermission::PluginData,
            ],
            method,
            params,
            interaction,
        )
    }
    fn create(&self, owner: &str, path: &Path, interaction: &dyn WorkspaceInteraction) -> Value {
        self.call(
            owner,
            "workspaces.create",
            Some(json!({"name":"project","path":path})),
            interaction,
        )
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.base);
    }
}

fn call(
    root: &Path,
    owner: &str,
    permissions: &[PluginPermission],
    method: &str,
    params: Option<Value>,
    interaction: &dyn WorkspaceInteraction,
) -> Value {
    let mut request = json!({"version":1,"method":method});
    if let Some(params) = params {
        request["params"] = params;
    }
    dispatch_at(root, owner, permissions, request, interaction)
}

#[derive(Default)]
struct Interaction {
    selected: Option<PathBuf>,
    approved: bool,
    prompts: Cell<usize>,
    members: RefCell<Vec<String>>,
}
impl WorkspaceInteraction for Interaction {
    fn pick_directory(&self) -> Result<Option<PathBuf>> {
        Ok(self.selected.clone())
    }
    fn confirm_share(&self, _: &Path, plugins: &[String]) -> Result<bool> {
        self.prompts.set(self.prompts.get() + 1);
        self.members.replace(plugins.to_vec());
        Ok(self.approved)
    }
}

#[test]
fn permissions_are_independent_and_checked_before_files_or_picker() {
    let f = Fixture::new();
    let interaction = NoInteraction;
    for (permissions, method, params) in [
        (vec![], "workspaces.list", None),
        (
            vec![PluginPermission::PluginData],
            "workspaces.create",
            Some(json!({"name":"denied"})),
        ),
        (
            vec![PluginPermission::PluginWorkspaces],
            "storage.setItem",
            Some(json!({"key":"k","value":1})),
        ),
    ] {
        assert_eq!(
            call(&f.root, "one", &permissions, method, params, &interaction)["error"]["code"],
            "PERMISSION_DENIED"
        );
    }
    assert!(!f.root.exists());
    let result = call(
        &f.root,
        "one",
        &[PluginPermission::PluginWorkspaces],
        "workspaces.list",
        None,
        &interaction,
    );
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["value"][0]["isDefault"], true);
}

#[test]
fn picker_cancel_invalid_params_and_unknown_lookup_do_not_initialize() {
    let f = Fixture::new();
    assert_eq!(
        f.call(
            "one",
            "workspaces.create",
            Some(json!({"name":"cancel"})),
            &Interaction::default()
        ),
        json!({"ok":true,"value":null})
    );
    assert_eq!(
        f.call(
            "one",
            "workspaces.get",
            Some(json!({"id":"unknown"})),
            &NoInteraction
        )["error"]["code"],
        "WORKSPACE_NOT_FOUND"
    );
    for params in [
        json!({"name":"bad","approved":true}),
        json!({"name":"bad","path":"relative"}),
        json!({"name":" "}),
        json!({"name":"bad","plugins":["one"]}),
    ] {
        assert_eq!(
            f.call("one", "workspaces.create", Some(params), &NoInteraction)["error"]["code"],
            "INVALID_ARGUMENT"
        );
    }
    assert_eq!(
        f.call(
            "one",
            "workspaces.create",
            Some(json!({"name":"picker"})),
            &NoInteraction
        )["error"]["code"],
        "CONFIRMATION_UNAVAILABLE"
    );
    assert!(!f.root.exists());
}

#[test]
fn creation_uses_desktop_initialization_and_preserves_files_and_registry() {
    let f = Fixture::new();
    let path = f.base.join("project");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join("chat.json"), "original chat").unwrap();
    fs::write(f.base.join("config.db"), "host registry stays separate").unwrap();
    let picker = Interaction {
        selected: Some(path.clone()),
        ..Default::default()
    };
    let created = f.call(
        "one",
        "workspaces.create",
        Some(json!({"name":"picked"})),
        &picker,
    );
    assert_eq!(created["ok"], true, "{created}");
    assert_eq!(created["value"]["path"], path.to_str().unwrap());
    let marker = read_marker(&path).unwrap().unwrap();
    assert_eq!(marker.id, created["value"]["id"]);
    assert_eq!(marker.plugins, vec!["one"]);
    assert!(path.join("workspace.db").is_file());
    assert_eq!(
        Connection::open(path.join("workspace.db"))
            .unwrap()
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .unwrap(),
        crate::db::migrations::WORKSPACE_SCHEMA_VERSION
    );
    assert_eq!(
        fs::read_to_string(path.join("chat.json")).unwrap(),
        "original chat"
    );
    assert_eq!(
        fs::read_to_string(f.base.join("config.db")).unwrap(),
        "host registry stays separate"
    );
    assert_eq!(
        f.create("one", &path, &NoInteraction)["value"],
        created["value"],
        "existing registration must not rename or prompt"
    );
    let id = created["value"]["id"].clone();
    assert_eq!(
        f.call(
            "one",
            "workspaces.get",
            Some(json!({"id":id})),
            &NoInteraction
        )["value"],
        created["value"]
    );
    assert_eq!(
        f.call(
            "two",
            "workspaces.get",
            Some(json!({"id":id})),
            &NoInteraction
        )["error"]["code"],
        "WORKSPACE_NOT_FOUND"
    );
    f.call(
        "one",
        "storage.setItem",
        Some(json!({"key":"workspaces","value":"ordinary business key"})),
        &NoInteraction,
    );
    f.call("one", "storage.clear", None, &NoInteraction);
    assert_eq!(
        f.call(
            "one",
            "workspaces.get",
            Some(json!({"id":id})),
            &NoInteraction
        )["value"],
        created["value"]
    );
    assert_eq!(
        f.call("one", "workspaces.list", None, &NoInteraction)["value"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn sharing_requires_confirmation_even_when_marker_claims_membership() {
    let f = Fixture::new();
    let path = f.base.join("shared");
    let first = f.create("one", &path, &NoInteraction);
    let original = fs::read(marker_path(&path)).unwrap();
    let cancel = Interaction::default();
    assert_eq!(
        f.create("two", &path, &cancel),
        json!({"ok":true,"value":null})
    );
    assert_eq!(cancel.members.borrow().as_slice(), ["one"]);
    assert_eq!(fs::read(marker_path(&path)).unwrap(), original);
    assert!(!plugin_data_root(&f.root, "two").exists());
    assert_eq!(
        f.create("two", &path, &NoInteraction)["error"]["code"],
        "CONFIRMATION_UNAVAILABLE"
    );
    let mut marker = read_marker(&path).unwrap().unwrap();
    marker.plugins.push("two".into());
    marker
        .metadata
        .insert("customMetadata".into(), json!({"source":"external"}));
    write_marker(&path, &marker).unwrap();
    let allow = Interaction {
        approved: true,
        ..Default::default()
    };
    let second = f.create("two", &path, &allow);
    assert_eq!(second["ok"], true, "{second}");
    assert_eq!(allow.prompts.get(), 1);
    assert_eq!(second["value"]["id"], first["value"]["id"]);
    assert_eq!(
        read_marker(&path).unwrap().unwrap().metadata["customMetadata"],
        json!({"source":"external"})
    );
    f.call(
        "one",
        "storage.setItem",
        Some(json!({"key":"private","value":123})),
        &NoInteraction,
    );
    assert_eq!(
        f.call(
            "two",
            "storage.getItem",
            Some(json!({"key":"private"})),
            &NoInteraction
        )["value"],
        Value::Null
    );
}

#[test]
fn missing_default_is_retained_and_never_silently_recreated() {
    let f = Fixture::new();
    let initial = f.call("one", "workspaces.list", None, &NoInteraction);
    let record = &initial["value"][0];
    let path = Path::new(record["path"].as_str().unwrap());
    fs::remove_dir_all(path).unwrap();
    assert_eq!(
        f.call("one", "workspaces.list", None, &NoInteraction),
        initial
    );
    assert_eq!(
        f.call(
            "one",
            "workspaces.get",
            Some(json!({"id":record["id"]})),
            &NoInteraction
        )["error"]["code"],
        "WORKSPACE_UNAVAILABLE"
    );
    assert!(!path.exists());
}

#[test]
fn corrupt_missing_future_and_copied_markers_are_not_overwritten() {
    let f = Fixture::new();
    let path = f.base.join("project");
    let first = f.create("one", &path, &NoInteraction);
    let original = fs::read(marker_path(&path)).unwrap();
    let copied = f.base.join("copied");
    fs::create_dir_all(copied.join(".isle")).unwrap();
    fs::write(marker_path(&copied), &original).unwrap();
    assert_eq!(
        f.create("one", &copied, &NoInteraction)["error"]["code"],
        "WORKSPACE_MARKER_INVALID"
    );
    for contents in [b"broken".to_vec(), {
        let mut marker: Value = serde_json::from_slice(&original).unwrap();
        marker["version"] = json!(99);
        serde_json::to_vec(&marker).unwrap()
    }] {
        fs::write(marker_path(&path), &contents).unwrap();
        assert_eq!(
            f.create(
                "two",
                &path,
                &Interaction {
                    approved: true,
                    ..Default::default()
                }
            )["error"]["code"],
            "WORKSPACE_MARKER_INVALID"
        );
        assert_eq!(fs::read(marker_path(&path)).unwrap(), contents);
    }
    fs::remove_file(marker_path(&path)).unwrap();
    assert_eq!(
        f.call(
            "one",
            "workspaces.get",
            Some(json!({"id":first["value"]["id"]})),
            &NoInteraction
        )["error"]["code"],
        "WORKSPACE_MARKER_INVALID"
    );
    assert_eq!(
        f.create("one", &path, &NoInteraction)["error"]["code"],
        "WORKSPACE_MARKER_INVALID"
    );
    assert!(!marker_path(&path).exists());
}

#[test]
fn rechecks_permission_and_marker_after_confirmation() {
    let f = Fixture::new();
    let path = f.base.join("shared");
    f.create("one", &path, &NoInteraction);
    struct Revoked(Cell<bool>);
    impl WorkspaceInteraction for Revoked {
        fn check_active(&self) -> Result<()> {
            if self.0.get() {
                Err(error("PERMISSION_DENIED", "revoked"))
            } else {
                Ok(())
            }
        }
        fn confirm_share(&self, _: &Path, _: &[String]) -> Result<bool> {
            self.0.set(true);
            Ok(true)
        }
    }
    let original = fs::read(marker_path(&path)).unwrap();
    assert_eq!(
        f.create("two", &path, &Revoked(Cell::new(false)))["error"]["code"],
        "PERMISSION_DENIED"
    );
    assert!(!plugin_data_root(&f.root, "two").exists());
    assert_eq!(fs::read(marker_path(&path)).unwrap(), original);
    struct Changed;
    impl WorkspaceInteraction for Changed {
        fn confirm_share(&self, path: &Path, _: &[String]) -> Result<bool> {
            let mut marker = read_marker(path)?.unwrap();
            marker.plugins.push("new-member".into());
            write_marker(path, &marker)?;
            Ok(true)
        }
    }
    assert_eq!(
        f.create("two", &path, &Changed)["error"]["code"],
        "WORKSPACE_UNAVAILABLE"
    );
    assert!(!read_marker(&path)
        .unwrap()
        .unwrap()
        .plugins
        .contains(&"two".into()));
}

#[test]
fn concurrent_joins_preserve_members_and_confirm_latest_snapshot() {
    let f = Fixture::new();
    let path = f.base.join("shared");
    f.create("one", &path, &NoInteraction);
    struct Concurrent(Arc<Barrier>);
    impl WorkspaceInteraction for Concurrent {
        fn confirm_share(&self, _: &Path, _: &[String]) -> Result<bool> {
            self.0.wait();
            Ok(true)
        }
    }
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = ["two", "three"]
        .into_iter()
        .map(|owner| {
            let root = f.root.clone();
            let path = path.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let result = call(
                    &root,
                    owner,
                    &[PluginPermission::PluginWorkspaces],
                    "workspaces.create",
                    Some(json!({"name":owner,"path":path})),
                    &Concurrent(barrier),
                );
                (owner, result)
            })
        })
        .collect();
    for worker in workers {
        let (owner, result) = worker.join().unwrap();
        if result["ok"] != true {
            assert_eq!(result["error"]["code"], "WORKSPACE_UNAVAILABLE", "{result}");
            assert_eq!(
                f.create(
                    owner,
                    &path,
                    &Interaction {
                        approved: true,
                        ..Default::default()
                    }
                )["ok"],
                true
            );
        }
    }
    let marker = read_marker(&path).unwrap().unwrap();
    assert_eq!(marker.plugins.len(), 3);
    for owner in ["one", "two", "three"] {
        assert!(marker.plugins.contains(&owner.into()));
    }
}

#[test]
fn storage_v1_migrates_without_losing_business_data() {
    let f = Fixture::new();
    let directory = plugin_data_root(&f.root, "one");
    fs::create_dir_all(&directory).unwrap();
    let conn = Connection::open(directory.join("storage.sqlite")).unwrap();
    conn.execute_batch("CREATE TABLE plugin_kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO plugin_kv VALUES('old','{\"cursor\":12}'); PRAGMA user_version=1;").unwrap();
    drop(conn);
    assert_eq!(
        f.call("one", "workspaces.list", None, &NoInteraction)["ok"],
        true
    );
    assert_eq!(
        f.call(
            "one",
            "storage.getItem",
            Some(json!({"key":"old"})),
            &NoInteraction
        )["value"],
        json!({"cursor":12})
    );
}

#[cfg(unix)]
#[test]
fn canonical_alias_reuses_registration_but_marker_symlink_is_rejected() {
    use std::os::unix::fs::symlink;
    let f = Fixture::new();
    let path = f.base.join("project");
    let alias = f.base.join("alias");
    let first = f.create("one", &path, &NoInteraction);
    symlink(&path, &alias).unwrap();
    assert_eq!(f.create("one", &alias, &NoInteraction), first);
    let outside = f.base.join("outside.json");
    fs::rename(marker_path(&path), &outside).unwrap();
    symlink(&outside, marker_path(&path)).unwrap();
    assert_eq!(
        f.create("two", &path, &NoInteraction)["error"]["code"],
        "WORKSPACE_MARKER_INVALID"
    );
}

#[test]
fn failed_initialization_does_not_register_or_overwrite_existing_database() {
    let f = Fixture::new();
    let path = f.base.join("broken");
    fs::create_dir_all(&path).unwrap();
    fs::write(path.join("workspace.db"), "not a database; keep original").unwrap();
    let result = f.create("one", &path, &NoInteraction);
    assert_eq!(result["error"]["code"], "WORKSPACE_UNAVAILABLE", "{result}");
    assert!(load(&f.root, "one").unwrap().is_empty());
    assert!(!marker_path(&path).exists());
    assert_eq!(
        fs::read_to_string(path.join("workspace.db")).unwrap(),
        "not a database; keep original"
    );
}
