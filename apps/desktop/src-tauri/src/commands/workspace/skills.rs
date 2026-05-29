use serde::Serialize;
use std::collections::HashSet;
use tauri::AppHandle;

use crate::{
    db::config_db::{
        self, SaveWorkspaceSkillsInput, WorkspaceSkillSettings as DbWorkspaceSkillSettings,
    },
    services::skills as skills_service,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkill {
    pub name: String,
    pub description: String,
    pub content: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillSettings {
    pub skills: Vec<WorkspaceSkill>,
}

#[tauri::command]
pub fn get_workspace_skills(
    app: AppHandle,
    workspace_id: String,
) -> Result<WorkspaceSkillSettings, String> {
    load_workspace_skills(&app, &workspace_id)
}

#[tauri::command]
pub fn save_workspace_skills(
    app: AppHandle,
    input: SaveWorkspaceSkillsInput,
) -> Result<WorkspaceSkillSettings, String> {
    let workspace_id = input.workspace_id.clone();
    config_db::save_workspace_skill_settings(&app, input)?;
    load_workspace_skills(&app, &workspace_id)
}

fn load_workspace_skills(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let DbWorkspaceSkillSettings {
        enabled_skill_names,
    } = config_db::workspace_skill_settings(app, workspace_id)?;
    let enabled_names = enabled_skill_names.into_iter().collect::<HashSet<_>>();
    let skills = skills_service::load_bundled_skills(app)?
        .into_iter()
        .map(|skill| WorkspaceSkill {
            enabled: enabled_names.contains(&skill.name),
            name: skill.name,
            description: skill.description,
            content: skill.content,
        })
        .collect::<Vec<_>>();

    Ok(WorkspaceSkillSettings { skills })
}
