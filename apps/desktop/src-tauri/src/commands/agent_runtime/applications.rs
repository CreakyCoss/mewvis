use tauri::AppHandle;

use super::protocol::{
    AgentAccess, AgentRuntimeApplication, AgentRuntimeApplicationKind, AgentRuntimeApplicationResources,
};
use crate::services::applications::{self, ApplicationPermission, ApplicationRuntimeKind, RuntimeApplication};

pub(super) struct SessionApplication {
    pub resources: AgentRuntimeApplicationResources,
    pub access: AgentAccess,
}

pub(super) fn resolve_session_applications(
    app: &AppHandle,
    application_id: Option<&str>,
) -> Result<Option<SessionApplication>, String> {
    let Some(application_id) = application_id else {
        return Ok(None);
    };
    select_session_application(application_id, applications::enabled_runtime_applications(app)?).map(Some)
}

fn select_session_application(
    application_id: &str,
    registered: Vec<RuntimeApplication>,
) -> Result<SessionApplication, String> {
    let application = registered
        .into_iter()
        .find(|application| application.id == application_id)
        .ok_or_else(|| format!("会话所属应用未启用或不存在：{application_id}"))?;
    if !application.permissions.contains(&ApplicationPermission::Chat) {
        return Err(format!("应用未声明 chat 权限：{application_id}"));
    }
    let access = match application.agent_access {
        Some(access) => access,
        None => serde_json::from_value(serde_json::json!({}))
            .map_err(|error| format!("无法解析空的 Agent 权限声明：{error}"))?,
    };
    Ok(SessionApplication {
        access,
        resources: AgentRuntimeApplicationResources {
            items: Some(vec![AgentRuntimeApplication {
                kind: match application.kind {
                    ApplicationRuntimeKind::Isle => AgentRuntimeApplicationKind::Isle,
                    ApplicationRuntimeKind::Dsh => AgentRuntimeApplicationKind::Dsh,
                },
                id: application.id,
                entry: application.entry,
                package_root: application.package_root,
                patch_path: application.patch_path,
                config: None,
            }]),
            settings_path: None,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn application(id: &str) -> RuntimeApplication {
        RuntimeApplication {
            kind: ApplicationRuntimeKind::Dsh,
            id: id.to_string(),
            entry: format!("/{id}/index.js"),
            package_root: format!("/{id}"),
            patch_path: Some(format!("/{id}/cordis.patch.yml")),
            agent_access: None,
            permissions: vec![ApplicationPermission::Chat],
        }
    }

    #[test]
    fn application_session_loads_only_its_owner() {
        let resources =
            select_session_application("owner", vec![application("other"), application("owner")]).unwrap();
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
    fn unavailable_owner_does_not_fall_back_to_other_applications() {
        assert!(select_session_application("missing", vec![application("other")],).is_err());
    }

    #[test]
    fn chat_entry_and_access_declaration_are_independent() {
        let mut owner = application("owner");
        owner.permissions.clear();
        assert!(select_session_application("owner", vec![owner]).is_err());
        let mut owner = application("owner");
        let declaration = serde_json::json!({"filesystem": {"read": [{"base": "workspace"}]}, "process": {"execute": false}});
        owner.agent_access = Some(serde_json::from_value(declaration.clone()).unwrap());
        let selected = select_session_application("owner", vec![owner]).unwrap();
        assert_eq!(serde_json::to_value(selected.access).unwrap(), declaration);
        assert!(selected.resources.settings_path.is_none());
        assert!(serde_json::from_value::<AgentAccess>(
            serde_json::json!({"filesystem": {"read": [{"base": "applicationData"}]}})
        )
        .is_err());
        assert!(serde_json::from_value::<AgentAccess>(
            serde_json::json!({"filesystem": {"raed": "all"}})
        )
        .is_err());
    }
}
