use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use tauri::AppHandle;

use crate::{
    db::config_db::{
        self, SaveWorkspaceSkillsInput, SkillGroup as DbSkillGroup,
        WorkspaceSkillSettings as DbWorkspaceSkillSettings,
    },
    services::skills as skills_service,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkill {
    pub key: String,
    pub name: String,
    pub description: String,
    pub content: String,
    pub source: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub source: String,
    pub readonly: bool,
    pub is_default: bool,
    pub order: i64,
    pub skill_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillSettings {
    pub skills: Vec<WorkspaceSkill>,
    pub groups: Vec<WorkspaceSkillGroup>,
    pub default_group_id: String,
}

const ALL_SKILLS_GROUP_ID: &str = "all";

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
    pub name: Option<String>,
    pub key: Option<String>,
    pub path: Option<String>,
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
        skills_service::search_skill_marketplace(skills_service::SearchSkillMarketplaceOptions {
            query: input.query,
            sort_by: input.sort_by,
            page: input.page,
            limit: input.limit,
        })
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
        skills_service::remove_app_skill(
            &app,
            input.name.as_deref(),
            input.key.as_deref(),
            input.path.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("Skill 移除任务失败：{error}"))?
}

fn load_workspace_skills(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let DbWorkspaceSkillSettings {
        default_group_id,
        skill_groups,
    } = config_db::workspace_skill_settings(app, workspace_id)?;
    let skill_definitions = skills_service::load_available_skills(app)?;
    let available_skill_keys = skill_definitions
        .iter()
        .map(|skill| skill.key.clone())
        .collect::<HashSet<_>>();
    let legacy_skill_key_by_name = legacy_skill_key_by_name(&skill_definitions);
    let skills = skill_definitions
        .iter()
        .map(|skill| WorkspaceSkill {
            key: skill.key.clone(),
            name: skill.name.clone(),
            description: skill.description.clone(),
            content: skill.content.clone(),
            source: skill.source.as_str().to_string(),
            path: skill.path.clone(),
        })
        .collect::<Vec<_>>();
    let mut groups = default_skill_groups(&skill_definitions);
    groups.extend(custom_skill_groups(
        skill_groups,
        &available_skill_keys,
        &legacy_skill_key_by_name,
    ));
    groups.sort_by(|left, right| {
        left.order
            .cmp(&right.order)
            .then_with(|| left.name.cmp(&right.name))
    });
    let default_group_id = resolve_default_group_id(default_group_id.as_deref(), &groups);
    for group in &mut groups {
        group.is_default = group.id == default_group_id;
    }

    Ok(WorkspaceSkillSettings {
        skills,
        groups,
        default_group_id,
    })
}

fn default_skill_groups(skills: &[skills_service::SkillDefinition]) -> Vec<WorkspaceSkillGroup> {
    let mut groups = BTreeMap::<String, WorkspaceSkillGroup>::new();

    for skill in skills {
        if skill.source.as_str() == "app" {
            continue;
        }
        let default_group = skills_service::default_group_for_skill(skill);
        let entry = groups
            .entry(default_group.id.to_string())
            .or_insert_with(|| WorkspaceSkillGroup {
                id: default_group.id.to_string(),
                name: default_group.name.to_string(),
                description: None,
                source: skill.source.as_str().to_string(),
                readonly: true,
                is_default: false,
                order: default_group.order,
                skill_names: Vec::new(),
            });
        entry.skill_names.push(skill.key.clone());
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
    available_skill_keys: &HashSet<String>,
    legacy_skill_key_by_name: &BTreeMap<String, String>,
) -> Vec<WorkspaceSkillGroup> {
    groups
        .into_iter()
        .map(|group| WorkspaceSkillGroup {
            skill_names: resolve_skill_identifiers(
                group.skill_names,
                available_skill_keys,
                legacy_skill_key_by_name,
            ),
            id: group.id,
            name: group.name,
            description: group.description,
            source: "custom".to_string(),
            readonly: false,
            is_default: false,
            order: 1000 + group.order,
        })
        .filter(|group| !group.skill_names.is_empty())
        .collect()
}

fn resolve_skill_identifiers(
    identifiers: Vec<String>,
    available_skill_keys: &HashSet<String>,
    legacy_skill_key_by_name: &BTreeMap<String, String>,
) -> Vec<String> {
    let mut resolved = identifiers
        .into_iter()
        .filter_map(|identifier| {
            if available_skill_keys.contains(&identifier) {
                Some(identifier)
            } else {
                legacy_skill_key_by_name.get(&identifier).cloned()
            }
        })
        .collect::<Vec<_>>();

    resolved.sort();
    resolved.dedup();
    resolved
}

fn resolve_default_group_id(
    default_group_id: Option<&str>,
    groups: &[WorkspaceSkillGroup],
) -> String {
    let Some(group_id) = default_group_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return ALL_SKILLS_GROUP_ID.to_string();
    };

    if group_id == ALL_SKILLS_GROUP_ID || groups.iter().any(|group| group.id == group_id) {
        return group_id.to_string();
    }

    ALL_SKILLS_GROUP_ID.to_string()
}

fn legacy_skill_key_by_name(
    skills: &[skills_service::SkillDefinition],
) -> BTreeMap<String, String> {
    let mut candidates = BTreeMap::<String, Vec<&skills_service::SkillDefinition>>::new();
    for skill in skills {
        candidates
            .entry(skill.name.clone())
            .or_default()
            .push(skill);
    }

    candidates
        .into_iter()
        .filter_map(|(name, mut skills)| {
            skills.sort_by(|left, right| {
                legacy_source_rank(left.source.as_str())
                    .cmp(&legacy_source_rank(right.source.as_str()))
                    .then_with(|| left.path.cmp(&right.path))
            });
            skills.first().map(|skill| (name, skill.key.clone()))
        })
        .collect()
}

fn legacy_source_rank(source: &str) -> i32 {
    match source {
        "system" => 0,
        "app" => 1,
        "upload" => 2,
        _ => 3,
    }
}
