use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use tauri::AppHandle;

use crate::{
    db::config_db::{
        self, SaveWorkspaceSkillsInput, SkillGroup as DbSkillGroup,
        WorkspaceSkillSettings as DbWorkspaceSkillSettings,
    },
    services::skills::{self as skills_service, SkillSource},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkill {
    pub name: String,
    pub description: String,
    pub content: String,
    pub source: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub source: String,
    pub readonly: bool,
    pub order: i64,
    pub skill_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillSettings {
    pub skills: Vec<WorkspaceSkill>,
    pub groups: Vec<WorkspaceSkillGroup>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSkillMarketplaceInput {
    pub query: String,
    pub sort_by: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveAppSkillInput {
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketplaceSearchResult {
    pub skills: Vec<skills_service::MarketplaceSkill>,
    pub pagination: Option<skills_service::MarketplacePagination>,
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

#[tauri::command]
pub async fn search_skill_marketplace(
    input: SearchSkillMarketplaceInput,
) -> Result<SkillMarketplaceSearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        skills_service::search_skill_marketplace(
            skills_service::SearchSkillMarketplaceOptions {
                query: input.query,
                sort_by: input.sort_by,
                page: input.page,
                limit: input.limit,
            },
        )
        .map(|result| SkillMarketplaceSearchResult {
            skills: result.skills,
            pagination: result.pagination,
        })
    })
    .await
    .map_err(|error| format!("Skill 市场搜索任务失败：{error}"))?
}

#[tauri::command]
pub async fn install_skill_from_marketplace(
    app: AppHandle,
    input: skills_service::InstallSkillRequest,
) -> Result<skills_service::InstalledSkill, String> {
    tauri::async_runtime::spawn_blocking(move || {
        skills_service::install_skill_from_source(&app, input)
    })
    .await
    .map_err(|error| format!("Skill 安装任务失败：{error}"))?
}

#[tauri::command]
pub async fn remove_app_skill(
    app: AppHandle,
    input: RemoveAppSkillInput,
) -> Result<skills_service::RemovedSkill, String> {
    tauri::async_runtime::spawn_blocking(move || {
        skills_service::remove_app_skill(&app, &input.name)
    })
    .await
    .map_err(|error| format!("Skill 移除任务失败：{error}"))?
}

fn load_workspace_skills(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let DbWorkspaceSkillSettings {
        enabled_skill_names,
        skill_groups,
    } = config_db::workspace_skill_settings(app, workspace_id)?;
    let enabled_names = enabled_skill_names.into_iter().collect::<HashSet<_>>();
    let skill_definitions = skills_service::load_available_skills(app)?;
    let available_skill_names = skill_definitions
        .iter()
        .map(|skill| skill.name.clone())
        .collect::<HashSet<_>>();
    let skills = skill_definitions
        .iter()
        .into_iter()
        .map(|skill| WorkspaceSkill {
            enabled: enabled_names.contains(&skill.name),
            name: skill.name.clone(),
            description: skill.description.clone(),
            content: skill.content.clone(),
            source: skill.source.as_str().to_string(),
            path: skill.path.clone(),
        })
        .collect::<Vec<_>>();
    let mut groups = default_skill_groups(&skill_definitions);
    groups.extend(custom_skill_groups(skill_groups, &available_skill_names));
    groups.sort_by(|left, right| {
        left.order
            .cmp(&right.order)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(WorkspaceSkillSettings { skills, groups })
}

fn default_skill_groups(
    skills: &[skills_service::SkillDefinition],
) -> Vec<WorkspaceSkillGroup> {
    let mut groups = BTreeMap::<String, WorkspaceSkillGroup>::new();

    for skill in skills {
        let default_group = skills_service::default_group_for_skill(skill);
        let entry = groups
            .entry(default_group.id.to_string())
            .or_insert_with(|| WorkspaceSkillGroup {
                id: default_group.id.to_string(),
                name: default_group.name.to_string(),
                description: None,
                source: if skill.source == SkillSource::System {
                    "system".to_string()
                } else {
                    "app".to_string()
                },
                readonly: true,
                order: default_group.order,
                skill_names: Vec::new(),
            });
        entry.skill_names.push(skill.name.clone());
    }

    groups
        .into_values()
        .map(|mut group| {
            group.skill_names.sort();
            group.skill_names.dedup();
            group
        })
        .collect()
}

fn custom_skill_groups(
    groups: Vec<DbSkillGroup>,
    available_skill_names: &HashSet<String>,
) -> Vec<WorkspaceSkillGroup> {
    groups
        .into_iter()
        .map(|group| WorkspaceSkillGroup {
            skill_names: group
                .skill_names
                .into_iter()
                .filter(|name| available_skill_names.contains(name))
                .collect(),
            id: group.id,
            name: group.name,
            description: group.description,
            source: "custom".to_string(),
            readonly: false,
            order: 1000 + group.order,
        })
        .filter(|group| !group.skill_names.is_empty())
        .collect()
}
