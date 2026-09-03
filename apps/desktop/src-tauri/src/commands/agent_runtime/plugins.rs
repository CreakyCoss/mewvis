use std::collections::BTreeMap;

use tauri::AppHandle;

use super::protocol::{
    AgentRuntimePlugin, AgentRuntimePluginKind, AgentRuntimePluginResources, AgentRuntimeResources,
};
use crate::services::plugins::{self, PluginRuntimeKind, RuntimePlugin};

pub(super) fn inject_registered_plugins(
    app: &AppHandle,
    resources: &mut AgentRuntimeResources,
) -> Result<(), String> {
    merge_plugins(
        resources,
        plugins::enabled_runtime_plugins(app)?,
        plugins::settings_location(app)?,
    );
    Ok(())
}

fn merge_plugins(
    resources: &mut AgentRuntimeResources,
    registered: Vec<RuntimePlugin>,
    default_settings_location: String,
) {
    let requested = resources.plugins.take();
    let requested_items = requested.as_ref().and_then(|plugins| plugins.items.clone());
    if registered.is_empty() && requested_items.is_none() {
        resources.plugins = requested;
        return;
    }

    let mut plugins = BTreeMap::<String, AgentRuntimePlugin>::new();
    for plugin in registered {
        plugins.insert(
            plugin.id.clone(),
            AgentRuntimePlugin {
                kind: match plugin.kind {
                    PluginRuntimeKind::Isle => AgentRuntimePluginKind::Isle,
                    PluginRuntimeKind::Dsh => AgentRuntimePluginKind::Dsh,
                },
                id: plugin.id,
                entry: plugin.entry,
                package_root: plugin.package_root,
                patch_path: plugin.patch_path,
                config: None,
            },
        );
    }
    for plugin in requested_items.unwrap_or_default() {
        plugins.insert(plugin.id.clone(), plugin);
    }
    let settings_path = requested
        .as_ref()
        .and_then(|plugins| plugins.settings_path.clone())
        .or(Some(default_settings_location));
    resources.plugins = Some(AgentRuntimePluginResources {
        items: Some(plugins.into_values().collect()),
        settings_path,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_resources() -> AgentRuntimeResources {
        AgentRuntimeResources {
            tools: None,
            skills: None,
            mcp: None,
            plugins: None,
        }
    }

    #[test]
    fn explicit_plugin_overrides_registered_plugin_with_the_same_id() {
        let mut resources = empty_resources();
        resources.plugins = Some(AgentRuntimePluginResources {
            items: Some(vec![AgentRuntimePlugin {
                kind: AgentRuntimePluginKind::Isle,
                id: "sample".to_string(),
                entry: "/request/index.js".to_string(),
                package_root: "/request".to_string(),
                patch_path: None,
                config: None,
            }]),
            settings_path: None,
        });
        merge_plugins(
            &mut resources,
            vec![RuntimePlugin {
                kind: PluginRuntimeKind::Dsh,
                id: "sample".to_string(),
                entry: "/registry/index.js".to_string(),
                package_root: "/registry".to_string(),
                patch_path: Some("/registry/cordis.patch.yml".to_string()),
            }],
            "/app/plugins".to_string(),
        );
        let plugins = resources.plugins.unwrap();
        assert_eq!(plugins.settings_path.as_deref(), Some("/app/plugins"));
        assert_eq!(plugins.items.unwrap()[0].entry, "/request/index.js");
    }

    #[test]
    fn explicit_settings_path_overrides_the_registry_default() {
        let mut resources = empty_resources();
        resources.plugins = Some(AgentRuntimePluginResources {
            items: Some(vec![]),
            settings_path: Some("/request/settings.yaml".to_string()),
        });

        merge_plugins(&mut resources, vec![], "/app/plugins".to_string());

        assert_eq!(
            resources.plugins.unwrap().settings_path.as_deref(),
            Some("/request/settings.yaml")
        );
    }
}
