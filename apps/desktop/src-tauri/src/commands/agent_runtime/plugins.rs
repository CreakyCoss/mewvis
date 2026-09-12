use tauri::AppHandle;

use super::protocol::{
    AgentAccess, AgentRuntimePlugin, AgentRuntimePluginKind, AgentRuntimePluginResources,
};
use crate::services::plugins::{self, PluginPermission, PluginRuntimeKind, RuntimePlugin};

pub(super) struct SessionPlugin {
    pub resources: AgentRuntimePluginResources,
    pub access: AgentAccess,
}

pub(super) fn resolve_session_plugins(
    app: &AppHandle,
    plugin_id: Option<&str>,
) -> Result<Option<SessionPlugin>, String> {
    let Some(plugin_id) = plugin_id else {
        return Ok(None);
    };
    select_session_plugin(plugin_id, plugins::enabled_runtime_plugins(app)?).map(Some)
}

fn select_session_plugin(
    plugin_id: &str,
    registered: Vec<RuntimePlugin>,
) -> Result<SessionPlugin, String> {
    let plugin = registered
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| format!("会话所属插件未启用或不存在：{plugin_id}"))?;
    if !plugin.permissions.contains(&PluginPermission::Chat) {
        return Err(format!("插件未声明 chat 权限：{plugin_id}"));
    }
    let access = match plugin.agent_access {
        Some(access) => access,
        None => serde_json::from_value(serde_json::json!({}))
            .map_err(|error| format!("无法解析空的 Agent 权限声明：{error}"))?,
    };
    Ok(SessionPlugin {
        access,
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
            settings_path: None,
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
        let resources =
            select_session_plugin("owner", vec![plugin("other"), plugin("owner")]).unwrap();
        let items = resources.resources.items.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "owner");
        assert_eq!(items[0].entry, "/owner/index.js");
        assert_eq!(
            items[0].patch_path.as_deref(),
            Some("/owner/cordis.patch.yml")
        );
        assert!(resources.resources.settings_path.is_none());
        assert_eq!(
            serde_json::to_value(resources.access).unwrap(),
            serde_json::json!({})
        );
    }

    #[test]
    fn unavailable_owner_does_not_fall_back_to_other_plugins() {
        assert!(select_session_plugin("missing", vec![plugin("other")],).is_err());
    }

    #[test]
    fn chat_entry_and_access_declaration_are_independent() {
        let mut owner = plugin("owner");
        owner.permissions.clear();
        assert!(select_session_plugin("owner", vec![owner]).is_err());
        let mut owner = plugin("owner");
        let declaration = serde_json::json!({"filesystem": {"read": [{"base": "workspace"}]}, "process": {"execute": false}});
        owner.agent_access = Some(serde_json::from_value(declaration.clone()).unwrap());
        let selected = select_session_plugin("owner", vec![owner]).unwrap();
        assert_eq!(serde_json::to_value(selected.access).unwrap(), declaration);
        assert!(selected.resources.settings_path.is_none());
        assert!(serde_json::from_value::<AgentAccess>(
            serde_json::json!({"filesystem": {"read": [{"base": "pluginData"}]}})
        )
        .is_err());
        assert!(serde_json::from_value::<AgentAccess>(
            serde_json::json!({"filesystem": {"raed": "all"}})
        )
        .is_err());
    }
}
