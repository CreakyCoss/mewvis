use tauri::AppHandle;

use super::protocol::{
    AgentAccess, AgentAccessRoots, AgentRuntimePlugin, AgentRuntimePluginKind,
    AgentRuntimePluginResources,
};
use crate::services::plugins::{self, PluginPermission, PluginRuntimeKind, RuntimePlugin};

pub(super) struct SessionPlugin {
    pub resources: AgentRuntimePluginResources,
    pub access: AgentAccess,
    pub roots: AgentAccessRoots,
}

pub(super) fn resolve_session_plugins(
    app: &AppHandle,
    plugin_id: Option<&str>,
) -> Result<Option<SessionPlugin>, String> {
    let Some(plugin_id) = plugin_id else {
        return Ok(None);
    };
    let settings_root = std::path::PathBuf::from(plugins::settings_location(app)?);
    std::fs::create_dir_all(&settings_root).map_err(|error| error.to_string())?;
    let settings_root = std::fs::canonicalize(settings_root).map_err(|error| error.to_string())?;
    let plugin = select_session_plugin(
        plugin_id,
        plugins::enabled_runtime_plugins(app)?,
        settings_root.to_string_lossy().to_string(),
    )?;
    if let Some(path) = &plugin.roots.plugin_data {
        // A plugin must not redirect its next request's data grant with a symlink.
        for component in std::path::Path::new(path)
            .ancestors()
            .take_while(|path| *path != settings_root)
        {
            match std::fs::symlink_metadata(component) {
                Ok(metadata) if metadata.file_type().is_symlink() => {
                    return Err("插件数据目录不能包含符号链接".into())
                }
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                    return Err(error.to_string())
                }
                _ => {}
            }
        }
        std::fs::create_dir_all(path)
            .map_err(|error| format!("无法初始化插件数据目录：{error}"))?;
    }
    Ok(Some(plugin))
}

fn select_session_plugin(
    plugin_id: &str,
    registered: Vec<RuntimePlugin>,
    settings_path: String,
) -> Result<SessionPlugin, String> {
    let plugin = registered
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| format!("会话所属插件未启用或不存在：{plugin_id}"))?;
    if !plugin.permissions.contains(&PluginPermission::Chat) {
        return Err(format!("插件未声明 chat 权限：{plugin_id}"));
    }
    // An encoded, segmented identity cannot escape the data root or collide with another plugin.
    let mut data_path = std::path::PathBuf::from(settings_path).join("data");
    for part in plugin_id.as_bytes().chunks(48) {
        data_path.push(
            part.iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>(),
        );
    }
    data_path.push("data");
    let data_path = data_path.to_string_lossy().to_string();
    let access = match plugin.agent_access {
        Some(access) => access,
        None => serde_json::from_value(serde_json::json!({}))
            .map_err(|error| format!("无法解析空的 Agent 权限声明：{error}"))?,
    };
    Ok(SessionPlugin {
        access,
        roots: AgentAccessRoots {
            plugin_data: Some(data_path.clone()),
        },
        resources: AgentRuntimePluginResources {
            items: Some(vec![AgentRuntimePlugin {
                kind: match plugin.kind {
                    PluginRuntimeKind::Isle => AgentRuntimePluginKind::Isle,
                    PluginRuntimeKind::Dsh => AgentRuntimePluginKind::Dsh,
                },
                id: plugin.id,
                entry: plugin.entry,
                package_root: plugin.package_root,
                patch_path: plugin.patch_path,
                config: None,
            }]),
            settings_path: Some(data_path),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plugin(id: &str) -> RuntimePlugin {
        RuntimePlugin {
            kind: PluginRuntimeKind::Dsh,
            id: id.to_string(),
            entry: format!("/{id}/index.js"),
            package_root: format!("/{id}"),
            patch_path: Some(format!("/{id}/cordis.patch.yml")),
            agent_access: None,
            permissions: vec![PluginPermission::Chat],
        }
    }

    #[test]
    fn plugin_session_loads_only_its_owner() {
        let resources = select_session_plugin(
            "owner",
            vec![plugin("other"), plugin("owner")],
            "/app/plugins".to_string(),
        )
        .unwrap();
        let items = resources.resources.items.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "owner");
        assert_eq!(items[0].entry, "/owner/index.js");
        assert_eq!(
            items[0].patch_path.as_deref(),
            Some("/owner/cordis.patch.yml")
        );
        assert_eq!(
            resources.resources.settings_path,
            resources.roots.plugin_data
        );
        assert_eq!(
            serde_json::to_value(resources.access).unwrap(),
            serde_json::json!({})
        );
    }

    #[test]
    fn unavailable_owner_does_not_fall_back_to_other_plugins() {
        assert!(select_session_plugin(
            "missing",
            vec![plugin("other")],
            "/app/plugins".to_string()
        )
        .is_err());
    }

    #[test]
    fn chat_entry_and_access_declaration_are_independent() {
        let mut owner = plugin("owner");
        owner.permissions.clear();
        assert!(select_session_plugin("owner", vec![owner], "/app/plugins".into()).is_err());
        let mut owner = plugin("owner");
        let declaration = serde_json::json!({"filesystem": {"read": [{"base": "workspace"}]}, "process": {"execute": false}});
        owner.agent_access = Some(serde_json::from_value(declaration.clone()).unwrap());
        let selected = select_session_plugin("owner", vec![owner], "/app/plugins".into()).unwrap();
        assert_eq!(serde_json::to_value(selected.access).unwrap(), declaration);
        assert_ne!(
            selected.roots.plugin_data,
            select_session_plugin("other", vec![plugin("other")], "/app/plugins".into())
                .unwrap()
                .roots
                .plugin_data
        );
        assert!(serde_json::from_value::<AgentAccess>(
            serde_json::json!({"filesystem": {"raed": "all"}})
        )
        .is_err());
    }
}
