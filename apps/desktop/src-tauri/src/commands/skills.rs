use serde::Serialize;
use std::{collections::HashSet, fs, path::PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::db::config_db::{
    self, SaveWorkspaceSkillsInput, WorkspaceSkillSettings as DbWorkspaceSkillSettings,
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

pub fn bundled_skills_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../resources/skills")
        .clean();
    if dev_path.exists() {
        return Ok(Some(dev_path));
    }

    for candidate in ["_up_/resources/skills", "resources/skills", "skills"] {
        let path = app
            .path()
            .resolve(candidate, BaseDirectory::Resource)
            .map_err(|error| format!("定位 Skills 资源失败：{error}"))?;
        if path.exists() {
            return Ok(Some(path));
        }
    }

    Ok(None)
}

fn load_workspace_skills(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<WorkspaceSkillSettings, String> {
    let DbWorkspaceSkillSettings {
        enabled_skill_names,
    } = config_db::workspace_skill_settings(app, workspace_id)?;
    let enabled_names = enabled_skill_names.into_iter().collect::<HashSet<_>>();
    let Some(skills_path) = bundled_skills_path(app)? else {
        return Ok(WorkspaceSkillSettings { skills: Vec::new() });
    };

    let mut skills = scan_skills(&skills_path)?
        .into_iter()
        .map(|mut skill| {
            skill.enabled = enabled_names.contains(&skill.name);
            skill
        })
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(WorkspaceSkillSettings { skills })
}

fn scan_skills(root: &PathBuf) -> Result<Vec<WorkspaceSkill>, String> {
    let mut skills = Vec::new();
    scan_skills_dir(root, &mut skills)?;
    Ok(skills)
}

fn scan_skills_dir(dir: &PathBuf, skills: &mut Vec<WorkspaceSkill>) -> Result<(), String> {
    let skill_file = dir.join("SKILL.md");
    if skill_file.is_file() {
        skills.push(read_skill(&skill_file, dir)?);
        return Ok(());
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => return Err(format!("无法读取 Skills 目录：{error}")),
    };

    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取 Skill 条目：{error}"))?;
        let path = entry.path();
        if path.is_dir() {
            scan_skills_dir(&path, skills)?;
        }
    }

    Ok(())
}

fn read_skill(skill_file: &PathBuf, base_dir: &PathBuf) -> Result<WorkspaceSkill, String> {
    let content = fs::read_to_string(skill_file).map_err(|error| {
        format!(
            "无法读取 Skill 文件 {}：{error}",
            skill_file.to_string_lossy()
        )
    })?;
    let (name, description) = parse_skill_frontmatter(&content);
    let fallback_name = base_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill")
        .to_string();

    Ok(WorkspaceSkill {
        name: name.unwrap_or(fallback_name),
        description: description.unwrap_or_default(),
        content,
        enabled: false,
    })
}

fn parse_skill_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    if !content.starts_with("---\n") {
        return (None, None);
    }

    let Some(end_index) = content[4..].find("\n---") else {
        return (None, None);
    };
    let frontmatter = &content[4..4 + end_index];
    let mut name = None;
    let mut description = None;

    let lines = frontmatter.lines().collect::<Vec<_>>();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        if let Some(value) = line.strip_prefix("name:") {
            name = Some(trim_frontmatter_value(value));
        } else if let Some(value) = line.strip_prefix("description:") {
            let value = value.trim();
            if value == "|"
                || value == "|-"
                || value == "|+"
                || value == ">"
                || value == ">-"
                || value == ">+"
            {
                let (block, next_index) = read_frontmatter_block(&lines, index + 1);
                description = Some(block);
                index = next_index;
                continue;
            }
            description = Some(trim_frontmatter_value(value));
        }
        index += 1;
    }

    (name, description)
}

fn read_frontmatter_block(lines: &[&str], start_index: usize) -> (String, usize) {
    let mut block_lines = Vec::new();
    let mut index = start_index;

    while index < lines.len() {
        let line = lines[index];
        if !line.starts_with(' ') && !line.starts_with('\t') && line.contains(':') {
            break;
        }
        block_lines.push(line.trim());
        index += 1;
    }

    (block_lines.join("\n").trim().to_string(), index)
}

fn trim_frontmatter_value(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

trait CleanPath {
    fn clean(self) -> Self;
}

impl CleanPath for PathBuf {
    fn clean(self) -> Self {
        let mut cleaned = PathBuf::new();
        for component in self.components() {
            cleaned.push(component);
        }
        cleaned
    }
}
