use tauri::AppHandle;

use super::protocol::{AgentRuntimePlugin, AgentRuntimePluginKind, AgentRuntimePluginResources};
use crate::services::plugins::{self, PluginRuntimeKind, RuntimePlugin};

pub(super) fn resolve_session_plugins(
    app: &AppHandle,
    plugin_id: Option<&str>,
) -> Result<Option<AgentRuntimePluginResources>, String> {
    let Some(plugin_id) = plugin_id else {
        return Ok(None);
    };
    select_session_plugin(
        plugin_id,
        plugins::enabled_runtime_plugins(app)?,
        plugins::settings_location(app)?,
    )
    .map(Some)
}

fn select_session_plugin(
    plugin_id: &str,
    registered: Vec<RuntimePlugin>,
    settings_path: String,
) -> Result<AgentRuntimePluginResources, String> {
    let plugin = registered
        .into_iter()
        .find(|plugin| plugin.id == plugin_id)
        .ok_or_else(|| format!("会话所属插件未启用或不存在：{plugin_id}"))?;
    Ok(AgentRuntimePluginResources {
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
        settings_path: Some(settings_path),
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
        let items = resources.items.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, "owner");
        assert_eq!(items[0].entry, "/owner/index.js");
        assert_eq!(
            items[0].patch_path.as_deref(),
            Some("/owner/cordis.patch.yml")
        );
        assert_eq!(resources.settings_path.as_deref(), Some("/app/plugins"));
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
}
