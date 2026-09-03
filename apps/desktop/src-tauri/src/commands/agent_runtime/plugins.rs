use std::collections::BTreeMap;

use tauri::AppHandle;

use super::protocol::{AgentRuntimeDshPlugin, AgentRuntimePluginResources, AgentRuntimeResources};
use crate::services::plugins::{self, RuntimeDshPlugin};

pub(super) fn inject_registered_dsh_plugins(
    app: &AppHandle,
    resources: &mut AgentRuntimeResources,
) -> Result<(), String> {
    merge_dsh_plugins(
        resources,
        plugins::enabled_runtime_plugins(app)?,
        plugins::dsh_settings_location(app)?,
    );
    Ok(())
}

fn merge_dsh_plugins(
    resources: &mut AgentRuntimeResources,
    registered: Vec<RuntimeDshPlugin>,
    default_settings_location: String,
) {
    let requested = resources.plugins.take();
    let requested_dsh = requested.as_ref().and_then(|plugins| plugins.dsh.clone());
    if registered.is_empty() && requested_dsh.is_none() {
        resources.plugins = requested;
        return;
    }

    let mut plugins = BTreeMap::<String, AgentRuntimeDshPlugin>::new();
    for plugin in registered {
        plugins.insert(
            plugin.id.clone(),
            AgentRuntimeDshPlugin {
                id: plugin.id,
                specifier: (!plugin.specifier.is_empty()).then_some(plugin.specifier),
                package_root: Some(plugin.package_root),
                patch_path: Some(plugin.patch_path),
                package_name: Some(plugin.package_name),
                config: None,
            },
        );
    }
    for plugin in requested_dsh.unwrap_or_default() {
        plugins.insert(plugin.id.clone(), plugin);
    }
    let settings_path = requested
        .as_ref()
        .and_then(|plugins| plugins.settings_path.clone())
        .or(Some(default_settings_location));
    resources.plugins = Some(AgentRuntimePluginResources {
        dsh: Some(plugins.into_values().collect()),
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
            dsh: Some(vec![AgentRuntimeDshPlugin {
                id: "sample".to_string(),
                specifier: Some("/request/index.js".to_string()),
                package_root: None,
                patch_path: None,
                package_name: None,
                config: None,
            }]),
            settings_path: None,
        });
        merge_dsh_plugins(
            &mut resources,
            vec![RuntimeDshPlugin {
                id: "sample".to_string(),
                specifier: "/registry/index.js".to_string(),
                package_root: "/registry".to_string(),
                patch_path: "/registry/cordis.patch.yml".to_string(),
                package_name: "sample".to_string(),
            }],
            "/app/plugins".to_string(),
        );
        let plugins = resources.plugins.unwrap();
        assert_eq!(plugins.settings_path.as_deref(), Some("/app/plugins"));
        assert_eq!(
            plugins.dsh.unwrap()[0].specifier.as_deref(),
            Some("/request/index.js")
        );
    }

    #[test]
    fn explicit_settings_path_overrides_the_registry_default() {
        let mut resources = empty_resources();
        resources.plugins = Some(AgentRuntimePluginResources {
            dsh: Some(vec![]),
            settings_path: Some("/request/settings.yaml".to_string()),
        });

        merge_dsh_plugins(&mut resources, vec![], "/app/plugins".to_string());

        assert_eq!(
            resources.plugins.unwrap().settings_path.as_deref(),
            Some("/request/settings.yaml")
        );
    }
}
